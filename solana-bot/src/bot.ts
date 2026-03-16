import { DexScreenerClient } from './dexscreener.js';
import { TokenAnalyzer } from './analyzer.js';
import { TelegramNotifier } from './telegram.js';
import { SignalDatabase } from './database.js';
import type { BotConfig, TokenSignal } from './types.js';

/**
 * Main orchestrator that wires together DexScreener scanning, pattern
 * analysis, deduplication, and Telegram alerts.
 *
 * Lifecycle:
 * ```
 * const bot = new SolanaBot(config);
 * await bot.start();   // begins scanning loop
 * await bot.stop();    // graceful shutdown
 * ```
 */
export class SolanaBot {
  private readonly dex: DexScreenerClient;
  private readonly analyzer: TokenAnalyzer;
  private readonly notifier: TelegramNotifier;
  private readonly db: SignalDatabase;
  private readonly config: BotConfig;

  private running = false;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private scanCount = 0;

  constructor(config: BotConfig) {
    this.config = config;
    this.dex = new DexScreenerClient();
    this.analyzer = new TokenAnalyzer(config);
    this.notifier = new TelegramNotifier(config);
    this.db = new SignalDatabase(config.dbPath);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start the bot.  Sends a startup notification (unless in backtest mode)
   * and begins the recurring scan loop.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[SolanaBot] Starting…');
    console.log(`[SolanaBot] Scan interval: ${this.config.scanIntervalMs / 1000}s`);
    console.log(`[SolanaBot] Backtest mode: ${this.config.backtestMode}`);

    if (!this.config.backtestMode) {
      await this.notifier
        .sendStatusMessage(
          '🤖 <b>Solana Token Analyzer Bot started!</b>\n\n' +
          `Scanning every ${this.config.scanIntervalMs / 1000}s for volume spikes and pump patterns.\n` +
          `Min score: ${this.config.minSignalScore}/100`,
        )
        .catch((err: unknown) => console.error('[SolanaBot] Telegram startup message failed:', err));
    }

    await this.runScan();
    this.scheduleNext();
  }

  /**
   * Gracefully shut down the bot.
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.db.close();
    console.log('[SolanaBot] Stopped.');
  }

  // ---------------------------------------------------------------------------
  // Internal scan loop
  // ---------------------------------------------------------------------------

  private scheduleNext(): void {
    if (!this.running) return;
    this.scanTimer = setTimeout(async () => {
      await this.runScan();
      this.scheduleNext();
    }, this.config.scanIntervalMs);
  }

  private async runScan(): Promise<void> {
    this.scanCount++;
    const scanLabel = `Scan #${this.scanCount}`;
    console.log(`[SolanaBot] ${scanLabel} started`);

    try {
      const pairs = await this.dex.getActiveSolanaPairs();
      console.log(`[SolanaBot] ${scanLabel}: ${pairs.length} pairs fetched`);

      const signals: TokenSignal[] = [];

      for (const pair of pairs) {
        const signal = this.analyzer.analyze(pair);
        if (!signal) continue;

        // Deduplicate: skip if still in cooldown
        if (this.db.isOnCooldown(pair.pairAddress, this.config.signalCooldownMs)) {
          console.log(
            `[SolanaBot] Skipping ${pair.baseToken.symbol} (cooldown active)`,
          );
          continue;
        }

        signals.push(signal);
      }

      console.log(`[SolanaBot] ${scanLabel}: ${signals.length} new signal(s)`);

      for (const signal of signals) {
        await this.processSignal(signal);
      }
    } catch (err: unknown) {
      console.error(`[SolanaBot] ${scanLabel} error:`, err);
    }
  }

  private async processSignal(signal: TokenSignal): Promise<void> {
    const { pair, totalScore, signalTypes } = signal;
    const symbol = pair.baseToken.symbol;

    console.log(
      `[SolanaBot] Signal: ${symbol} | Score: ${totalScore} | Patterns: ${signalTypes.join(', ')}`,
    );

    // Persist signal to database
    this.db.saveSignal({
      pairAddress: pair.pairAddress,
      tokenAddress: pair.baseToken.address,
      tokenSymbol: symbol,
      signalTypes: JSON.stringify(signalTypes),
      score: totalScore,
      priceUsd: pair.priceUsd ?? '0',
      volumeH1: pair.volume?.h1 ?? 0,
      marketCap: pair.marketCap ?? pair.fdv ?? 0,
      createdAt: signal.timestamp,
    });

    // Send Telegram alert (unless in backtest mode)
    if (!this.config.backtestMode) {
      try {
        await this.notifier.sendSignalAlert(signal);
        console.log(`[SolanaBot] Alert sent for ${symbol}`);
      } catch (err: unknown) {
        console.error(`[SolanaBot] Failed to send alert for ${symbol}:`, err);
      }
    } else {
      console.log(`[SolanaBot] [BACKTEST] Would have sent alert for ${symbol}`);
    }
  }
}
