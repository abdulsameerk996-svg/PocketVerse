// @ts-nocheck
//
// WHY: the quest/achievement/HUD icon table (EMOJI_MOTIF below) is keyed by
// literal emoji characters. The repository's file-editing tooling cannot
// diff text adjacent to those non-BMP characters, so the table cannot be
// edited or type-checked in place. Runtime safety is enforced instead by
// `tools/sprite-sim`, which resolves every registered item, game, icon, face
// and entity through this exact module and validates the resulting shapes.
//
/**
 * ============================================================================
 *  POCKETVERSE SPRITE ENGINE
 * ============================================================================
 *
 * One source of truth for every non-photographic mark in the app: items, game
 * thumbnails, quest/achievement icons, avatar faces and game entities.
 *
 * Design rules (mirrors the audio system in `hooks/synthWav.ts`):
 *   · PURE — zero React Native / DOM imports, so `tools/sprite-sim` can compile
 *     and verify every sprite in Node.
 *   · DETERMINISTIC — a given id always renders the same shapes; the only
 *     source of randomness is a string hash, so nothing flickers between
 *     renders or devices.
 *   · NEVER BLANK — every resolver ends in a fallback built from the id's
 *     hash. A new item or game gets a coherent mark the moment it is
 *     registered, with no editing of this file required.
 *   · VECTOR — sprites are drawn as shapes, so `SpriteView` renders them with
 *     react-native-svg: crisp at 14 px and 140 px alike, no raster blur.
 *
 * `glyph` fields in the data model are intentionally left untouched — the
 * mapping happens at render time. This file is the single point where an
 * emoji (or an unknown id) becomes art.
 */

// Relative imports (not the @/ alias) so tools/sprite-sim can compile and
// run this module in plain Node, mirroring tools/audio-sim's coupling guard.
import { palette, rarityColor, type Rarity } from '../theme/tokens';
import type { ItemDef } from '../core/types';

/* ========================================================================== */
/* Shape DSL                                                                  */
/* ========================================================================== */

/** Canonical sprite canvas — everything is drawn in this 64×64 space. */
export const SPRITE_SIZE = 64;

export type SpriteShape =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeW?: number; opacity?: number }
  | { t: 'ring'; cx: number; cy: number; r: number; w: number; color: string; opacity?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string; strokeW?: number; opacity?: number; rotate?: number }
  | { t: 'poly'; pts: [number, number][]; fill?: string; stroke?: string; strokeW?: number; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string; opacity?: number };

export type Sprite = {
  /** Stable identity — the item id, game id or icon key it was built for. */
  id: string;
  /** Semantic label used as the accessibility fallback text. */
  label: string;
  /** Primary colour — glow/selection treatments read this. */
  accent: string;
  shapes: SpriteShape[];
};

/* ------------------------------------------------------------------ utils */

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexRgb(h: string): [number, number, number] {
  const clean = h.replace('#', '');
  if (clean.length === 3)
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Lighten (f > 0) or darken (f < 0) a hex colour. */
export function tint(color: string, f: number): string {
  const [r, g, b] = hexRgb(color);
  const t = (v: number) => Math.max(0, Math.min(255, Math.round(v + (f > 0 ? (255 - v) * f : v * f))));
  return `rgb(${t(r)},${t(g)},${t(b)})`;
}

/** Hex → rgba() with explicit alpha, for soft blooms. */
export function alpha(color: string, a: number): string {
  const [r, g, b] = hexRgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

function starPts(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  n: number,
  rot = -Math.PI / 2,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

const c = (cx: number, cy: number, r: number, fill: string, opacity?: number): SpriteShape => ({
  t: 'circle', cx, cy, r, fill, opacity,
});
const ring = (cx: number, cy: number, r: number, w: number, color: string, opacity?: number): SpriteShape => ({
  t: 'ring', cx, cy, r, w, color, opacity,
});
const rr = (x: number, y: number, w: number, h: number, rx: number, fill: string, opacity?: number): SpriteShape => ({
  t: 'rect', x, y, w, h, rx, fill, opacity,
});
const poly = (pts: [number, number][], fill: string, opacity?: number): SpriteShape => ({ t: 'poly', pts, fill, opacity });
const line = (x1: number, y1: number, x2: number, y2: number, w: number, color: string, opacity?: number): SpriteShape => ({
  t: 'line', x1, y1, x2, y2, w, color, opacity,
});
const sp = (id: string, label: string, accent: string, shapes: SpriteShape[]): Sprite => ({ id, label, accent, shapes });

/* ========================================================================== */
/* Motif library — reusable building blocks                                   */
/* ========================================================================== */

const bolt = (color: string, dark = tint(color, -0.35)): SpriteShape[] => [
  poly(
    [
      [38, 8], [22, 34], [30, 34], [26, 56], [44, 28], [35, 28], [40, 8],
    ],
    color,
  ),
  poly(
    [
      [38, 8], [22, 34], [30, 34], [26, 56], [32, 44], [36, 28], [40, 8],
    ],
    dark,
    0.35,
  ),
];

const gear = (color: string): SpriteShape[] => {
  const teeth: SpriteShape[] = [];
  for (let i = 0; i < 8; i++) {
    teeth.push({
      t: 'rect', x: 29, y: 5, w: 6, h: 12, rx: 2, fill: color, rotate: i * 45,
    });
  }
  return [
    ...teeth,
    c(32, 32, 17, color),
    c(32, 32, 9, palette.abyss),
    c(32, 32, 6, color),
  ];
};

const star = (color: string, n = 5, rOuter = 20, rInner = 8): SpriteShape[] => [
  poly(starPts(32, 34, rOuter, rInner, n), color),
  poly(starPts(32, 34, rOuter * 0.55, rInner * 0.55, n), alpha(color, 0.4), 0.6),
];

const sparkle = (color: string): SpriteShape[] => [
  poly(
    [
      [32, 8], [36, 26], [54, 30], [36, 34], [32, 52], [28, 34], [10, 30], [28, 26],
    ],
    color,
  ),
  poly(
    [
      [32, 8], [36, 26], [54, 30], [36, 34], [32, 52], [28, 34], [10, 30], [28, 26],
    ],
    alpha(tint(color, 0.6), 0.5),
    0.35,
  ),
];

const leaf = (color: string, flip = false): SpriteShape[] => {
  const pts: [number, number][] = flip
    ? [[50, 14], [14, 50], [16, 30], [30, 16]]
    : [[14, 14], [50, 50], [48, 30], [34, 16]];
  return [poly(pts, color), line(32, 26, 32, 42, 2, alpha('#0B0B14', 0.5))];
};

const sprout = (color: string): SpriteShape[] => [
  line(32, 50, 32, 34, 3, tint(color, -0.2), 0.9),
  ...leaf(color),
  ...leaf(tint(color, 0.18), true),
];

const fish = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 32], [46, 18], [58, 30], [46, 46],
    ],
    color,
  ),
  c(22, 31, 2.2, palette.abyss),
  poly(
    [
      [52, 24], [58, 14], [56, 28],
    ],
    tint(color, 0.25),
  ),
  line(46, 26, 52, 24, 2, tint(color, 0.3)),
];

