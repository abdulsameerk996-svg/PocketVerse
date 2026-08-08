import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';

export const colorClashModule: GameModule = {
  id: 'colorclash',
  meta: {
    title: 'Color Clash',
    tagline: 'Paint the floor. Steal it back.',
    glyph: '🎨',
    gradient: 'candy',
    accent: '#C05CFF',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['versus', '3d', 'party'],
    order: 230,
    category: 'versus',
    players: 2,
  },
  Surface: createLazySurface(() => import('./ColorClashGame'), '🎨', 'Priming the floor'),
};
