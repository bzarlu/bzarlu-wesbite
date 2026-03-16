/**
 * Shared TypeScript type definitions for the Solana Token Analyzer Bot.
 */

// ---------------------------------------------------------------------------
// DexScreener API types
// ---------------------------------------------------------------------------

export interface DexScreenerToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DexScreenerLiquidity {
  usd: number;
  base: number;
  quote: number;
}

export interface DexScreenerVolume {
  h24: number;
  h6: number;
  h1: number;
  m5: number;
}

export interface DexScreenerPriceChange {
  m5: number;
  h1: number;
  h6: number;
  h24: number;
}

export interface DexScreenerTxns {
  m5: { buys: number; sells: number };
  h1: { buys: number; sells: number };
  h6: { buys: number; sells: number };
  h24: { buys: number; sells: number };
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceNative: string;
  priceUsd: string;
  txns: DexScreenerTxns;
  volume: DexScreenerVolume;
  priceChange: DexScreenerPriceChange;
  liquidity: DexScreenerLiquidity;
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

export interface DexScreenerSearchResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

export interface DexScreenerTokenPairsResponse {
  schemaVersion: string;
  pair: DexScreenerPair | null;
}

// ---------------------------------------------------------------------------
// Pattern analysis types
// ---------------------------------------------------------------------------

export type SignalType =
  | 'VOLUME_SPIKE'
  | 'PUMP_PATTERN'
  | 'EARLY_GEM'
  | 'MOMENTUM_BREAKOUT';

export interface PatternResult {
  type: SignalType;
  detected: boolean;
  score: number; // 0–100
  details: string;
}

export interface TokenSignal {
  pair: DexScreenerPair;
  patterns: PatternResult[];
  totalScore: number; // 0–100 composite confidence
  timestamp: number;
  signalTypes: SignalType[];
}

// ---------------------------------------------------------------------------
// Database types
// ---------------------------------------------------------------------------

export interface SignalRecord {
  id?: number;
  pairAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  signalTypes: string; // JSON-serialised SignalType[]
  score: number;
  priceUsd: string;
  volumeH1: number;
  marketCap: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface BotConfig {
  telegramBotToken: string;
  telegramChatId: string;
  scanIntervalMs: number;
  minVolumeUsd: number;
  maxMarketCapUsd: number;
  minLiquidityUsd: number;
  volumeSpikeMultiplier: number;
  minPriceChangePercent: number;
  minSignalScore: number;
  dbPath: string;
  signalCooldownMs: number;
  backtestMode: boolean;
}