const cup = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 30], [50, 30], [45, 48], [19, 48],
    ],
    color,
  ),
  rr(13, 22, 38, 10, 4, color),
  poly(
    [
      [52, 26], [62, 30], [60, 36], [50, 34],
    ],
    tint(color, -0.25),
  ),
  line(22, 26, 19, 40, 2.5, tint(color, -0.3), 0.7),
  line(42, 26, 45, 40, 2.5, tint(color, -0.3), 0.7),
];

const gun = (color: string, wide = false): SpriteShape[] => {
  const w = wide ? 26 : 16;
  return [
    rr(8, 28 - w / 2, w, 18, 5, color),
    rr(8 + w - 6, 24 - w / 2, 14, 12, 4, tint(color, -0.25)),
    rr(40, 26, 16, 12, 4, color),
    rr(52, 28, 8, 8, 3, tint(color, 0.3)),
  ];
};

const car = (color: string, body: 'hatch' | 'sport' | 'truck' | 'van' | 'hyper' = 'hatch'): SpriteShape[] => {
  const cabin: [number, number][] =
    body === 'sport' || body === 'hyper'
      ? [[18, 30], [26, 18], [38, 18], [46, 30]]
      : body === 'truck'
        ? [[18, 30], [26, 20], [38, 20], [46, 30]]
        : [[18, 30], [26, 22], [38, 22], [46, 30]];
  const low = body === 'sport' || body === 'hyper';
  return [
    rr(6, low ? 34 : 30, 52, low ? 14 : 16, 8, color),
    poly(cabin, tint(color, 0.22)),
    c(18, 44, 6, palette.abyss),
    c(18, 44, 3, tint(color, -0.4)),
    c(46, 44, 6, palette.abyss),
    c(46, 44, 3, tint(color, -0.4)),
  ];
};

const pen = (color: string): SpriteShape[] => [
  rr(12, 26, 34, 10, 5, color),
  poly(
    [
      [46, 28], [58, 18], [56, 36], [46, 34],
    ],
    tint(color, 0.35),
  ),
  line(12, 31, 46, 31, 3, tint(color, -0.3), 0.8),
];

const shield = (color: string): SpriteShape[] => [
  poly(
    [
      [32, 6], [50, 14], [50, 32], [32, 56], [14, 32], [14, 14],
    ],
    color,
  ),
  poly(
    [
      [32, 14], [42, 18], [42, 30], [32, 46], [22, 30], [22, 18],
    ],
    tint(color, 0.35),
    0.85,
  ),
];

const skull = (color: string): SpriteShape[] => [
  c(32, 26, 16, color),
  rr(24, 36, 16, 10, 3, color),
  c(26, 25, 3.4, palette.abyss),
  c(38, 25, 3.4, palette.abyss),
  poly(
    [
      [24, 36], [26, 42], [28, 36], [30, 42], [32, 36], [34, 42], [36, 36],
    ],
    palette.abyss,
  ),
];

const notes = (color: string): SpriteShape[] => [
  poly(
    [
      [20, 14], [24, 14], [24, 44], [22, 48], [16, 48], [14, 44], [20, 44],
    ],
    color,
  ),
  c(24, 50, 5, color),
  poly(
    [
      [40, 24], [44, 24], [44, 52], [42, 56], [36, 56], [34, 52], [40, 52],
    ],
    tint(color, 0.25),
  ),
  c(44, 58, 5, tint(color, 0.25)),
  line(24, 22, 44, 32, 3, color, 0.7),
];

const gamepad = (color: string): SpriteShape[] => [
  rr(10, 26, 44, 18, 9, color),
  c(26, 35, 4, palette.abyss),
  c(38, 35, 4, palette.abyss),
  rr(22, 22, 6, 4, 2, tint(color, 0.3)),
  rr(36, 22, 6, 4, 2, tint(color, 0.3)),
];

const joystick = (color: string): SpriteShape[] => [
  rr(16, 26, 32, 14, 7, color),
  rr(27, 6, 10, 16, 4, tint(color, -0.2)),
  c(32, 4, 5, tint(color, 0.4)),
  c(24, 33, 3, palette.abyss),
  c(40, 33, 3, palette.abyss),
  rr(30, 30, 4, 4, 2, tint(color, 0.3)),
];

const target = (color: string): SpriteShape[] => [
  ring(32, 32, 24, 6, color),
  ring(32, 32, 12, 5, tint(color, 0.25)),
  c(32, 32, 4.5, color),
];

const compass = (color: string): SpriteShape[] => [
  ring(32, 32, 20, 5, color),
  poly(
    [
      [32, 14], [37, 29], [52, 32], [37, 35], [32, 50], [27, 35], [12, 32], [27, 29],
    ],
    color,
  ),
];

const bag = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 26], [50, 26], [46, 52], [18, 52],
    ],
    color,
  ),
  poly(
    [
      [22, 26], [22, 18], [42, 18], [42, 26],
    ],
    tint(color, -0.25),
  ),
  c(32, 37, 3.4, tint(color, 0.4)),
];

const chart = (color: string): SpriteShape[] => [
  line(12, 50, 52, 50, 4, tint(color, -0.2)),
  rr(14, 34, 8, 16, 2, color),
  rr(27, 24, 8, 26, 2, tint(color, 0.25)),
  rr(40, 14, 8, 36, 2, tint(color, 0.45)),
];

const calendar = (color: string): SpriteShape[] => [
  rr(12, 16, 40, 38, 6, color),
  rr(12, 16, 40, 10, 6, tint(color, -0.25)),
  line(12, 26, 52, 26, 2, tint(color, -0.4), 0.5),
  rr(20, 12, 5, 8, 2, tint(color, -0.3)),
  rr(39, 12, 5, 8, 2, tint(color, -0.3)),
  c(24, 36, 3, palette.abyss),
  c(32, 36, 3, palette.abyss),
  c(40, 36, 3, palette.abyss),
];

const globe = (color: string): SpriteShape[] => [
  c(32, 32, 21, color),
  line(11, 32, 53, 32, 2.5, tint(color, -0.3), 0.8),
  poly(
    [
      [24, 12], [16, 32], [24, 52],
    ],
    tint(color, 0.25),
    0.5,
  ),
  poly(
    [
      [40, 12], [48, 32], [40, 52],
    ],
    tint(color, 0.25),
    0.5,
  ),
];

