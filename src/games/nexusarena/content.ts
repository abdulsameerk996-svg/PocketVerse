import type { NexusSave, CharId } from './types';

export type CharDef = {
  id: CharId;
  name: string;
  glyph: string;
  color: string;
  accent: string;
  hp: number;
  speed: number;
  damage: number;
  abilityDesc: Record<string, string>;
  desc: string;
};

export const CHARS: Record<CharId, CharDef> = {
  nova: {
    id: 'nova',
    name: 'Nova',
    glyph: '✦',
    color: '#FFD166',
    accent: '#FFB020',
    hp: 110,
    speed: 1.0,
    damage: 20,
    abilityDesc: {
      attack: 'Pulse Strike — fast forward slash',
      dash: 'Phase Dash — invulnerable blink',
      shield: 'Aegis Field — blocks 1 hit',
      ultimate: 'Solar Flare — radial burn + knockback',
    },
    desc: 'Balanced striker — easy to learn',
  },
  bolt: {
    id: 'bolt',
    name: 'Volt',
    glyph: '⚡',
    color: '#4EA8FF',
    accent: '#89C4FF',
    hp: 90,
    speed: 1.18,
    damage: 18,
    abilityDesc: {
      attack: 'Chain Zap — arcs to nearby foe',
      dash: 'Lightning Step — zigzag dash',
      shield: 'Static Field — slows nearby',
      ultimate: 'Thunder Cage — traps area',
    },
    desc: 'Fast assassin',
  },
  guard: {
    id: 'guard',
    name: 'Brick',
    glyph: '🛡️',
    color: '#4ADE80',
    accent: '#86EFAC',
    hp: 150,
    speed: 0.86,
    damage: 26,
    abilityDesc: {
      attack: 'Hammer Slam — slow heavy',
      dash: 'Bulwark Charge — unstoppable',
      shield: 'Stone Wall — 3s immunity',
      ultimate: 'Quake — ground slam stun',
    },
    desc: 'Tank — controls space',
  },
  spectre: {
    id: 'spectre',
    name: 'Spectre',
    glyph: '👻',
    color: '#A78BFA',
    accent: '#C4B5FD',
    hp: 95,
    speed: 1.12,
    damage: 19,
    abilityDesc: {
      attack: 'Wisp Slash — ranged phantom',
      dash: 'Fade — invisible briefly',
      shield: 'Mirror — reflects projectile',
      ultimate: 'Void Rift — pulls foes',
    },
    desc: 'Tricky support',
  },
};

export const DEFAULT_SAVE: NexusSave = {
  matches: 0,
  wins: 0,
  bestScore: 0,
  totalKOs: 0,
  unlockedChars: ['nova', 'bolt'],
  selectedChar: 'nova',
  trophies: 0,
};

export function normalizeSave(raw: unknown): NexusSave {
  const base = DEFAULT_SAVE;
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<NexusSave>;
  const num = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  return {
    matches: Math.max(0, Math.floor(num(s.matches))),
    wins: Math.max(0, Math.floor(num(s.wins))),
    bestScore: Math.max(0, Math.floor(num(s.bestScore))),
    totalKOs: Math.max(0, Math.floor(num(s.totalKOs))),
    unlockedChars: Array.isArray(s.unlockedChars) ? s.unlockedChars.filter(x => typeof x === 'string') : base.unlockedChars,
    selectedChar: typeof s.selectedChar === 'string' && (CHARS as any)[s.selectedChar] ? s.selectedChar as any : 'nova',
    trophies: Math.max(0, Math.floor(num(s.trophies))),
  };
}

export const ARENA_RADIUS = 7.5;
export const MATCH_DURATION = 100; // 100s ~ 1:40, shortish but 3 min target is 180, we use 100 for fast rounds, can be 180 later

export const ABILITY_CD: Record<string, number> = {
  attack: 0.45,
  dash: 2.2,
  shield: 6.5,
  ultimate: 18,
};

export function rewardForMatch(won: boolean, score: number, kos: number): { coins: number; xp: number; gems: number; items: Record<string, number> } {
  return {
    coins: Math.round(40 + score * 0.12 + kos * 18 + (won ? 80 : 0)),
    xp: Math.round(25 + score * 0.06 + kos * 8 + (won ? 40 : 0)),
    gems: won ? 1 : 0,
    items: won ? { mat_circuit: 1 } : { mat_scrap: 1 },
  };
}
