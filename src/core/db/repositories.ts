import { getDb, transact } from './client';
import { META_KEYS } from './schema';
import type {
  AchievementProgress,
  InventoryEntry,
  MetricKey,
  PlayerState,
  QuestProgress,
  RoomState,
  Settings,
} from '../types';

/**
 * Repositories: the only code allowed to speak SQL.
 *
 * Every function is async and safe to call concurrently — SQLite serialises.
 * Stores call these through the save service, never during a frame.
 */

/* ---------------------------------------------------------------- meta -- */

async function readJson<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export const metaRepo = {
  getPlayer: () => readJson<PlayerState>(META_KEYS.player),
  savePlayer: (p: PlayerState) => writeJson(META_KEYS.player, p),
  getSettings: () => readJson<Settings>(META_KEYS.settings),
  saveSettings: (s: Settings) => writeJson(META_KEYS.settings, s),
  getRoom: () => readJson<RoomState>(META_KEYS.room),
  saveRoom: (r: RoomState) => writeJson(META_KEYS.room, r),
  getRaw: readJson,
  setRaw: writeJson,
};

/* ----------------------------------------------------------- inventory -- */

export const inventoryRepo = {
  async all(): Promise<InventoryEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      item_id: string;
      qty: number;
      acquired_at: number;
      seen: number;
    }>('SELECT * FROM inventory WHERE qty > 0');
    return rows.map((r) => ({
      itemId: r.item_id,
      qty: r.qty,
      acquiredAt: r.acquired_at,
      seen: r.seen === 1,
    }));
  },

  async upsertMany(entries: InventoryEntry[]) {
    if (!entries.length) return;
    await transact(async (db) => {
      for (const e of entries) {
        await db.runAsync(
          `INSERT INTO inventory (item_id, qty, acquired_at, seen)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET qty = excluded.qty, seen = excluded.seen`,
          e.itemId,
          e.qty,
          e.acquiredAt,
          e.seen ? 1 : 0,
        );
      }
    });
  },

  async prune() {
    const db = await getDb();
    await db.runAsync('DELETE FROM inventory WHERE qty <= 0');
  },
};

/* ------------------------------------------------------------- unlocks -- */

export const unlockRepo = {
  async all(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ item_id: string }>('SELECT item_id FROM unlocks');
    return rows.map((r) => r.item_id);
  },
  async addMany(ids: string[]) {
    if (!ids.length) return;
    await transact(async (db) => {
      for (const id of ids) {
        await db.runAsync(
          'INSERT OR IGNORE INTO unlocks (item_id, unlocked_at) VALUES (?, ?)',
          id,
          Date.now(),
        );
      }
    });
  },
};

/* ------------------------------------------------------------- metrics -- */

