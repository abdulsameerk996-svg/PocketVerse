import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';

export const sumoModule: GameModule = {
  id: 'sumo',
  meta: {
    title: 'Sumo Push',
    tagline: 'Shove them off. Do not follow them.',
    glyph: '🤼',
    gradient: 'gold',
    accent: '#FFB443',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['action', 'versus', '3d'],
    order: 210,
    category: 'versus',
    players: 2,
  },
  Surface: createLazySurface(() => import('./SumoGame'), '🤼', 'Sweeping the ring'),
};
