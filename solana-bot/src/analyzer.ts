import type {
  BotConfig,
  DexScreenerPair,
  PatternResult,
  SignalType,
  TokenSignal,
} from './types.js';

/**
 * Analyses a single DexScreener pair against configurable thresholds and
 * returns a {@link TokenSignal} if the token meets the minimum score, or
 * `null` if it should be ignored.
 *
 * Each pattern contributes a weighted sub-score (0–100) to the composite
 * `totalScore`.  Only signals above `config.minSignalScore` are returned.
 */
export class TokenAnalyzer {
  constructor(private readonly config: BotConfig) {}

  /**
   * Run all pattern detectors against `pair`.
   * Returns `null` when the pair does not pass basic pre-filters or fails to
   * meet the minimum composite score threshold.
   */
  analyze(pair: DexScreenerPair): TokenSignal | null {
    // ------------------------------------------------------------------
    // Pre-filters: skip pairs that can never produce a useful signal
    // ------------------------------------------------------------------
    if (!this.passesPreFilter(pair)) return null;

    // ------------------------------------------------------------------
    // Pattern detectors
    // ------------------------------------------------------------------
    const patterns: PatternResult[] = [
      this.detectVolumeSpike(pair),
      this.detectPumpPattern(pair),
      this.detectEarlyGem(pair),
      this.detectMomentumBreakout(pair),
    ];

    const detected = patterns.filter((p) => p.detected);
    if (detected.length === 0) return null;

    // Weighted average of individual pattern scores
    const totalScore = Math.round(
      detected.reduce((sum, p) => sum + p.score, 0) / detected.length,
    );

    if (totalScore < this.config.minSignalScore) return null;

    return {
      pair,
      patterns,
      totalScore,
      timestamp: Date.now(),
      signalTypes: detected.map((p) => p.type as SignalType),
    };
  }

  // ---------------------------------------------------------------------------
  // Pre-filters
  // ---------------------------------------------------------------------------

