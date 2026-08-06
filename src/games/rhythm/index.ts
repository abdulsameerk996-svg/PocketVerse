import type { GameModule } from '@/core/registry';
import { RhythmSurface } from './RhythmSurface';
import type { RhythmSave } from './types';

export const rhythmModule: GameModule = {
  id: 'rhythm',
  meta: {
    title: 'Signal Beat',
    tagline: 'Five tracks, four lanes, one combo meter',
    glyph: '🎧',
    gradient: 'candy',
    accent: '#FF4D8D',
    energyCost: 2,
    minLevel: 2,
    kind: 'session',
    tags: ['rhythm', 'timing', 'combo'],
    order: 90,
  },
  Surface: RhythmSurface,
  defaultSave: (): RhythmSave => ({ best: {}, cleared: 0 }),

  quests: [
    {
      id: 'q_rhythm_notes',
      title: 'On Beat',
      description: 'Hit 250 notes.',
      scope: 'daily',
      metric: 'notes_hit',
      target: 250,
      reward: { coins: 320, xp: 100 },
      icon: '🎵',
    },
    {
      id: 'q_rhythm_combo',
      title: 'Unbroken',
      description: 'Reach a 60 combo.',
      scope: 'daily',
      metric: 'max_combo',
      target: 60,
      reward: { coins: 420, gems: 2 },
      icon: '🔥',
    },
  ],

  achievements: [
    {
      id: 'ach_rhythm_combo',
      title: 'In the Pocket',
      description: 'Highest combo reached.',
      metric: 'max_combo',
      icon: '🎼',
      tiers: [
        { target: 50, reward: { coins: 500 } },
        { target: 200, reward: { coins: 3000, gems: 12, unlocks: ['trail_neon'] } },
        { target: 500, reward: { coins: 14000, gems: 50, unlocks: ['deco_neonsign'] } },
      ],
    },
  ],
};
