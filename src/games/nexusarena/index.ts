import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';
import { CHARS, DEFAULT_SAVE } from './content';
import type { NexusSave } from './types';

export const nexusArenaModule: GameModule = {
  id: 'nexusarena',
  meta: {
    title: 'PocketVerse: Nexus Arena',
    tagline: 'Pick a hero → enter a beautiful 3D arena → fight → win',
    glyph: '✦',
    gradient: 'violet',
    accent: '#7C5CFF',
    energyCost: 2,
    minLevel: 0,
    kind: 'session',
    tags: ['3d', 'arena', 'flagship', 'multiplayer'],
    order: 1,
    category: 'versus',
    players: 4,
    difficulty: 'hard',
    session: '2–4 min',
  },
  Surface: createLazySurface(() => import('./NexusArenaSurface'), '✦', 'Entering Nexus'),
  defaultSave: (): NexusSave => ({ ...DEFAULT_SAVE }),
  items: Object.values(CHARS).map(c => ({
    id: `nexus_${c.id}`,
    name: c.name,
    kind: 'cosmetic' as const,
    rarity: c.id === 'nova' || c.id === 'bolt' ? 'common' as const : 'epic' as const,
    glyph: c.glyph,
    description: `${c.name} — ${c.desc}. ${c.abilityDesc.attack}`,
    value: 650,
    stackable: false,
    slot: 'pet' as const,
    source: 'nexusarena' as const,
  })),
  quests: [
    { id: 'nexus_kos_5', title: 'First Blood', description: 'Get 5 KOs in Nexus Arena', scope: 'daily', metric: 'arena_kos', target: 5, reward: { coins: 120, xp: 40 }, icon: '⚔️' },
    { id: 'nexus_wins_1', title: 'Victory', description: 'Win a match', scope: 'weekly', metric: 'arena_wins', target: 1, reward: { coins: 250, gems: 1 }, icon: '🏆' },
  ],
  achievements: [
    {
      id: 'nexus_wins',
      title: 'Nexus Champion',
      description: 'Wins in Nexus Arena',
      metric: 'arena_wins',
      tiers: [
        { target: 1, reward: { coins: 100 } },
        { target: 10, reward: { coins: 600, gems: 2 } },
        { target: 30, reward: { coins: 1500, gems: 4, unlocks: ['nexus_guard'] } },
      ],
      icon: '✦',
    },
  ],
};
