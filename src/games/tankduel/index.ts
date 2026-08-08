import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';

export const tankDuelModule: GameModule = {
  id: 'tankduel',
  meta: {
    title: 'Tank Duel',
    tagline: 'Aim where you drive. Cover will not last.',
    glyph: '🎯',
    gradient: 'toxic',
    accent: '#A3E635',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['action', 'versus', '3d'],
    order: 220,
    category: 'versus',
    players: 2,
  },
  Surface: createLazySurface(() => import('./TankDuelGame'), '🎯', 'Rolling out'),
};
