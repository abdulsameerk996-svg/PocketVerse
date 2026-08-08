import type { ComponentType } from 'react';
import type { GradientName } from '@/ui/theme/tokens';
import type {
  AchievementDef,
  GameId,
  ItemDef,
  MetricDelta,
  QuestDef,
  RewardBundle,
  SessionResult,
} from '../types';

/**
 * ============================================================================
 *  GAME MODULE CONTRACT
 * ============================================================================
 *
 * A game is a *plug-in*, not a screen. It declares:
 *   - metadata (how it appears in the hub),
 *   - the content it contributes to the shared world (items, quests, achievements),
 *   - a React component to render,
 *   - optional lifecycle hooks (offline simulation, save shape, unlock rules).
 *
 * The host (`app/game/[id].tsx`) does everything else: energy gating, session
 * timing, reward application, results screen, pause, haptics, back handling.
 *
 * Adding game #11 therefore means:
 *   1. create `src/games/<name>/index.ts` exporting a `GameModule`
 *   2. add one line to `src/games/index.ts`
 * No existing file changes shape. That is the extensibility requirement.
 */

export type GameSurfaceProps = {
  /** Call when the run ends. The host takes over from here. */
  onFinish: (result: Omit<SessionResult, 'gameId' | 'durationMs'>) => void;
  /** Emit metrics mid-run (quests update live). Cheap; batched internally. */
  track: (metrics: MetricDelta) => void;
  /** Grant a reward mid-run (rare — e.g. a chest opened inside a level). */
  grant: (reward: RewardBundle, label?: string) => void;
  /** Aggregate equipped-cosmetic bonuses. Games should honour `speed`/`armor`/`luck`. */
  modifiers: {
    coinBonus: number;
    xpBonus: number;
    speed: number;
    armor: number;
    energyRegen: number;
    luck: number;
  };
  /** Host-owned pause flag; games must stop their loop when true. */
  paused: boolean;
  /** Ask the host to open the pause sheet. */
  requestPause: () => void;
  /** Player-facing context a game may want (level gates cosmetic tiers, etc). */
  level: number;
  /** Persisted, module-owned save blob (already hydrated). */
  save: unknown;
  /** Persist module-owned state. Debounced; safe to call often, not per-frame. */
  setSave: (updater: unknown | ((prev: any) => any)) => void;
};

export type GameMeta = {
  title: string;
  /** One-line hook shown on the arcade card. */
  tagline: string;
  glyph: string;
  gradient: GradientName;
  accent: string;
  /** Energy consumed to start a session. 0 = free (idle games like pet/farm). */
  energyCost: number;
  /** Account level required to unlock. */
  minLevel: number;
  /** 'session' games have a start/finish; 'ambient' games are always open. */
  kind: 'session' | 'ambient';
  tags: string[];
  /** Sorting weight in the arcade grid. */
  order: number;
  /**
   * Launcher section. Optional so every existing module keeps working
   * untouched — anything without one is filed under 'arcade'.
   */
  category?: GameCategory;
  /** How many people play at once. Defaults to 1. Drives the "· 2 Players" line. */
  players?: 1 | 2;
};

export type GameCategory = 'arcade' | 'versus';

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  arcade: 'ARCADE',
  versus: '2 PLAYER',
};

export type GameModule = {
  id: GameId;
  meta: GameMeta;
  /** The playable surface. Lazily rendered by the host. */
  Surface: ComponentType<GameSurfaceProps>;
  /** Items this module introduces into the shared catalog. */
  items?: ItemDef[];
  /** Quests this module contributes to the global daily/weekly pool. */
  quests?: QuestDef[];
  /** Achievements contributed to the global list. */
  achievements?: AchievementDef[];
  /** Default value for the module's persisted save blob. */
  defaultSave?: () => unknown;
  /**
   * Offline simulation. Called once at boot with the elapsed time since the
   * player was last seen. Lets the pet get hungry and crops grow while closed.
   * Must be pure-ish: return the next save blob + any metrics/notice.
   */
  simulateOffline?: (
    save: any,
    elapsedMs: number,
  ) => { save: any; notice?: string; reward?: RewardBundle } | null;
  /** Optional hub widget (e.g. pet mood strip, crop timer) rendered on Home. */
  HubWidget?: ComponentType<{ save: unknown }>;
};

export type GameModuleMap = Record<GameId, GameModule>;
