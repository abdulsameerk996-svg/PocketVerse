import * as SQLite from 'expo-sqlite';
import { DB_NAME, SCHEMA_MIGRATIONS } from './schema';

/**
 * Single long-lived SQLite connection.
 *
 * The app is offline-first: this database *is* the server. It is opened once at
 * boot, migrated forward, then handed to repositories. Nothing else in the app
 * imports `expo-sqlite` directly.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= SCHEMA_MIGRATIONS.length) return;

  for (let i = version; i < SCHEMA_MIGRATIONS.length; i++) {
    const sql = SCHEMA_MIGRATIONS[i];
    // execAsync runs multi-statement SQL; each migration is atomic per step.
    await db.execAsync(sql);
    version = i + 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

/**
 * Serialises transactions against the one shared connection.
 *
 * SQLite has no nested transactions, and `withTransactionAsync` does not queue:
 * two overlapping calls on the same connection deadlock, and the write never
 * lands. That was not hypothetical — the save service flushes its channels with
 * `Promise.all`, and a finished run marks `inventory` and `progress` dirty
 * together, so every run-end fired two concurrent transactions and the second
 * one hung. Items and quest progress were silently never written.
 *
 * A promise chain is enough: transactions queue, everything else (plain
 * `runAsync` writes) still runs concurrently.
 */
let txQueue: Promise<unknown> = Promise.resolve();

/** Run a set of statements inside one transaction. Queued, never concurrent. */
export function transact(fn: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const run = txQueue.then(async () => {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await fn(db);
    });
  });
  // Keep the chain alive even if this transaction rejects, or one failure would
  // wedge every future write.
  txQueue = run.catch(() => undefined);
  return run;
}

/** Destructive — used only by "Reset progress" in settings. */
export async function wipeDatabase() {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM meta;
    DELETE FROM inventory;
    DELETE FROM unlocks;
    DELETE FROM metrics;
    DELETE FROM quests;
    DELETE FROM achievements;
    DELETE FROM game_state;
    DELETE FROM scores;
    DELETE FROM activity;
    DELETE FROM daily_claims;
  `);
}