  private passesPreFilter(pair: DexScreenerPair): boolean {
    const { minVolumeUsd, maxMarketCapUsd, minLiquidityUsd } = this.config;

    // Must have meaningful 1-hour volume
    if ((pair.volume?.h1 ?? 0) < minVolumeUsd) return false;

    // Must not be a large-cap token (we want small emerging tokens)
    const marketCap = pair.marketCap ?? pair.fdv ?? 0;
    if (marketCap > maxMarketCapUsd && marketCap !== 0) return false;

    // Must have enough liquidity to enter
    if ((pair.liquidity?.usd ?? 0) < minLiquidityUsd) return false;

    // Must have a valid USD price
    if (!pair.priceUsd || parseFloat(pair.priceUsd) <= 0) return false;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Pattern: Volume Spike
  // Triggered when short-window volume dwarfs the longer-window baseline,
  // indicating a sudden surge of interest.
  // ---------------------------------------------------------------------------

  private detectVolumeSpike(pair: DexScreenerPair): PatternResult {
    const type: SignalType = 'VOLUME_SPIKE';
    const vol1h = pair.volume?.h1 ?? 0;
    const vol24h = pair.volume?.h24 ?? 0;

    if (vol1h === 0 || vol24h === 0) {
      return { type, detected: false, score: 0, details: 'Insufficient volume data' };
    }

    // Average hourly volume derived from the 24-hour total
    const averageHourlyVolume = vol24h / 24;
    const spikeRatio = vol1h / Math.max(averageHourlyVolume, 1);

    const { volumeSpikeMultiplier } = this.config;
    if (spikeRatio < volumeSpikeMultiplier) {
      return {
        type,
        detected: false,
        score: 0,
        details: `Volume spike ratio ${spikeRatio.toFixed(2)}x < threshold ${volumeSpikeMultiplier}x`,
      };
    }

    // Score linearly between threshold and 10×; cap at 100
    const score = Math.min(100, Math.round(((spikeRatio - volumeSpikeMultiplier) / 5) * 100 + 60));
    return {
      type,
      detected: true,
      score,
      details: `Volume spike ${spikeRatio.toFixed(2)}x above 24h hourly average`,
    };
  }

  // ---------------------------------------------------------------------------
  // Pattern: Pump Pattern
  // Rising price combined with increasing transaction count signals buying
  // pressure building up.
  // ---------------------------------------------------------------------------

  private detectPumpPattern(pair: DexScreenerPair): PatternResult {
    const type: SignalType = 'PUMP_PATTERN';

    const priceChange1h = pair.priceChange?.h1 ?? 0;
    const priceChange24h = pair.priceChange?.h24 ?? 0;
    const buys1h = pair.txns?.h1?.buys ?? 0;
    const sells1h = pair.txns?.h1?.sells ?? 0;
    const totalTxns = buys1h + sells1h;

    if (totalTxns === 0) {
      return { type, detected: false, score: 0, details: 'No transaction data' };
    }

    // Require positive 1h price change
    if (priceChange1h <= 0) {
      return {
        type,
        detected: false,
        score: 0,
        details: `Price not rising (1h change: ${priceChange1h.toFixed(2)}%)`,
      };
    }

    // Buy/sell ratio: more buys than sells indicates accumulation
    const buySellRatio = buys1h / Math.max(sells1h, 1);

    // Must have some minimum price movement
    if (priceChange1h < this.config.minPriceChangePercent) {
      return {
        type,
        detected: false,
        score: 0,
        details: `Price change ${priceChange1h.toFixed(2)}% < threshold ${this.config.minPriceChangePercent}%`,
      };
    }

    // Is 1h momentum accelerating relative to 24h?
    const accelerating = priceChange1h > Math.abs(priceChange24h) / 24;

    let score = 50;
    score += Math.min(30, priceChange1h); // up to +30 for price gain
    score += Math.min(15, (buySellRatio - 1) * 10); // up to +15 for buy pressure
    if (accelerating) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      type,
      detected: true,
      score,
      details: `Price +${priceChange1h.toFixed(2)}% 1h, buy/sell ratio ${buySellRatio.toFixed(2)}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Pattern: Early Gem
  // A recently-created token with a low market cap but disproportionately
  // high volume suggests early-stage price discovery.
  // ---------------------------------------------------------------------------

  private detectEarlyGem(pair: DexScreenerPair): PatternResult {
    const type: SignalType = 'EARLY_GEM';

    const marketCap = pair.marketCap ?? pair.fdv ?? 0;
    const vol24h = pair.volume?.h24 ?? 0;

    if (marketCap === 0 || vol24h === 0) {
      return { type, detected: false, score: 0, details: 'Insufficient market cap or volume data' };
    }

    // Volume-to-market-cap ratio: high ratio = active early trading
    const volumeToMcap = vol24h / marketCap;

    // Token age: newer tokens score higher
    const ageMs = pair.pairCreatedAt
      ? Date.now() - pair.pairCreatedAt
      : Number.MAX_SAFE_INTEGER;
    const ageHours = ageMs / 3_600_000;

    // We want: high volume/mcap ratio AND young age
    if (volumeToMcap < 0.5) {
      return {
        type,
        detected: false,
        score: 0,
        details: `Volume/MCap ratio ${volumeToMcap.toFixed(2)} below 0.5 threshold`,
      };
    }

    let score = 50;
    score += Math.min(30, volumeToMcap * 15); // up to +30 for high vol/mcap
    if (ageHours < 24) score += 20; // bonus for very new tokens
    else if (ageHours < 72) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      type,
      detected: true,
      score,
      details: `Vol/MCap ratio ${volumeToMcap.toFixed(2)}, age ${ageHours.toFixed(0)}h`,
    };
  }

  // ---------------------------------------------------------------------------
  // Pattern: Momentum Breakout
  // Short-term price change dramatically exceeding 5-minute and 1-hour norms.
  // ---------------------------------------------------------------------------

  private detectMomentumBreakout(pair: DexScreenerPair): PatternResult {
    const type: SignalType = 'MOMENTUM_BREAKOUT';

    const change5m = pair.priceChange?.m5 ?? 0;
    const change1h = pair.priceChange?.h1 ?? 0;
    const change6h = pair.priceChange?.h6 ?? 0;

    // All timeframes must show positive movement
    if (change5m <= 0 || change1h <= 0) {
      return {
        type,
        detected: false,
        score: 0,
        details: 'No consistent upward momentum across timeframes',
      };
    }

    // 5-min change must outpace normalised longer windows
    const normalised1h = change1h / 12; // expected 5-min contribution to 1h
    const normalised6h = change6h / 72; // expected 5-min contribution to 6h
    const isAccelerating = change5m > normalised1h && change5m > normalised6h;

    if (!isAccelerating) {
      return {
        type,
        detected: false,
        score: 0,
        details: 'Momentum not accelerating on 5m timeframe',
      };
    }

    let score = 55;
    score += Math.min(25, change5m * 2); // up to +25 for strong 5m move
    score += Math.min(20, change1h); // up to +20 for 1h trend
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      type,
      detected: true,
      score,
      details: `5m: +${change5m.toFixed(2)}%, 1h: +${change1h.toFixed(2)}%, 6h: ${change6h.toFixed(2)}%`,
    };
  }
}