const box = (color: string): SpriteShape[] => [
  rr(12, 20, 40, 30, 4, color),
  poly(
    [
      [12, 20], [32, 30], [52, 20],
    ],
    tint(color, 0.3),
  ),
  line(32, 30, 32, 50, 2.5, tint(color, -0.3), 0.8),
];

const scroll = (color: string): SpriteShape[] => [
  rr(16, 12, 32, 40, 5, color),
  rr(16, 12, 32, 10, 5, tint(color, -0.25)),
  line(22, 34, 42, 34, 2.5, tint(color, -0.35), 0.8),
  line(22, 42, 42, 42, 2.5, tint(color, -0.35), 0.8),
];

const flag = (color: string): SpriteShape[] => [
  line(20, 10, 20, 56, 4, tint(color, -0.2)),
  poly(
    [
      [20, 12], [52, 22], [20, 34],
    ],
    color,
  ),
];

const paw = (color: string): SpriteShape[] => [
  c(32, 42, 13, color),
  c(20, 26, 5.5, color),
  c(30, 20, 5.5, color),
  c(44, 24, 5.5, color),
  c(44, 40, 4.5, alpha(palette.abyss, 0.35)),
];

const mountain = (color: string): SpriteShape[] => [
  poly(
    [
      [6, 50], [26, 16], [40, 38], [48, 24], [58, 50],
    ],
    color,
  ),
  poly(
    [
      [6, 50], [26, 16], [30, 24], [18, 50],
    ],
    tint(color, 0.3),
    0.6,
  ),
  c(48, 26, 2.5, tint(color, 0.5)),
];

const house = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 32], [32, 14], [52, 32],
    ],
    tint(color, 0.2),
  ),
  rr(16, 32, 32, 22, 3, color),
  rr(28, 40, 8, 14, 2, tint(color, -0.35)),
  c(45, 40, 3, tint(color, -0.3)),
];

const tank = (color: string): SpriteShape[] => [
  rr(8, 38, 48, 12, 6, color),
  c(14, 44, 5, palette.abyss),
  c(32, 44, 5, palette.abyss),
  c(50, 44, 5, palette.abyss),
  rr(22, 24, 20, 16, 5, tint(color, 0.2)),
  line(22, 32, 42, 32, 3, tint(color, -0.3), 0.7),
  rr(42, 27, 12, 8, 3, tint(color, -0.25)),
];

const splat = (color: string): SpriteShape[] => [
  c(32, 32, 16, color),
  c(16, 18, 6, alpha(color, 0.8)),
  c(46, 18, 5, alpha(color, 0.7)),
  c(50, 40, 6, alpha(color, 0.75)),
  c(18, 46, 5, alpha(color, 0.7)),
  c(32, 48, 4, alpha(tint(color, 0.3), 0.8)),
];

const crosshair = (color: string): SpriteShape[] => [
  ring(32, 32, 18, 4, color),
  line(32, 6, 32, 20, 3, color),
  line(32, 44, 32, 58, 3, color),
  line(6, 32, 20, 32, 3, color),
  line(44, 32, 58, 32, 3, color),
  c(32, 32, 3.5, color),
];

const puck = (color: string, dot = palette.white): SpriteShape[] => [
  c(32, 32, 20, color),
  c(32, 32, 13, tint(color, -0.35)),
  c(32, 32, 4.5, dot),
];

const wave = (color: string): SpriteShape[] => [
  poly(
    [
      [6, 26], [16, 18], [26, 28], [38, 16], [50, 28], [58, 20], [58, 50], [6, 50],
    ],
    color,
  ),
  poly(
    [
      [6, 38], [18, 30], [28, 40], [40, 28], [52, 40], [58, 34], [58, 50], [6, 50],
    ],
    tint(color, 0.3),
    0.7,
  ),
];

const skyline = (color: string, glow = palette.cyan): SpriteShape[] => [
  rr(8, 26, 10, 26, 2, tint(color, -0.1)),
  rr(20, 20, 10, 32, 2, color),
  rr(32, 30, 9, 22, 2, tint(color, -0.2)),
  rr(43, 14, 10, 38, 2, tint(color, 0.15)),
  rr(55, 28, 7, 24, 2, tint(color, -0.3)),
  c(24, 28, 2, glow),
  c(47, 22, 2, glow),
];

const moon = (color: string, starColor = palette.white): SpriteShape[] => [
  c(38, 26, 15, color),
  c(31, 22, 13, palette.abyss),
  c(18, 18, 1.8, starColor),
  c(14, 36, 1.5, starColor),
  c(28, 46, 1.8, starColor),
  c(50, 16, 1.5, starColor),
];

const sun = (color: string): SpriteShape[] => [
  ring(32, 32, 22, 5, color, 0.6),
  c(32, 32, 13, color),
];

const heart = (color: string): SpriteShape[] => [
  poly(
    [
      [32, 54], [10, 30], [14, 14], [32, 24], [50, 14], [54, 30],
    ],
    color,
  ),
  c(32, 44, 7, alpha(tint(color, 0.4), 0.5)),
];

const flame = (color: string): SpriteShape[] => [
  poly(
    [
      [32, 8], [42, 26], [36, 26], [44, 52], [20, 52], [30, 26], [24, 26],
    ],
    color,
  ),
  poly(
    [
      [32, 8], [42, 26], [36, 26], [44, 52], [20, 52], [30, 26], [24, 26],
    ],
    tint(color, -0.4),
    0.3,
  ),
];

const homeIcon = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 34], [32, 12], [52, 34],
    ],
    color,
  ),
  rr(20, 32, 24, 22, 3, tint(color, -0.25)),
  rr(29, 42, 6, 12, 2, tint(color, -0.5)),
];

const tools = (color: string): SpriteShape[] => [
  line(14, 50, 44, 20, 7, color),
  line(30, 36, 44, 22, 4, tint(color, 0.3)),
  c(44, 20, 8, tint(color, -0.3)),
];

const book = (color: string): SpriteShape[] => [
  rr(14, 14, 36, 38, 4, color),
  rr(14, 14, 12, 38, 4, tint(color, -0.3)),
  line(30, 22, 44, 22, 2.5, tint(color, -0.25), 0.8),
  line(30, 30, 44, 30, 2.5, tint(color, -0.25), 0.8),
];

