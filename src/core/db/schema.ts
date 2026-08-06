/**
 * SQLite schema + forward-only migrations.
 *
 * Rules:
 *  - Migrations are append-only. Never edit a shipped migration; add a new one.
 *  - `user_version` is the migration cursor, managed by the client.
 *  - Hot game state never touches SQLite mid-frame; the save service batches
 *    writes (see `src/core/save/saveService.ts`).
 */

export const SCHEMA_MIGRATIONS: string[] = [
  // ---- v1: initial ------------------------------------------------------
  `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    item_id     TEXT PRIMARY KEY NOT NULL,
    qty         INTEGER NOT NULL DEFAULT 0,
    acquired_at INTEGER NOT NULL,
    seen        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS unlocks (
    item_id     TEXT PRIMARY KEY NOT NULL,
    unlocked_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metrics (
    key   TEXT PRIMARY KEY NOT NULL,
    value REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quests (
    quest_id  TEXT NOT NULL,
    period    TEXT NOT NULL,
    progress  REAL NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    claimed   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (quest_id, period)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    achievement_id TEXT PRIMARY KEY NOT NULL,
    value          REAL NOT NULL DEFAULT 0,
    tier           INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_state (
    game_id    TEXT PRIMARY KEY NOT NULL,
    json       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id    TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'default',
    score      REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game_id, mode, score DESC);

  CREATE TABLE IF NOT EXISTS activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    label      TEXT NOT NULL,
    detail     TEXT,
    icon       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_time ON activity (created_at DESC);
  `,

  // ---- v2: daily reward ledger -----------------------------------------
  `
  CREATE TABLE IF NOT EXISTS daily_claims (
    day        TEXT PRIMARY KEY NOT NULL,
    day_index  INTEGER NOT NULL,
    reward     TEXT NOT NULL,
    claimed_at INTEGER NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;

export const DB_NAME = 'pocketverse.db';

/** Keys used in the `meta` key/value table. */
export const META_KEYS = {
  player: 'player',
  settings: 'settings',
  room: 'room',
  bootstrapped: 'bootstrapped',
  lastSession: 'last_session',
} as const;
