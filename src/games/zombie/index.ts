import type { GameModule } from '@/core/registry';
import { ZombieSurface } from './ZombieSurface';
import { WEAPON_ITEMS, defaultZombieSave } from './content';

export const zombieModule: GameModule = {
  id: 'zombie',
  meta: {
    title: 'Last Signal',
    tagline: 'Hold the line, upgrade, repeat',
    glyph: '🧟',
    gradient: 'blood',
    accent: '#FF4D4D',
    energyCost: 3,
    minLevel: 3,
    kind: 'session',
    tags: ['action', 'survival', 'upgrades'],
    order: 50,
  },
  Surface: ZombieSurface,
  items: WEAPON_ITEMS,
  defaultSave: defaultZombieSave,

  quests: [
    {
      id: 'q_zombie_kills',
      title: 'Cleanup',
      description: 'Take down 60 zombies.',
      scope: 'daily',
      metric: 'zombies_killed',
      target: 60,
      reward: { coins: 380, xp: 110, items: { mat_scrap: 4 } },
      icon: '🧟',
    },
    {
      id: 'q_zombie_waves',
      title: 'Hold Out',
      description: 'Clear 5 waves.',
      scope: 'daily',
      metric: 'waves_cleared',
      target: 5,
      reward: { coins: 460, items: { mat_circuit: 2 } },
      icon: '🛡️',
    },
  ],

  achievements: [
    {
      id: 'ach_zombie_kills',
      title: 'Exterminator',
      description: 'Total zombies eliminated.',
      metric: 'zombies_killed',
      icon: '☠️',
      tiers: [
        { target: 250, reward: { coins: 700 } },
        { target: 2500, reward: { coins: 4000, gems: 15, unlocks: ['smg'] } },
        { target: 15000, reward: { coins: 18000, gems: 60, unlocks: ['railgun'] } },
      ],
    },
  ],
};