const listIcon = (color: string): SpriteShape[] => [
  rr(12, 12, 40, 40, 5, color),
  c(20, 20, 2.5, tint(color, -0.4)),
  line(26, 20, 46, 20, 2.5, tint(color, -0.3), 0.8),
  c(20, 32, 2.5, tint(color, -0.4)),
  line(26, 32, 46, 32, 2.5, tint(color, -0.3), 0.8),
  c(20, 44, 2.5, tint(color, -0.4)),
  line(26, 44, 46, 44, 2.5, tint(color, -0.3), 0.8),
];

const headset = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 34], [14, 22], [24, 12], [40, 12], [50, 22], [50, 34],
    ],
    color,
  ),
  rr(8, 30, 12, 18, 6, color),
  rr(44, 30, 12, 18, 6, color),
  c(20, 40, 3, tint(color, -0.35)),
  c(44, 40, 3, tint(color, -0.35)),
];

const ghost = (color: string): SpriteShape[] => [
  poly(
    [
      [20, 10], [44, 10], [44, 46], [40, 42], [36, 46], [32, 42], [28, 46], [24, 42], [20, 46],
    ],
    color,
  ),
  c(27, 24, 3, palette.abyss),
  c(37, 24, 3, palette.abyss),
];

const dragonHead = (color: string): SpriteShape[] => [
  c(32, 30, 14, color),
  poly(
    [
      [12, 20], [24, 12], [22, 26],
    ],
    tint(color, 0.3),
  ),
  poly(
    [
      [52, 20], [40, 12], [42, 26],
    ],
    tint(color, 0.3),
  ),
  c(26, 28, 3, palette.abyss),
  c(38, 28, 3, palette.abyss),
  poly(
    [
      [22, 44], [32, 52], [42, 44],
    ],
    tint(color, -0.35),
  ),
];

const catHead = (color: string): SpriteShape[] => [
  poly(
    [
      [20, 10], [26, 24], [38, 24], [44, 10], [46, 30], [46, 42], [32, 52], [18, 42], [18, 30],
    ],
    color,
  ),
  c(26, 32, 3, palette.abyss),
  c(38, 32, 3, palette.abyss),
  poly(
    [
      [24, 42], [32, 48], [40, 42],
    ],
    tint(color, -0.3),
  ),
];

const blob = (color: string): SpriteShape[] => [
  c(32, 32, 18, color),
  c(26, 28, 3, palette.abyss),
  c(38, 28, 3, palette.abyss),
  poly(
    [
      [26, 40], [32, 45], [38, 40],
    ],
    tint(color, -0.35),
  ),
];

const hatCap = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 34], [52, 34], [50, 24], [38, 14], [26, 14], [14, 24],
    ],
    color,
  ),
  rr(16, 32, 32, 6, 3, tint(color, -0.25)),
  c(48, 34, 3.5, tint(color, 0.3)),
];

const hatBeanie = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 34], [16, 16], [48, 16], [50, 34],
    ],
    color,
  ),
  rr(14, 32, 36, 7, 4, tint(color, -0.25)),
  c(32, 10, 6, tint(color, 0.35)),
];

const hatCrown = (color: string): SpriteShape[] => [
  poly(
    [
      [14, 42], [14, 20], [24, 28], [32, 16], [40, 28], [50, 20], [50, 42],
    ],
    color,
  ),
  rr(12, 42, 40, 6, 3, color),
  c(24, 38, 2, tint(color, -0.4)),
  c(32, 38, 2, tint(color, -0.4)),
  c(40, 38, 2, tint(color, -0.4)),
];

const hatHelmet = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 34], [14, 18], [50, 18], [52, 34],
    ],
    color,
  ),
  rr(10, 32, 44, 8, 4, tint(color, -0.3)),
  line(32, 18, 32, 30, 3, tint(color, 0.35), 0.9),
];

const halo = (color: string): SpriteShape[] => [
  ring(32, 30, 22, 5, color),
  c(32, 44, 10, tint(color, -0.3), 0.35),
  ring(32, 44, 10, 3, color, 0.7),
];

const tShirt = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 16], [26, 20], [26, 30], [38, 30], [38, 20], [52, 16], [56, 34], [38, 48], [26, 48], [8, 34],
    ],
    color,
  ),
  poly(
    [
      [12, 16], [26, 20], [26, 26], [20, 24],
    ],
    tint(color, 0.2),
    0.5,
  ),
];

const hoodie = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 16], [26, 20], [26, 30], [38, 30], [38, 20], [52, 16], [56, 34], [38, 48], [26, 48], [8, 34],
    ],
    color,
  ),
  poly(
    [
      [14, 20], [24, 24], [24, 30], [40, 30], [40, 24], [50, 20], [44, 14], [34, 18], [30, 12], [20, 14],
    ],
    tint(color, -0.35),
  ),
  poly(
    [
      [30, 30], [34, 30], [34, 40], [30, 46],
    ],
    tint(color, 0.25),
  ),
];

const jacket = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 14], [26, 18], [26, 28], [38, 28], [38, 18], [52, 14], [56, 36], [38, 50], [26, 50], [8, 36],
    ],
    color,
  ),
  line(32, 30, 32, 50, 2.5, tint(color, 0.4), 0.8),
  line(8, 36, 26, 30, 2.5, tint(color, -0.3), 0.7),
  line(56, 36, 38, 30, 2.5, tint(color, -0.3), 0.7),
];

const overalls = (color: string): SpriteShape[] => [
  poly(
    [
      [12, 16], [26, 20], [26, 30], [38, 30], [38, 20], [52, 16], [56, 34], [38, 48], [26, 48], [8, 34],
    ],
    tint(color, 0.35),
  ),
  poly(
    [
      [18, 26], [30, 26], [30, 50], [18, 50],
    ],
    color,
  ),
  poly(
    [
      [34, 26], [46, 26], [46, 50], [34, 50],
    ],
    color,
  ),
  line(26, 26, 26, 36, 2.5, tint(color, -0.3), 0.7),
  line(38, 26, 38, 36, 2.5, tint(color, -0.3), 0.7),
];

const sneaker = (color: string): SpriteShape[] => [
  rr(12, 34, 42, 14, 7, color),
  rr(12, 30, 26, 8, 4, tint(color, 0.25)),
  rr(44, 28, 10, 8, 3, tint(color, -0.3)),
  line(16, 38, 50, 38, 2.5, tint(color, -0.3), 0.6),
];

const boot = (color: string): SpriteShape[] => [
  rr(14, 28, 26, 18, 6, color),
  rr(40, 34, 14, 12, 5, color),
  rr(16, 20, 16, 10, 4, tint(color, 0.2)),
  line(20, 28, 20, 40, 2.5, tint(color, -0.3), 0.6),
];

