/**
 * Entry point for the Solana Token Analyzer Bot.
 *
 * Loads configuration from environment variables, boots the bot, and
 * registers graceful-shutdown handlers for SIGINT / SIGTERM so the process
 * exits cleanly when stopped via Ctrl-C or a process manager.
 */
import { loadConfig } from './config.js';
import { SolanaBot } from './bot.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[startup] Configuration error: ${message}`);
    process.exit(1);
  }

  const bot = new SolanaBot(config);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[startup] Received ${signal}, shutting down gracefully…`);
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.start();
}

main().catch((err: unknown) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
