import type { GameModule } from '@/core/registry';
import { PenFightSurface } from './PenFightSurface';
import { PEN_ITEMS, defaultPenFightSave } from './content';

/**
 * PEN FIGHT — the desk duel.
 *
 * PocketVerse's first 3D game. It sits in the registry exactly like the ten 2D
 * modules: same metadata, same energy gate, same reward envelope, same save
 * channel. The only thing that differs is what happens inside `Surface`, which
 * is the point of the plug-in contract — a renderer is an implementation
 * detail, not a new kind of thing.
 */
export const penfightModule: GameModule = {
  id: 'penfight',
  meta: {
    title: 'Pen Fight',
    tagline: 'Flick, clash, knock it off the desk',
    glyph: '🖊️',
    gradient: 'deep',
    accent: '#4EA8FF',
    energyCost: 2,
    minLevel: 2,
    kind: 'session',
    tags: ['3d', 'physics', 'versus'],
    order: 55,
  },
  Surface: PenFightSurface,
  items: PEN_ITEMS,
  defaultSave: defaultPenFightSave,

  quests: [
    {
      id: 'q_penfight_wins',
      title: 'Desk Champion',
      description: 'Win 2 pen fights.',
      scope: 'daily',
      metric: 'penfight_wins',
      target: 2,
      reward: { coins: 420, xp: 120, items: { mat_scrap: 3 } },
      icon: '🖊️',
    },
    {
      id: 'q_penfight_knockouts',
      title: 'Off The Edge',
      description: 'Knock the rival off 4 times.',
      scope: 'daily',
      metric: 'penfight_knockouts',
      target: 4,
      reward: { coins: 360, items: { mat_circuit: 1 } },
      icon: '🎯',
    },
  ],

  achievements: [
    {
      id: 'ach_penfight_wins',
      title: 'Undisputed',
      description: 'Pen fights won.',
      metric: 'penfight_wins',
      icon: '🏆',
      tiers: [
        { target: 5, reward: { coins: 800 } },
        { target: 40, reward: { coins: 4200, gems: 12, unlocks: ['pen_carbon'] } },
        { target: 250, reward: { coins: 20000, gems: 65, unlocks: ['pen_plasma'] } },
      ],
    },
    {
      id: 'ach_penfight_knockouts',
      title: 'Desk Sweeper',
      description: 'Rival pens sent over the edge.',
      metric: 'penfight_knockouts',
      icon: '🧹',
      tiers: [
        { target: 25, reward: { coins: 900 } },
        { target: 200, reward: { coins: 5000, gems: 15 } },
        { target: 1200, reward: { coins: 24000, gems: 70, unlocks: ['pen_gold'] } },
      ],
    },
  ],
};