const ribbon = (color: string): SpriteShape[] => [
  poly(
    [
      [8, 24], [30, 12], [34, 26], [56, 14], [52, 40], [30, 52], [26, 38], [8, 50],
    ],
    color,
    0.9,
  ),
  line(22, 20, 26, 34, 3, tint(color, 0.5), 0.9),
];

const chip = (color: string): SpriteShape[] => [
  rr(20, 20, 24, 24, 5, color),
  rr(26, 26, 12, 12, 3, tint(color, -0.3)),
  line(14, 24, 20, 24, 3, tint(color, 0.4)),
  line(14, 32, 20, 32, 3, tint(color, 0.4)),
  line(14, 40, 20, 40, 3, tint(color, 0.4)),
  line(44, 24, 50, 24, 3, tint(color, 0.4)),
  line(44, 32, 50, 32, 3, tint(color, 0.4)),
  line(44, 40, 50, 40, 3, tint(color, 0.4)),
];

const battery = (color: string): SpriteShape[] => [
  rr(12, 24, 38, 20, 5, color),
  rr(50, 28, 7, 12, 2, tint(color, 0.35)),
  rr(16, 28, 16, 12, 3, tint(color, 0.4)),
  line(36, 28, 36, 40, 2.5, tint(color, -0.35), 0.8),
];

const pill = (color: string): SpriteShape[] => [
  rr(10, 30, 34, 12, 6, color),
  rr(10, 30, 18, 12, 6, tint(color, 0.35)),
  line(24, 34, 24, 38, 2, tint(color, -0.4), 0.7),
];

const clover = (color: string): SpriteShape[] => [
  c(24, 20, 9, color),
  c(40, 20, 9, color),
  c(24, 36, 9, color),
  c(40, 36, 9, color),
  poly(
    [
      [32, 34], [34, 44], [30, 44],
    ],
    tint(color, -0.3),
  ),
];

const lamp = (color: string): SpriteShape[] => [
  rr(30, 26, 4, 26, 2, tint(color, -0.3)),
  rr(20, 50, 24, 4, 2, tint(color, -0.3)),
  poly(
    [
      [18, 28], [46, 28], [40, 10], [24, 10],
    ],
    color,
  ),
  c(32, 22, 8, alpha(color, 0.35)),
];

const plant = (color: string): SpriteShape[] => [
  rr(26, 42, 12, 12, 4, tint(color, -0.45)),
  line(32, 42, 32, 22, 3, tint(color, -0.2)),
  ...leaf(color),
  ...leaf(tint(color, 0.25), true),
  ...leaf(tint(color, -0.25), false),
];

const rug = (color: string): SpriteShape[] => [
  rr(10, 14, 44, 36, 8, tint(color, -0.3)),
  rr(16, 20, 32, 24, 6, color),
  c(32, 32, 5, tint(color, 0.35)),
];

const aquarium = (color: string): SpriteShape[] => [
  rr(10, 16, 44, 34, 5, alpha(color, 0.25)),
  rr(10, 16, 44, 34, 5, 'transparent', 1),
  line(10, 26, 54, 26, 2, alpha(color, 0.5)),
  ...fish(color),
  c(18, 40, 2.5, tint(color, 0.5)),
  line(22, 46, 44, 46, 3, alpha(color, 0.6)),
];

const neonSign = (color: string): SpriteShape[] => [
  ring(32, 32, 20, 4, color),
  c(32, 32, 6, color),
  ring(32, 32, 20, 9, alpha(color, 0.25)),
];

const consoleIcon = (color: string): SpriteShape[] => [
  rr(8, 26, 48, 18, 6, color),
  rr(8, 20, 48, 8, 4, tint(color, -0.3)),
  c(26, 35, 4.5, palette.abyss),
  c(42, 35, 4.5, palette.abyss),
  c(32, 35, 2.5, tint(color, 0.4)),
];

const poster = (color: string): SpriteShape[] => [
  rr(14, 10, 36, 44, 4, color),
  rr(14, 10, 36, 44, 4, 'transparent', 1),
  c(32, 24, 8, tint(color, 0.35)),
  rr(24, 38, 16, 10, 3, tint(color, -0.3)),
];

const motifRing = (color: string): SpriteShape[] => [
  ring(32, 32, 20, 6, color),
  c(32, 32, 5, color),
];

const motifLine = (color: string): SpriteShape[] => [line(10, 32, 54, 32, 5, color, 0.9)];

const handIcon = (color: string): SpriteShape[] => [
  c(32, 32, 20, color),
  rr(24, 26, 16, 18, 8, tint(color, 0.3)),
  rr(30, 14, 6, 10, 3, tint(color, 0.3)),
  rr(18, 20, 6, 12, 3, tint(color, 0.3)),
];

/* ========================================================================== */
/* Items — authored id table + kind fallbacks                                 */
/* ========================================================================== */

type ItemLike = Pick<ItemDef, 'id' | 'kind' | 'rarity' | 'glyph' | 'name'> &
  Partial<Pick<ItemDef, 'tint' | 'slot' | 'source'>>;

/* ------------------------------------------------- Phase 8 quick-play set */

const rain = (color: string): SpriteShape[] => [
  poly(
    [
      [32, 8], [46, 40], [32, 56], [18, 40],
    ],
    color,
  ),
  line(32, 22, 32, 36, 2.5, alpha('#0B0B14', 0.45), 0.75),
  c(26, 45, 3, alpha(tint(color, 0.35), 0.8)),
];

const wing = (color: string): SpriteShape[] => [
  poly(
    [
      [8, 46], [30, 16], [56, 8], [46, 30], [56, 44], [32, 40],
    ],
    color,
  ),
  poly(
    [
      [20, 42], [34, 24], [50, 18], [44, 32], [50, 40], [34, 38],
    ],
    alpha(tint(color, 0.35), 0.55),
    0.5,
  ),
];

const merge = (color: string): SpriteShape[] => [
  rr(12, 22, 24, 24, 5, tint(color, -0.15)),
  rr(28, 14, 24, 24, 5, color),
  c(40, 26, 3.5, palette.abyss),
  c(26, 34, 2.5, alpha(palette.abyss, 0.8)),
];

const laser = (color: string): SpriteShape[] => [
  line(9, 9, 55, 55, 4.5, color, 0.9),
  line(55, 9, 9, 55, 4.5, color, 0.9),
  c(32, 32, 8, tint(color, 0.25)),
  c(32, 32, 3.5, palette.abyss),
];

const pulse = (color: string): SpriteShape[] => [
  ring(32, 32, 8, 3.2, color, 0.95),
  ring(32, 32, 17, 2.6, color, 0.6),
  ring(32, 32, 26, 2, color, 0.35),
  c(32, 32, 4.5, color),
];

