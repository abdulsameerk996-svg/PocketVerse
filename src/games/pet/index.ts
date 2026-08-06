import type { GameModule } from '@/core/registry';
import { PetSurface } from './PetSurface';
import { PET_ITEMS } from './content';
import { DECAY_PER_HOUR, PET_STAT_KEYS, wellbeing, type PetSave } from './types';
import { clamp } from '@/core/utils/format';
import { dayKey } from '@/core/utils/time';

const defaultSave = (): PetSave => ({
  name: 'Nimbus',
  hunger: 80,
  happiness: 80,
  energy: 90,
  hygiene: 85,
  bond: 1,
  bondXp: 0,
  sleeping: false,
  lastTick: Date.now(),
  toys: ['toy_ball'],
  careToday: 0,
  careDay: dayKey(),
});

export const petModule: GameModule = {
  id: 'pet',
  meta: {
    title: 'Pocket Pet',
    tagline: 'Feed it, play with it, do not forget it exists',
    glyph: '🐣',
    gradient: 'candy',
    accent: '#FF6BD6',
    energyCost: 0,
    minLevel: 1,
    kind: 'ambient',
    tags: ['care', 'idle', 'cosy'],
    order: 10,
  },
  Surface: PetSurface,
  items: PET_ITEMS,
  defaultSave,

  quests: [
    {
      id: 'q_pet_care',
      title: 'Good Owner',
      description: 'Perform 5 care actions.',
      scope: 'daily',
      metric: 'pet_care_actions',
      target: 5,
      reward: { coins: 220, xp: 70 },
      icon: '🐣',
    },
    {
      id: 'q_pet_feed',
      title: 'Full Belly',
      description: 'Feed your pet 3 times.',
      scope: 'daily',
      metric: 'pet_fed',
      target: 3,
      reward: { coins: 180, items: { mat_scrap: 2 } },
      icon: '🍖',
    },
  ],

  achievements: [
    {
      id: 'ach_pet_bond',
      title: 'Inseparable',
      description: 'Care for your pet over and over.',
      metric: 'pet_care_actions',
      icon: '💞',
      tiers: [
        { target: 25, reward: { coins: 400 } },
        { target: 150, reward: { coins: 2000, gems: 8 } },
        { target: 600, reward: { coins: 9000, gems: 30, unlocks: ['pet_ghost'] } },
      ],
    },
  ],

  /**
   * Offline decay. The pet is the clearest demonstration of the offline-first
   * design: no timers, no notifications, no server — just a wall-clock delta
   * folded in at boot.
   */
  simulateOffline: (save: PetSave, elapsedMs) => {
    const hours = elapsedMs / 3_600_000;
    if (hours < 0.05) return null;

    const next: PetSave = { ...save };
    const sleepFactor = save.sleeping ? 0.5 : 1;

    for (const key of PET_STAT_KEYS) {
      const rate = DECAY_PER_HOUR[key] * (key === 'hunger' ? 1 : sleepFactor);
      next[key] = clamp(save[key] - rate * hours, 0, 100);
    }
    // Sleeping restores energy instead of draining it.
    if (save.sleeping) next.energy = clamp(save.energy + 9 * hours, 0, 100);
    next.lastTick = Date.now();

    const before = wellbeing(save);
    const after = wellbeing(next);

    let notice: string | undefined;
    if (after < 30) notice = `${save.name} is in a bad way — check on them.`;
    else if (save.sleeping && next.energy > 95) notice = `${save.name} is fully rested.`;
    else if (before - after > 20) notice = `${save.name} missed you.`;

    // A well-kept pet earns passively — the reason to come back.
    const reward =
      after > 70 && hours > 1
        ? { coins: Math.round(Math.min(hours, 12) * 18 * (1 + save.bond * 0.08)) }
        : undefined;

    return { save: next, notice, reward };
  },
};
