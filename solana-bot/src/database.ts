import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { SignalRecord } from './types.js';

/**
 * Lightweight SQLite wrapper for persisting signal history.
 *
 * Responsibilities:
 * - Track which token pairs have already been alerted so we can suppress
 *   duplicates within the cooldown window.
 * - Store a full history of signals for backtesting / analysis.
 */
export class SignalDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    // Ensure the directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialise();
  }

  // ---------------------------------------------------------------------------
  // Schema
  // ---------------------------------------------------------------------------

  private initialise(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pairAddress TEXT    NOT NULL,
        tokenAddress TEXT   NOT NULL,
        tokenSymbol TEXT    NOT NULL,
        signalTypes TEXT    NOT NULL,
        score       REAL    NOT NULL,
        priceUsd    TEXT    NOT NULL,
        volumeH1    REAL    NOT NULL,
        marketCap   REAL    NOT NULL,
        createdAt   INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_signals_pairAddress
        ON signals (pairAddress);

      CREATE INDEX IF NOT EXISTS idx_signals_createdAt
        ON signals (createdAt);
    `);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if a signal was recorded for `pairAddress` within the last
   * `cooldownMs` milliseconds.
   */
  isOnCooldown(pairAddress: string, cooldownMs: number): boolean {
    const cutoff = Date.now() - cooldownMs;
    const row = this.db
      .prepare<[string, number], { count: number }>(
        'SELECT COUNT(*) AS count FROM signals WHERE pairAddress = ? AND createdAt > ?',
      )
      .get(pairAddress, cutoff);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Persist a new signal record.
   */
  saveSignal(record: Omit<SignalRecord, 'id'>): void {
    this.db
      .prepare(
        `INSERT INTO signals
         (pairAddress, tokenAddress, tokenSymbol, signalTypes, score,
          priceUsd, volumeH1, marketCap, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.pairAddress,
        record.tokenAddress,
        record.tokenSymbol,
        record.signalTypes,
        record.score,
        record.priceUsd,
        record.volumeH1,
        record.marketCap,
        record.createdAt,
      );
  }

  /**
   * Retrieve all signals, newest first.  Optional `limit` caps the result set.
   */
  getRecentSignals(limit = 50): SignalRecord[] {
    return this.db
      .prepare<[number], SignalRecord>(
        'SELECT * FROM signals ORDER BY createdAt DESC LIMIT ?',
      )
      .all(limit) as SignalRecord[];
  }

  /**
   * Count total number of signals stored.
   */
  getTotalSignals(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM signals')
      .get();
    return row?.count ?? 0;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