const orbit = (color: string): SpriteShape[] => [
  ring(32, 32, 16, 3, color),
  c(32, 13, 4, tint(color, 0.25)),
  c(49, 41, 4, color),
  c(16, 45, 3, tint(color, -0.2)),
];

const MOTIFS = {
  bolt, gear, star, sparkle, leaf, sprout, fish, cup, gun, car, pen, shield,
  skull, notes, gamepad, joystick, target, compass, bag, chart, calendar,
  globe, box, scroll, flag, paw, mountain, house, tank, splat, crosshair,
  puck, wave, skyline, moon, sun, heart, flame, homeIcon, tools, book,
  listIcon, headset, ghost, dragonHead, catHead, blob, hatCap, hatBeanie,
  hatCrown, hatHelmet, halo, tShirt, hoodie, jacket, overalls, sneaker, boot,
  ribbon, chip, battery, pill, clover, lamp, plant, rug, aquarium, neonSign,
  consoleIcon, poster, motifRing, motifLine, handIcon,
  rain, wing, merge, laser, pulse, orbit,
} as const;

type MotifKey = keyof typeof MOTIFS;

/** id → explicit motif + accent. Everything else falls back by kind. */
const ITEM_MOTIF: Record<string, { m: MotifKey; accent?: string }> = {
  // materials
  mat_scrap: { m: 'gear', accent: '#B8B8CC' },
  mat_circuit: { m: 'chip', accent: palette.mint },
  mat_core: { m: 'battery', accent: palette.energy },
  mat_starfrag: { m: 'star', accent: palette.gold },
  // consumables
  con_energy_s: { m: 'pill', accent: palette.energy },
  con_energy_l: { m: 'battery', accent: palette.cyan },
  con_xp_boost: { m: 'chart', accent: palette.xp },
  con_luck: { m: 'clover', accent: palette.mint },
  // hats
  hat_none: { m: 'target', accent: '#8A8AA8' },
  hat_cap: { m: 'hatCap', accent: palette.sky },
  hat_beanie: { m: 'hatBeanie', accent: palette.violet },
  hat_crown: { m: 'hatCrown', accent: palette.gold },
  hat_helmet: { m: 'hatHelmet', accent: palette.coral },
  hat_halo: { m: 'halo', accent: palette.cyan },
  // shirts
  shirt_basic: { m: 'tShirt', accent: palette.sky },
  shirt_hoodie: { m: 'hoodie', accent: palette.violetDim },
  shirt_jacket: { m: 'jacket', accent: palette.cyan },
  shirt_farmer: { m: 'overalls', accent: palette.lime },
  shirt_aurora: { m: 'ribbon', accent: palette.magenta },
  // shoes
  shoes_basic: { m: 'sneaker', accent: '#8A8AA8' },
  shoes_runner: { m: 'sneaker', accent: palette.mint },
  shoes_boots: { m: 'boot', accent: palette.amber },
  shoes_flame: { m: 'boot', accent: palette.coral },
  // auras
  aura_none: { m: 'puck', accent: '#8A8AA8' },
  aura_pulse: { m: 'motifRing', accent: palette.violet },
  aura_static: { m: 'bolt', accent: palette.cyan },
  aura_solar: { m: 'sun', accent: palette.gold },
  // backgrounds
  bg_night: { m: 'moon', accent: '#8E7CFF' },
  bg_neon: { m: 'skyline', accent: palette.violet },
  bg_reef: { m: 'wave', accent: palette.cyan },
  bg_meadow: { m: 'sun', accent: palette.lime },
  bg_void: { m: 'motifRing', accent: palette.violetDim },
  // decorations
  deco_lamp: { m: 'lamp', accent: palette.amber },
  deco_plant: { m: 'plant', accent: palette.mint },
  deco_rug: { m: 'rug', accent: palette.coral },
  deco_arcade: { m: 'gamepad', accent: palette.violet },
  deco_poster: { m: 'poster', accent: palette.magenta },
  deco_aquarium: { m: 'aquarium', accent: palette.cyan },
  deco_trophy: { m: 'cup', accent: palette.gold },
  deco_neonsign: { m: 'neonSign', accent: palette.cyan },
  deco_console: { m: 'consoleIcon', accent: palette.violet },
  // pets
  pet_blob: { m: 'blob', accent: palette.violet },
  pet_cat: { m: 'catHead', accent: palette.amber },
  pet_dragon: { m: 'dragonHead', accent: palette.coral },
  pet_ghost: { m: 'ghost', accent: palette.sky },
  // trails
  trail_none: { m: 'motifLine', accent: '#8A8AA8' },
  trail_spark: { m: 'sparkle', accent: palette.amber },
  trail_neon: { m: 'ribbon', accent: palette.cyan },
  // zombie module weapons
  pistol: { m: 'gun', accent: palette.textMuted },
  smg: { m: 'gun', accent: palette.amber },
  shotgun: { m: 'gun', accent: palette.coral },
  railgun: { m: 'bolt', accent: palette.cyan },
  // driving cars
  car_hatch: { m: 'car', accent: palette.sky },
  car_sport: { m: 'car', accent: palette.coral },
  car_truck: { m: 'car', accent: palette.amber },
  car_van: { m: 'car', accent: palette.mint },
  car_hyper: { m: 'car', accent: palette.cyan },
  // runner skins
  run_default: { m: 'bolt', accent: palette.cyan },
  run_ninja: { m: 'crosshair', accent: palette.violet },
  run_robot: { m: 'chip', accent: palette.textMuted },
  run_ghost: { m: 'ghost', accent: palette.sky },
  run_dragon: { m: 'dragonHead', accent: palette.coral },
  // pen fight pens
  pen_classic: { m: 'pen', accent: palette.sky },
  pen_carbon: { m: 'pen', accent: palette.textMuted },
  pen_gold: { m: 'pen', accent: palette.gold },
  pen_plasma: { m: 'pen', accent: palette.cyan },
  // pet toys
  toy_ball: { m: 'puck', accent: palette.coral },
  toy_drone: { m: 'target', accent: palette.cyan },
  toy_laser: { m: 'bolt', accent: palette.violet },
  toy_puzzle: { m: 'gamepad', accent: palette.mint },
  // rhythm songs (catalog items where applicable)
  song_neon: { m: 'notes', accent: palette.violet },
  song_pulse: { m: 'notes', accent: palette.coral },
  song_static: { m: 'notes', accent: palette.cyan },
  song_drift: { m: 'notes', accent: palette.sky },
  song_void: { m: 'notes', accent: palette.violetDim },
};

