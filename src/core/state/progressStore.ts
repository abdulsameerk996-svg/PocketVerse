import { create } from 'zustand';
import type {
  AchievementProgress,
  GameId,
  MetricDelta,
  MetricKey,
  QuestDef,
  QuestProgress,
  RewardBundle,
} from '../types';
import { METRIC_MODE } from '../types';
import { achievementRepo, metaRepo, metricRepo, questRepo } from '../db/repositories';
import { markDirty, registerChannel } from '../save/saveService';
import { catalog, getAchievement, getQuest } from '@/content/catalog';
import { DAILY_QUEST_SLOTS, WEEKLY_QUEST_SLOTS } from '@/content/quests';
import { createRng, hashString, shuffle } from '../utils/rng';
import { dayKey, weekKey } from '../utils/time';

const CHANNEL = 'progress';
const EXTRA_KEY = 'progress_extra';

export type ActiveQuest = { def: QuestDef; progress: QuestProgress };

type Extra = {
  /** period -> game ids played, for the "play N different games" quest. */
  dailyGames: { period: string; ids: GameId[] };
};

type ProgressStore = {
  metrics: Partial<Record<MetricKey, number>>;
  quests: Record<string, QuestProgress>; // key: `${questId}:${period}`
  achievements: Record<string, AchievementProgress>;
  extra: Extra;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  persist: () => Promise<void>;

  /** Fold gameplay metrics into the global stream and advance quests. */
  track: (delta: MetricDelta, gameId?: GameId) => void;

  activeQuests: () => ActiveQuest[];
  questsByScope: (scope: QuestDef['scope']) => ActiveQuest[];
  claimQuest: (questId: string) => RewardBundle | null;

  /** Newly completed achievement tiers since last call, with their rewards. */
  drainAchievementUnlocks: () => { id: string; tier: number; reward: RewardBundle }[];
  achievementValue: (id: string) => number;
  achievementTier: (id: string) => number;

  reset: () => void;
};

let dirtyMetrics = new Set<MetricKey>();
let dirtyQuests = new Set<string>();
let dirtyAchievements = new Set<string>();
let pendingAchievementUnlocks: { id: string; tier: number; reward: RewardBundle }[] = [];

/** Deterministic daily/weekly quest rotation — same for the whole period. */
function rotate(pool: QuestDef[], seedKey: string, slots: number, level: number): QuestDef[] {
  const eligible = pool.filter((q) => (q.minLevel ?? 1) <= level);
  const rng = createRng(hashString(seedKey));
  return shuffle(rng, eligible).slice(0, slots);
}

const emptyExtra = (): Extra => ({ dailyGames: { period: dayKey(), ids: [] } });

