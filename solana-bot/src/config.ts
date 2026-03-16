import * as dotenv from 'dotenv';
import * as path from 'path';
import type { BotConfig } from './types.js';

dotenv.config();

/**
 * Parses and validates all required environment variables, returning a
 * strongly-typed {@link BotConfig} object.  Throws descriptive errors for
 * missing or invalid values so the bot fails fast at startup rather than at
 * runtime.
 */
export function loadConfig(): BotConfig {
  const telegramBotToken = requireEnv('TELEGRAM_BOT_TOKEN');
  const telegramChatId = requireEnv('TELEGRAM_CHAT_ID');

  const scanIntervalMs = parsePositiveInt(
    process.env['SCAN_INTERVAL_MS'],
    'SCAN_INTERVAL_MS',
    120_000,
    60_000,
  );

  const minVolumeUsd = parsePositiveFloat(
    process.env['MIN_VOLUME_USD'],
    'MIN_VOLUME_USD',
    50_000,
  );

  const maxMarketCapUsd = parsePositiveFloat(
    process.env['MAX_MARKET_CAP_USD'],
    'MAX_MARKET_CAP_USD',
    5_000_000,
  );

  const minLiquidityUsd = parsePositiveFloat(
    process.env['MIN_LIQUIDITY_USD'],
    'MIN_LIQUIDITY_USD',
    25_000,
  );

  const volumeSpikeMultiplier = parsePositiveFloat(
    process.env['VOLUME_SPIKE_MULTIPLIER'],
    'VOLUME_SPIKE_MULTIPLIER',
    5,
  );

  const minPriceChangePercent = parsePositiveFloat(
    process.env['MIN_PRICE_CHANGE_PERCENT'],
    'MIN_PRICE_CHANGE_PERCENT',
    10,
  );

  const minSignalScore = parsePositiveFloat(
    process.env['MIN_SIGNAL_SCORE'],
    'MIN_SIGNAL_SCORE',
    60,
  );

  const dbPath = path.resolve(process.env['DB_PATH'] ?? './data/signals.db');

  const signalCooldownMs = parsePositiveInt(
    process.env['SIGNAL_COOLDOWN_MS'],
    'SIGNAL_COOLDOWN_MS',
    3_600_000,
    0,
  );

  const backtestMode = (process.env['BACKTEST_MODE'] ?? 'false').toLowerCase() === 'true';

  return {
    telegramBotToken,
    telegramChatId,
    scanIntervalMs,
    minVolumeUsd,
    maxMarketCapUsd,
    minLiquidityUsd,
    volumeSpikeMultiplier,
    minPriceChangePercent,
    minSignalScore,
    dbPath,
    signalCooldownMs,
    backtestMode,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function parsePositiveFloat(
  raw: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (raw === undefined || raw === '') return defaultValue;
  const n = parseFloat(raw);
  if (isNaN(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number; got: ${raw}`);
  }
  return n;
}

function parsePositiveInt(
  raw: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
): number {
  if (raw === undefined || raw === '') return defaultValue;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < minimum) {
    throw new Error(
      `Environment variable ${name} must be an integer >= ${minimum}; got: ${raw}`,
    );
  }
  return n;
}