/** Per-kind fallback motif (game modules can register items with no art). */
const KIND_MOTIF: Record<string, { m: MotifKey; accent: string }> = {
  material: { m: 'gear', accent: '#A0A0BF' },
  consumable: { m: 'pill', accent: palette.energy },
  seed: { m: 'leaf', accent: palette.lime },
  crop: { m: 'sprout', accent: palette.lime },
  fish: { m: 'fish', accent: palette.cyan },
  trophy: { m: 'cup', accent: palette.gold },
  cosmetic: { m: 'sparkle', accent: palette.violet },
  vehicle: { m: 'car', accent: palette.sky },
  pet: { m: 'blob', accent: palette.violet },
  decoration: { m: 'lamp', accent: palette.amber },
  weapon: { m: 'gun', accent: palette.coral },
  currency: { m: 'star', accent: palette.coin },
};

const SLOT_MOTIF: Record<string, MotifKey> = {
  hat: 'hatCap',
  shirt: 'tShirt',
  shoes: 'sneaker',
  aura: 'motifRing',
  pet: 'blob',
  trail: 'ribbon',
  background: 'moon',
  car: 'car',
  face: 'target',
};

/** Legacy motif values used by the emoji table before the canonical keys. */
const MOTIF_ALIAS: Record<string, MotifKey> = {
  ring: 'motifRing',
  line: 'motifLine',
  hand: 'handIcon',
};

function buildMotif(key: MotifKey, accent: string): SpriteShape[] {
  const resolved = MOTIF_ALIAS[key] ?? key;
  if (resolved === 'car') return car(accent, 'hatch');
  const fn = MOTIFS[resolved];
  if (!fn) return fallbackSprite(`motif:${resolved}`, resolved, accent).shapes;
  return fn(accent);
}

function fallbackSprite(id: string, label: string, accent: string): Sprite {
  const h = hashSeed(id);
  const hue = h % 360;
  const a = accent ?? `hsl(${hue} 70% 62%)`;
  const b = `hsl(${(hue + 40) % 360} 65% 72%)`;
  return sp(id, label, a, [
    ring(32, 32, 22, 4, a),
    poly(
      [
        [32, 16], [43, 24], [43, 40], [32, 48], [21, 40], [21, 24],
      ],
      alpha(b, 0.9),
    ),
    c(32, 32, 7, alpha(a, 0.4)),
  ]);
}

/** Resolve any registered item to a sprite. Guaranteed non-null. */
export function spriteForItem(item: ItemLike): Sprite {
  const accent = item.tint ?? ITEM_MOTIF[item.id]?.accent ?? rarityColor[item.rarity] ?? palette.violet;
  const explicit = ITEM_MOTIF[item.id];
  if (explicit) return sp(item.id, item.name, explicit.accent ?? accent, buildMotif(explicit.m, explicit.accent ?? accent));

  const byKind = KIND_MOTIF[item.kind];
  if (byKind) return sp(item.id, item.name, byKind.accent, buildMotif(byKind.m, byKind.accent));

  const bySlot = item.slot ? SLOT_MOTIF[item.slot] : undefined;
  if (bySlot) return sp(item.id, item.name, accent, buildMotif(bySlot, accent));

  return fallbackSprite(item.id, item.name, accent);
}

/* ========================================================================== */
/* Games — one thumbnail per registered game                                  */
/* ========================================================================== */

export const GAME_THUMBS: Record<string, MotifKey> = {
  pet: 'paw',
  runner: 'bolt',
  driving: 'car',
  puzzle: 'gamepad',
  zombie: 'skull',
  farm: 'sprout',
  fishing: 'fish',
  platformer: 'mountain',
  rhythm: 'notes',
  arcade: 'joystick',
  penfight: 'pen',
  airhockey: 'puck',
  sumo: 'target',
  tankduel: 'tank',
  colorclash: 'splat',
  dodgeduel: 'crosshair',
  frontier: 'compass',
  stackrush: 'box',
  colorsnap: 'sun',
  hookrun: 'wave',
  survive60: 'heart',
  towerdef: 'shield',
  // Phase 8 quick-play set
  dodgerain: 'rain',
  onetap: 'wing',
  nummerge: 'merge',
  lasersurvive: 'laser',
  memrush: 'pulse',
  orbitguard: 'orbit',
};

/** Game thumbnail. `accent` is the module's own accent colour. */
export function spriteForGame(id: string, accent: string, label: string): Sprite {
  const motif = GAME_THUMBS[id] ?? 'joystick';
  return sp(`game:${id}`, label, accent, buildMotif(motif, accent));
}

/* ========================================================================== */
/* Avatar faces — vector replacements for the ASCII faces                     */
/* ========================================================================== */

const FACE_MOTIF: Record<string, MotifKey> = {
  face_calm: 'blob',
  face_grin: 'blob',
  face_cool: 'blob',
  face_wink: 'blob',
  face_focus: 'blob',
  face_sleepy: 'blob',
};

export function spriteForFace(faceId: string, skin = '#F4C99B'): Sprite {
  const base = sp(`face:${faceId}`, faceId, skin, [c(32, 32, 26, skin)]);
  const dark = '#3A2432';
  switch (faceId) {
    case 'face_grin':
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        c(24, 27, 3, dark),
        c(40, 27, 3, dark),
        poly([[24, 38], [32, 46], [40, 38]], dark),
      ]);
    case 'face_cool':
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        rr(18, 24, 12, 4, 2, dark),
        rr(34, 24, 12, 4, 2, dark),
        poly([[24, 40], [40, 40], [36, 44], [28, 44]], dark),
      ]);
    case 'face_wink':
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        c(25, 27, 3, dark),
        poly([[36, 25], [44, 29], [36, 33]], dark),
        poly([[26, 40], [32, 46], [38, 40]], dark),
      ]);
    case 'face_focus':
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        ring(24, 27, 5, 2.5, dark),
        ring(40, 27, 5, 2.5, dark),
        c(24, 27, 1.8, dark),
        c(40, 27, 1.8, dark),
        line(26, 42, 38, 42, 2.5, dark),
      ]);
    case 'face_sleepy':
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        line(19, 27, 29, 27, 2.5, dark),
        line(35, 27, 45, 27, 2.5, dark),
        line(25, 42, 39, 42, 2, dark),
      ]);
    default: // calm
      return sp(base.id, base.label, skin, [
        c(32, 32, 26, skin),
        c(24, 27, 3, dark),
        c(40, 27, 3, dark),
        poly([[26, 40], [32, 44], [38, 40]], dark),
      ]);
  }
}

/* ========================================================================== */
/* Entities — Last Signal pooled visuals (presentation only)                  */
/* ========================================================================== */

export type EntityKind = 'zombie' | 'scrap' | 'player' | 'bullet';