export const useProgressStore = create<ProgressStore>((set, get) => ({
  metrics: {},
  quests: {},
  achievements: {},
  extra: emptyExtra(),
  hydrated: false,

  hydrate: async () => {
    const [metrics, questList, achList, extra] = await Promise.all([
      metricRepo.all(),
      questRepo.all(),
      achievementRepo.all(),
      metaRepo.getRaw<Extra>(EXTRA_KEY),
    ]);
    const quests: Record<string, QuestProgress> = {};
    for (const q of questList) quests[`${q.questId}:${q.period}`] = q;
    const achievements: Record<string, AchievementProgress> = {};
    for (const a of achList) achievements[a.achievementId] = a;

    const today = dayKey();
    const loadedExtra = extra ?? emptyExtra();
    if (loadedExtra.dailyGames.period !== today) {
      loadedExtra.dailyGames = { period: today, ids: [] };
    }

    set({
      metrics: metrics as Partial<Record<MetricKey, number>>,
      quests,
      achievements,
      extra: loadedExtra,
      hydrated: true,
    });

    // Keep only the current + previous period rows.
    void questRepo.pruneOld([today, weekKey(), 'story']);
  },

  persist: async () => {
    const state = get();
    const metricKeys = [...dirtyMetrics];
    const questKeys = [...dirtyQuests];
    const achievementKeys = [...dirtyAchievements];

    const metrics: Partial<Record<MetricKey, number>> = {};
    for (const k of metricKeys) metrics[k] = state.metrics[k] ?? 0;
    const quests = questKeys.map((k) => state.quests[k]).filter(Boolean);
    const achievements = achievementKeys.map((k) => state.achievements[k]).filter(Boolean);

    await metricRepo.saveMany(metrics);
    await questRepo.saveMany(quests);
    await achievementRepo.saveMany(achievements);
    await metaRepo.setRaw(EXTRA_KEY, state.extra);

    // Same rule as the inventory channel: forget a key only once it is durable,
    // so a failed write is genuinely retried instead of silently discarded.
    for (const k of metricKeys) dirtyMetrics.delete(k);
    for (const k of questKeys) dirtyQuests.delete(k);
    for (const k of achievementKeys) dirtyAchievements.delete(k);
  },

  track: (delta, gameId) => {
    const state = get();
    const metrics = { ...state.metrics };
    const touched: MetricKey[] = [];

    for (const [rawKey, rawVal] of Object.entries(delta)) {
      const key = rawKey as MetricKey;
      const val = rawVal ?? 0;
      if (!val) continue;
      const mode = METRIC_MODE[key] ?? 'sum';
      const prev = metrics[key] ?? 0;
      metrics[key] = mode === 'max' ? Math.max(prev, val) : prev + val;
      touched.push(key);
      dirtyMetrics.add(key);
    }

    // Track distinct games played today (drives the variety quest).
    let extra = state.extra;
    if (gameId) {
      const today = dayKey();
      const dg =
        extra.dailyGames.period === today ? extra.dailyGames : { period: today, ids: [] as GameId[] };
      if (!dg.ids.includes(gameId)) {
        const ids = [...dg.ids, gameId];
        extra = { ...extra, dailyGames: { period: today, ids } };
        metrics.games_distinct_played = ids.length;
        touched.push('games_distinct_played');
        dirtyMetrics.add('games_distinct_played');
      } else if (extra.dailyGames.period !== today) {
        extra = { ...extra, dailyGames: dg };
      }
    }

    if (!touched.length && extra === state.extra) return;

    // --- advance quests ---------------------------------------------------
    const quests = { ...state.quests };
    for (const aq of get().activeQuests()) {
      const { def } = aq;
      if (def.game && gameId && def.game !== gameId) continue;
      if (def.game && !gameId) continue;
      if (!touched.includes(def.metric)) continue;

      const key = `${def.id}:${aq.progress.period}`;
      const cur = quests[key] ?? aq.progress;
      if (cur.claimed) continue;

      const mode = METRIC_MODE[def.metric] ?? 'sum';
      const inc = delta[def.metric] ?? 0;
      const nextProgress =
        mode === 'max' ? Math.max(cur.progress, inc) : cur.progress + inc;
      const clamped = Math.min(def.target, nextProgress);
      if (clamped === cur.progress) continue;

      quests[key] = { ...cur, progress: clamped, completed: clamped >= def.target };
      dirtyQuests.add(key);
    }

    // --- advance achievements ---------------------------------------------
    const achievements = { ...state.achievements };
    for (const def of catalog().achievementList) {
      if (def.game && gameId && def.game !== gameId) continue;
      if (def.game && !gameId) continue;
      if (!touched.includes(def.metric)) continue;

      const value = metrics[def.metric] ?? 0;
      const prev = achievements[def.id] ?? { achievementId: def.id, value: 0, tier: 0 };
      let tier = prev.tier;
      while (tier < def.tiers.length && value >= def.tiers[tier].target) {
        pendingAchievementUnlocks.push({
          id: def.id,
          tier: tier + 1,
          reward: def.tiers[tier].reward,
        });
        tier += 1;
      }
      if (tier !== prev.tier || value !== prev.value) {
        achievements[def.id] = { achievementId: def.id, value, tier };
        dirtyAchievements.add(def.id);
      }
    }

    set({ metrics, quests, achievements, extra });
    markDirty(CHANNEL);
  },

  activeQuests: () => {
    const { quests } = get();
    const level = requireLevel();
    const today = dayKey();
    const week = weekKey();
    const all = catalog().questList;

    const daily = rotate(all.filter((q) => q.scope === 'daily'), today, DAILY_QUEST_SLOTS, level);
    const weekly = rotate(all.filter((q) => q.scope === 'weekly'), week, WEEKLY_QUEST_SLOTS, level);
    const story = all.filter((q) => q.scope === 'story' && (q.minLevel ?? 1) <= level);

    const build = (defs: QuestDef[], period: string): ActiveQuest[] =>
      defs.map((def) => ({
        def,
        progress:
          quests[`${def.id}:${period}`] ??
          { questId: def.id, period, progress: 0, completed: false, claimed: false },
      }));

    return [...build(daily, today), ...build(weekly, week), ...build(story, 'story')];
  },

  questsByScope: (scope) => get().activeQuests().filter((q) => q.def.scope === scope),

  claimQuest: (questId) => {
    const def = getQuest(questId);
    if (!def) return null;
    const period = def.scope === 'daily' ? dayKey() : def.scope === 'weekly' ? weekKey() : 'story';
    const key = `${questId}:${period}`;
    const cur = get().quests[key];
    if (!cur || !cur.completed || cur.claimed) return null;
    set((s) => ({ quests: { ...s.quests, [key]: { ...cur, claimed: true } } }));
    dirtyQuests.add(key);
    markDirty(CHANNEL);
    return def.reward;
  },

  drainAchievementUnlocks: () => {
    const out = pendingAchievementUnlocks;
    pendingAchievementUnlocks = [];
    return out;
  },

  achievementValue: (id) => get().achievements[id]?.value ?? 0,
  achievementTier: (id) => get().achievements[id]?.tier ?? 0,

  reset: () => {
    set({ metrics: {}, quests: {}, achievements: {}, extra: emptyExtra() });
    dirtyMetrics = new Set();
    dirtyQuests = new Set();
    dirtyAchievements = new Set();
    pendingAchievementUnlocks = [];
  },
}));

registerChannel(CHANNEL, () => useProgressStore.getState().persist());

/**
 * Quest rotation needs the player level but progressStore must not import
 * playerStore at module scope (circular). Resolved lazily at call time.
 */
function requireLevel(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { usePlayerStore } = require('./playerStore') as typeof import('./playerStore');
    return usePlayerStore.getState().player.level;
  } catch {
    return 1;
  }
}

export { getAchievement };
