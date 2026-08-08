import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';

export const dodgeDuelModule: GameModule = {
  id: 'dodgeduel',
  meta: {
    title: 'Dodge Duel',
    tagline: 'It only stops when one of you does',
    glyph: '💥',
    gradient: 'mint',
    accent: '#34E2A8',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['action', 'versus', '3d'],
    order: 240,
    category: 'versus',
    players: 2,
  },
  Surface: createLazySurface(() => import('./DodgeDuelGame'), '💥', 'Loading the sky'),
};