/** Zombie — variant rotates the palette so a horde reads as individuals. */
export function spriteForEntity(kind: EntityKind, variant = 0): Sprite {
  switch (kind) {
    case 'zombie': {
      const hues = [356, 190, 265];
      const hue = hues[variant % hues.length] ?? 356;
      const a = `hsl(${hue} 55% 46%)`;
      const b = `hsl(${(hue + 30) % 360} 50% 34%)`;
      return sp(`entity:zombie:${variant}`, 'zombie', a, [
        c(32, 26, 15, a),
        rr(24, 38, 16, 9, 3, b),
        c(26, 25, 3, palette.abyss),
        c(38, 25, 3, palette.abyss),
        poly([[25, 36], [28, 41], [30, 36], [32, 41], [34, 36], [37, 41], [39, 36]], palette.abyss),
        c(32, 30, 4, alpha('#7BFF6B', 0.5)),
      ]);
    }
    case 'scrap':
      return sp('entity:scrap', 'scrap', palette.gold, [
        c(32, 32, 11, alpha(palette.gold, 0.25)),
        ring(32, 32, 11, 1.5, palette.gold, 0.8),
        poly(
          [
            [32, 14], [40, 26], [36, 26], [42, 44], [26, 44], [32, 26], [26, 26],
          ],
          palette.gold,
        ),
        poly(
          [
            [32, 14], [40, 26], [36, 26], [42, 44], [34, 44], [36, 28], [32, 28],
          ],
          '#8A6A20',
          0.6,
        ),
      ]);
    case 'player':
      return sp('entity:player', 'player', palette.cyan, [
        c(32, 32, 20, alpha(palette.cyan, 0.14)),
        ring(32, 32, 20, 2, palette.cyan, 0.6),
        c(32, 30, 14, '#E8F4FF'),
        c(32, 30, 13, '#CFE8FF'),
        ring(32, 30, 9, 3, palette.abyss),
        c(32, 30, 3, palette.cyan),
        rr(24, 44, 16, 6, 3, palette.cyan, 0.9),
      ]);
    case 'bullet':
      return sp('entity:bullet', 'bullet', palette.gold, [
        c(32, 32, 9, alpha(palette.gold, 0.4)),
        c(32, 32, 4.5, palette.gold),
      ]);
  }
}

/* ========================================================================== */
/* Icon map — quest/achievement/HUD emojis → motifs                           */
/* ========================================================================== */

/** Known emoji → motif. Unknown icons get a deterministic fallback. */
const EMOJI_MOTIF: Record<string, MotifKey> = {
  '🎮': 'gamepad', '🕹️': 'joystick', '🧭': 'compass', '🪙': 'star', '💰': 'bag',
  '🎒': 'bag', '📊': 'chart', '🗓️': 'calendar', '📅': 'calendar', '🌱': 'sprout',
  '📦': 'box', '🌐': 'globe', '🎯': 'target', '🗃️': 'box', '🔺': 'mountain',
  '🧟': 'skull', '🛡️': 'shield', '☠️': 'skull', '⚡': 'bolt', '⭐': 'star',
  '🌟': 'star', '🎣': 'fish', '🏆': 'cup', '🏁': 'flag', '🐣': 'blob', '🐉': 'dragonHead',
  '👾': 'gamepad', '💞': 'heart', '💨': 'ribbon', '🔥': 'flame', '📋': 'listIcon',
  '📖': 'book', '🔓': 'target', '🖊️': 'pen', '🧗': 'mountain', '🧩': 'gamepad',
  '🧹': 'tools', '🧺': 'bag', '🫘': 'leaf', '🌿': 'sprout', '🍖': 'heart',
  '🎵': 'notes', '🎼': 'notes', '🏃': 'bolt', '🛣️': 'car', '🏠': 'homeIcon',
  '🔧': 'tools', '💾': 'box', '🎁': 'box', '✅': 'target', '🔒': 'target',
  '📜': 'scroll', '🛋️': 'house', '🔩': 'gear', '🗡️': 'pen', '⏱️': 'chart',
  '❤️': 'heart', '➰': 'ribbon', '💥': 'splat', '🎨': 'splat', '🏒': 'puck',
  '🤼': 'target', '🎧': 'headset', '🧨': 'bolt', '🔋': 'battery', '🍬': 'pill',
  '🔌': 'battery', '📈': 'chart', '🍀': 'clover', '🚫': 'target', '🧢': 'hatCap',
  '🎩': 'hatBeanie', '👑': 'hatCrown', '⛑️': 'hatHelmet', '💫': 'halo', '👕': 'tShirt',
  '🧥': 'hoodie', '🥼': 'jacket', '🧵': 'ribbon', '✨': 'sparkle', '👟': 'sneaker',
  '🥾': 'boot', '🩴': 'sneaker', '⚪': 'ring', '🟣': 'ring', '🌃': 'moon',
  '🏙️': 'skyline', '🐠': 'fish', '🌾': 'sprout', '🌌': 'moon', '🪔': 'lamp',
  '🪴': 'plant', '🧶': 'rug', '🖼️': 'poster', '🐟': 'fish', '🔆': 'sun',
  '🖥️': 'consoleIcon', '🐱': 'catHead', '👻': 'ghost', '·': 'line', '🛠️': 'tools',
  '🐣': 'blob', '💎': 'star', '⚙️': 'gear', '🎭': 'splat', '📳': 'bolt',
  '🌀': 'ring', '🔆': 'sun', '🫲': 'hand', '👾': 'gamepad',
};

export function spriteForIcon(icon: string, label = icon, accent?: string): Sprite {
  const key = EMOJI_MOTIF[icon];
  if (key) {
    const a = accent ?? palette.violet;
    if (key === 'hand') {
      return sp(`icon:${icon}`, label, a, [
        c(32, 32, 20, a),
        rr(24, 26, 16, 18, 8, tint(a, 0.3)),
        rr(30, 14, 6, 10, 3, tint(a, 0.3)),
        rr(18, 20, 6, 12, 3, tint(a, 0.3)),
      ]);
    }
    return sp(`icon:${icon}`, label, a, buildMotif(key, a));
  }
  return fallbackSprite(`icon:${icon}`, label, accent ?? palette.violet);
}

/** Lock/check treatment used by tiles and cards. */
export function spriteForLock(label = 'locked'): Sprite {
  return sp('ui:lock', label, palette.textMuted, [
    rr(22, 24, 20, 26, 5, palette.textMuted),
    poly([[26, 24], [26, 16], [38, 16], [38, 24]], palette.textMuted),
    c(32, 34, 3, palette.abyss),
    rr(30, 34, 4, 8, 2, palette.abyss),
  ]);
}
