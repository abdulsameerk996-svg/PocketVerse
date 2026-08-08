import type { AchievementDef, QuestDef } from '@/core/types';
import type { GameModule } from '@/core/registry';
import { defaultFrontierSave } from './content';
import FrontierSurface from './FrontierSurface';

/**
 * ============================================================================
 *  POCKETVERSE FRONTIER — the flagship game
 * ============================================================================
 *
 * A seeded open-world survival run: four biomes, six enemy archetypes, three
 * phase-bosses, deterministic world generation, in-run upgrades, live quest
 * progress and a permanent boss-kill progression saved through the standard
 * module save channel. One module in the registry — the hub, quests,
 * achievements, rewards and results all come from the existing host.
 */

const FRONTIER_QUESTS: QuestDef[] = [
  {
    id: 'q_frontier_first',
    title: 'Into the Frontier',
    description: 'Complete a Frontier run.',
    scope: 'story',
    metric: 'frontier_runs',
    target: 1,
    reward: { coins: 300, xp: 80 },
    game: 'frontier',
    icon: '🌌',
  },
  {
    id: 'q_frontier_kills',
    title: 'Frontier Scrapper',
    description: 'Defeat 25 enemies in Frontier.',
    scope: 'story',
    metric: 'frontier_kills',
    target: 25,
    reward: { coins: 500, xp: 120, items: { mat_scrap: 3 } },
    game: 'frontier',
    icon: '☠️',
  },
  {
    id: 'q_frontier_elite',
    title: 'Elite Hunter',
    description: 'Defeat 2 elite enemies in Frontier.',
    scope: 'story',
    metric: 'frontier_elites',
    target: 2,
    reward: { coins: 800, xp: 160, items: { mat_circuit: 1 } },
    game: 'frontier',
    icon: '🎯',
  },
  {
    id: 'q_frontier_survive',
    title: 'Deep Survival',
    description: 'Survive 5 minutes in one Frontier run.',
    scope: 'story',
    metric: 'frontier_time',
    target: 300,
    reward: { coins: 1000, gems: 2, xp: 200 },
    game: 'frontier',
    icon: '⏱️',
  },
  {
    id: 'q_frontier_boss',
    title: 'Boss Breaker',
    description: 'Defeat a Frontier boss.',
    scope: 'story',
    metric: 'frontier_bosses',
    target: 1,
    reward: { coins: 1500, gems: 5, xp: 300, items: { mat_core: 1 } },
    game: 'frontier',
    icon: '🏆',
  },
];

/* --------------------------------------------------------- achievements --- */

const FRONTIER_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_frontier_explorer',
    title: 'Frontier Explorer',
    description: 'Defeat your first Frontier boss.',
    metric: 'frontier_bosses',
    game: 'frontier',
    icon: '🧭',
    tiers: [{ target: 1, reward: { coins: 1000, gems: 3, xp: 250 } }],
  },
  {
    id: 'ach_frontier_swarmbreaker',
    title: 'Swarm Breaker',
    description: 'Defeat enemies across your Frontier runs.',
    metric: 'frontier_kills',
    game: 'frontier',
    icon: '👾',
    tiers: [
      { target: 25, reward: { coins: 300, xp: 100 } },
      { target: 100, reward: { coins: 1200, gems: 4, xp: 400 } },
      { target: 300, reward: { coins: 4000, gems: 15, xp: 1200 } },
    ],
  },
  {
    id: 'ach_frontier_cartographer',
    title: 'Cartographer',
    description: 'Discover landmarks across the frontier.',
    metric: 'frontier_landmarks',
    game: 'frontier',
    icon: '🗺️',
    tiers: [
      { target: 3, reward: { coins: 500, xp: 150 } },
      { target: 6, reward: { coins: 1500, gems: 5, xp: 500 } },
    ],
  },
  {
    id: 'ach_frontier_victor',
    title: 'Verse Victor',
    description: 'Defeat all three Frontier bosses.',
    metric: 'frontier_bosses',
    game: 'frontier',
    icon: '🏆',
    tiers: [
      { target: 3, reward: { coins: 5000, gems: 25, xp: 1500, items: { mat_core: 2 } } },
    ],
  },
];

/* ----------------------------------------------------------------- module -- */

export const frontierModule: GameModule = {
  id: 'frontier',
  meta: {
    title: 'PocketVerse Frontier',
    tagline: 'Explore. Fight. Survive.',
    glyph: '🌌',
    gradient: 'deep',
    accent: '#4EA8FF',
    energyCost: 4,
    minLevel: 1,
    kind: 'session',
    category: 'adventure',
    tags: ['action', 'levels', 'daily'],
    order: 1,
  },
  Surface: FrontierSurface,
  defaultSave: defaultFrontierSave,
  quests: FRONTIER_QUESTS,
  achievements: FRONTIER_ACHIEVEMENTS,
};
