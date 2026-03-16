import axios from 'axios';
import type { BotConfig, TokenSignal } from './types.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sends formatted trading signal alerts via the Telegram Bot API.
 *
 * Communicates with Telegram using plain HTTPS requests (via axios) so that
 * no additional SDK dependencies — and their transitive vulnerability chains —
 * are required.
 *
 * Uses HTML parse mode so messages render correctly on both mobile and desktop
 * Telegram clients.
 */
export class TelegramNotifier {
  private readonly apiUrl: string;
  private readonly chatId: string;

  constructor(config: BotConfig) {
    this.apiUrl = `${TELEGRAM_API_BASE}/bot${config.telegramBotToken}`;
    this.chatId = config.telegramChatId;
  }

  /**
   * Send a signal alert for a detected token opportunity.
   */
  async sendSignalAlert(signal: TokenSignal): Promise<void> {
    const message = this.formatSignalMessage(signal);
    await this.sendMessage(message);
  }

  /**
   * Send a plain-text status message (e.g., bot started / stopped).
   */
  async sendStatusMessage(text: string): Promise<void> {
    await this.sendMessage(text);
  }

  // ---------------------------------------------------------------------------
  // Low-level HTTP helper
  // ---------------------------------------------------------------------------

  private async sendMessage(text: string): Promise<void> {
    await axios.post(
      `${this.apiUrl}/sendMessage`,
      {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  }

  // ---------------------------------------------------------------------------
  // Message formatting
  // ---------------------------------------------------------------------------

  private formatSignalMessage(signal: TokenSignal): string {
    const { pair, patterns, totalScore, signalTypes } = signal;
    const token = pair.baseToken;

    const priceUsd = parseFloat(pair.priceUsd ?? '0');
    const marketCap = pair.marketCap ?? pair.fdv ?? 0;
    const liquidity = pair.liquidity?.usd ?? 0;
    const vol1h = pair.volume?.h1 ?? 0;
    const vol24h = pair.volume?.h24 ?? 0;
    const change1h = pair.priceChange?.h1 ?? 0;
    const change24h = pair.priceChange?.h24 ?? 0;

    const confidenceEmoji = this.confidenceEmoji(totalScore);
    const signalLabels = signalTypes
      .map((t) => `#${t.replace(/_/g, '')}`)
      .join(' ');

    const detectedPatterns = patterns
      .filter((p) => p.detected)
      .map((p) => `  • <b>${p.type.replace(/_/g, ' ')}</b>: ${p.details}`)
      .join('\n');

    const dexUrl = pair.url ?? `https://dexscreener.com/solana/${pair.pairAddress}`;
    const birdeyeUrl = `https://birdeye.so/token/${token.address}?chain=solana`;
    const solscanUrl = `https://solscan.io/token/${token.address}`;

    return [
      `${confidenceEmoji} <b>SOLANA SIGNAL DETECTED</b> ${confidenceEmoji}`,
      '',
      `<b>Token:</b> ${token.name} (<code>${token.symbol}</code>)`,
      `<b>Contract:</b> <code>${token.address}</code>`,
      '',
      `<b>📊 Price:</b> $${this.formatPrice(priceUsd)}`,
      `<b>📈 Change:</b> 1h ${this.formatChange(change1h)} | 24h ${this.formatChange(change24h)}`,
      `<b>💧 Liquidity:</b> $${this.formatNumber(liquidity)}`,
      `<b>📉 Market Cap:</b> $${this.formatNumber(marketCap)}`,
      `<b>⚡ Volume 1h:</b> $${this.formatNumber(vol1h)}`,
      `<b>⚡ Volume 24h:</b> $${this.formatNumber(vol24h)}`,
      '',
      `<b>🎯 Signal Strength:</b> ${totalScore}/100`,
      `<b>🔎 Patterns:</b>`,
      detectedPatterns,
      '',
      `<b>🔗 Links:</b>`,
      `  • <a href="${dexUrl}">DexScreener Chart</a>`,
      `  • <a href="${birdeyeUrl}">Birdeye</a>`,
      `  • <a href="${solscanUrl}">Solscan</a>`,
      '',
      `${signalLabels} #Solana`,
    ].join('\n');
  }

  private confidenceEmoji(score: number): string {
    if (score >= 85) return '🚀🔥';
    if (score >= 75) return '🚀';
    if (score >= 65) return '⚡';
    return '📡';
  }

  private formatPrice(price: number): string {
    if (price < 0.000001) return price.toExponential(4);
    if (price < 0.001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    return n.toFixed(2);
  }

  private formatChange(change: number): string {
    const sign = change >= 0 ? '+' : '';
    const emoji = change >= 5 ? '🟢' : change >= 0 ? '🔵' : '🔴';
    return `${emoji} ${sign}${change.toFixed(2)}%`;
  }
}
