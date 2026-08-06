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

/** Run a set of statements inside one transaction. */
export async function transact(fn: (db: SQLite.SQLiteDatabase) => Promise<void>) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await fn(db);
  });
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