export const metricRepo = {
  async all(): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; value: number }>('SELECT * FROM metrics');
    const out: Record<string, number> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
  async saveMany(values: Partial<Record<MetricKey, number>>) {
    const entries = Object.entries(values);
    if (!entries.length) return;
    await transact(async (db) => {
      for (const [key, value] of entries) {
        await db.runAsync(
          `INSERT INTO metrics (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          key,
          value ?? 0,
        );
      }
    });
  },
};

/* -------------------------------------------------------------- quests -- */

export const questRepo = {
  async all(): Promise<QuestProgress[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      quest_id: string;
      period: string;
      progress: number;
      completed: number;
      claimed: number;
    }>('SELECT * FROM quests');
    return rows.map((r) => ({
      questId: r.quest_id,
      period: r.period,
      progress: r.progress,
      completed: r.completed === 1,
      claimed: r.claimed === 1,
    }));
  },
  async saveMany(list: QuestProgress[]) {
    if (!list.length) return;
    await transact(async (db) => {
      for (const q of list) {
        await db.runAsync(
          `INSERT INTO quests (quest_id, period, progress, completed, claimed)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(quest_id, period) DO UPDATE SET
             progress = excluded.progress,
             completed = excluded.completed,
             claimed = excluded.claimed`,
          q.questId,
          q.period,
          q.progress,
          q.completed ? 1 : 0,
          q.claimed ? 1 : 0,
        );
      }
    });
  },
  /** Housekeeping: keep the table from growing forever. */
  async pruneOld(keepPeriods: string[]) {
    if (!keepPeriods.length) return;
    const db = await getDb();
    const placeholders = keepPeriods.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM quests WHERE period NOT IN (${placeholders}) AND period != 'story'`,
      ...keepPeriods,
    );
  },
};

/* -------------------------------------------------------- achievements -- */

export const achievementRepo = {
  async all(): Promise<AchievementProgress[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      achievement_id: string;
      value: number;
      tier: number;
    }>('SELECT * FROM achievements');
    return rows.map((r) => ({ achievementId: r.achievement_id, value: r.value, tier: r.tier }));
  },
  async saveMany(list: AchievementProgress[]) {
    if (!list.length) return;
    await transact(async (db) => {
      for (const a of list) {
        await db.runAsync(
          `INSERT INTO achievements (achievement_id, value, tier) VALUES (?, ?, ?)
           ON CONFLICT(achievement_id) DO UPDATE SET value = excluded.value, tier = excluded.tier`,
          a.achievementId,
          a.value,
          a.tier,
        );
      }
    });
  },
};

/* ---------------------------------------------------------- game state -- */

export const gameStateRepo = {
  async get<T>(gameId: string): Promise<T | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ json: string }>(
      'SELECT json FROM game_state WHERE game_id = ?',
      gameId,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.json) as T;
    } catch {
      return null;
    }
  },
  async set(gameId: string, state: unknown) {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO game_state (game_id, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      gameId,
      JSON.stringify(state),
      Date.now(),
    );
  },
  async all(): Promise<Record<string, unknown>> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ game_id: string; json: string }>(
      'SELECT game_id, json FROM game_state',
    );
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        out[r.game_id] = JSON.parse(r.json);
      } catch {
        /* corrupt row — ignore, module falls back to defaults */
      }
    }
    return out;
  },
};

/* -------------------------------------------------------------- scores -- */

export const scoreRepo = {
  async add(gameId: string, score: number, mode = 'default') {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO scores (game_id, mode, score, created_at) VALUES (?, ?, ?, ?)',
      gameId,
      mode,
      score,
      Date.now(),
    );
  },
  async best(gameId: string, mode = 'default'): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ best: number | null }>(
      'SELECT MAX(score) as best FROM scores WHERE game_id = ? AND mode = ?',
      gameId,
      mode,
    );
    return row?.best ?? 0;
  },
  async bestAll(): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ game_id: string; mode: string; best: number }>(
      'SELECT game_id, mode, MAX(score) as best FROM scores GROUP BY game_id, mode',
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[`${r.game_id}:${r.mode}`] = r.best;
    return out;
  },
  async top(gameId: string, limit = 10, mode = 'default') {
    const db = await getDb();
    return db.getAllAsync<{ score: number; created_at: number }>(
      'SELECT score, created_at FROM scores WHERE game_id = ? AND mode = ? ORDER BY score DESC LIMIT ?',
      gameId,
      mode,
      limit,
    );
  },
};

/* ------------------------------------------------------------ activity -- */

export type ActivityRow = {
  id: number;
  kind: string;
  label: string;
  detail: string | null;
  icon: string | null;
  created_at: number;
};

export const activityRepo = {
  async add(kind: string, label: string, detail?: string, icon?: string) {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO activity (kind, label, detail, icon, created_at) VALUES (?, ?, ?, ?, ?)',
      kind,
      label,
      detail ?? null,
      icon ?? null,
      Date.now(),
    );
    // Ring-buffer the log so it never becomes a storage problem.
    await db.runAsync(
      'DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY created_at DESC LIMIT 100)',
    );
  },
  async recent(limit = 12): Promise<ActivityRow[]> {
    const db = await getDb();
    return db.getAllAsync<ActivityRow>(
      'SELECT * FROM activity ORDER BY created_at DESC LIMIT ?',
      limit,
    );
  },
};

/* -------------------------------------------------------- daily claims -- */

export const dailyRepo = {
  async claimed(day: string): Promise<boolean> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ day: string }>(
      'SELECT day FROM daily_claims WHERE day = ?',
      day,
    );
    return !!row;
  },
  async claim(day: string, dayIndex: number, reward: unknown) {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO daily_claims (day, day_index, reward, claimed_at) VALUES (?, ?, ?, ?)',
      day,
      dayIndex,
      JSON.stringify(reward),
      Date.now(),
    );
  },
  async count(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM daily_claims');
    return row?.c ?? 0;
  },
};
