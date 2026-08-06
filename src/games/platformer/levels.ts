export type Rect = { x: number; y: number; w: number; h: number };
export type Pickup = { x: number; y: number; hidden?: boolean; gem?: boolean };

export type LevelDef = {
  id: string;
  name: string;
  /** Background gradient pair. */
  sky: [string, string];
  /** Length in world units; the exit sits here. */
  length: number;
  /** Ground/platform rectangles in world space (y measured from the floor up). */
  platforms: Rect[];
  pickups: Pickup[];
  hazards: Rect[];
  minLevel: number;
};

/**
 * Levels are plain data. Adding one is appending an object — no code, no
 * component, no registration. Hidden collectibles are simply pickups placed
 * above the natural path, marked `hidden` so the HUD can count them separately.
 */
export const LEVELS: LevelDef[] = [
  {
    id: 'lv1',
    name: 'First Light',
    sky: ['#2A1B4E', '#0C0A18'],
    length: 2600,
    minLevel: 1,
    platforms: [
      { x: 0, y: 0, w: 700, h: 40 },
      { x: 780, y: 0, w: 520, h: 40 },
      { x: 1380, y: 0, w: 640, h: 40 },
      { x: 2100, y: 0, w: 700, h: 40 },
      { x: 420, y: 130, w: 180, h: 20 },
      { x: 900, y: 160, w: 200, h: 20 },
      { x: 1500, y: 140, w: 220, h: 20 },
      { x: 1950, y: 220, w: 160, h: 20 },
    ],
    pickups: [
      { x: 300, y: 70 }, { x: 360, y: 70 }, { x: 420, y: 70 },
      { x: 500, y: 200 }, { x: 960, y: 230 }, { x: 1560, y: 210 },
      { x: 2000, y: 290, hidden: true, gem: true },
      { x: 1200, y: 80 }, { x: 1250, y: 80 }, { x: 2300, y: 80 },
    ],
    hazards: [{ x: 700, y: 0, w: 80, h: 24 }, { x: 1300, y: 0, w: 80, h: 24 }, { x: 2020, y: 0, w: 80, h: 24 }],
  },
  {
    id: 'lv2',
    name: 'Rooftops',
    sky: ['#12324E', '#070B14'],
    length: 3200,
    minLevel: 1,
    platforms: [
      { x: 0, y: 0, w: 480, h: 40 },
      { x: 560, y: 60, w: 300, h: 30 },
      { x: 940, y: 120, w: 280, h: 30 },
      { x: 1300, y: 60, w: 320, h: 30 },
      { x: 1700, y: 0, w: 420, h: 40 },
      { x: 2200, y: 100, w: 300, h: 30 },
      { x: 2580, y: 170, w: 260, h: 30 },
      { x: 2900, y: 0, w: 400, h: 40 },
      { x: 1050, y: 280, w: 140, h: 20 },
    ],
    pickups: [
      { x: 620, y: 120 }, { x: 700, y: 120 }, { x: 1000, y: 180 },
      { x: 1100, y: 340, hidden: true, gem: true },
      { x: 1400, y: 120 }, { x: 1800, y: 70 }, { x: 2280, y: 160 },
      { x: 2650, y: 230 }, { x: 2700, y: 230 }, { x: 3000, y: 70 },
    ],
    hazards: [{ x: 480, y: 0, w: 80, h: 24 }, { x: 2120, y: 0, w: 80, h: 24 }],
  },
  {
    id: 'lv3',
    name: 'The Vents',
    sky: ['#3D1F2E', '#120810'],
    length: 3600,
    minLevel: 3,
    platforms: [
      { x: 0, y: 0, w: 400, h: 40 },
      { x: 480, y: 90, w: 200, h: 24 },
      { x: 760, y: 180, w: 200, h: 24 },
      { x: 1040, y: 90, w: 200, h: 24 },
      { x: 1320, y: 0, w: 380, h: 40 },
      { x: 1780, y: 140, w: 240, h: 24 },
      { x: 2100, y: 240, w: 200, h: 24 },
      { x: 2380, y: 140, w: 240, h: 24 },
      { x: 2700, y: 0, w: 460, h: 40 },
      { x: 3240, y: 110, w: 320, h: 24 },
    ],
    pickups: [
      { x: 540, y: 150 }, { x: 820, y: 240 }, { x: 1100, y: 150 },
      { x: 1400, y: 70 }, { x: 1840, y: 200 }, { x: 2160, y: 300 },
      { x: 2200, y: 380, hidden: true, gem: true },
      { x: 2440, y: 200 }, { x: 2800, y: 70 }, { x: 3300, y: 170 },
    ],
    hazards: [
      { x: 400, y: 0, w: 80, h: 24 },
      { x: 1700, y: 0, w: 80, h: 24 },
      { x: 2620, y: 0, w: 80, h: 24 },
    ],
  },
  {
    id: 'lv4',
    name: 'Skyline',
    sky: ['#1F3D2E', '#08130E'],
    length: 4200,
    minLevel: 6,
    platforms: [
      { x: 0, y: 0, w: 360, h: 40 },
      { x: 440, y: 120, w: 180, h: 22 },
      { x: 700, y: 220, w: 180, h: 22 },
      { x: 960, y: 320, w: 180, h: 22 },
      { x: 1220, y: 220, w: 180, h: 22 },
      { x: 1480, y: 120, w: 180, h: 22 },
      { x: 1740, y: 0, w: 400, h: 40 },
      { x: 2220, y: 160, w: 220, h: 22 },
      { x: 2520, y: 280, w: 220, h: 22 },
      { x: 2820, y: 160, w: 220, h: 22 },
      { x: 3120, y: 0, w: 500, h: 40 },
      { x: 3700, y: 180, w: 400, h: 22 },
    ],
    pickups: [
      { x: 500, y: 180 }, { x: 760, y: 280 }, { x: 1020, y: 380 },
      { x: 1060, y: 460, hidden: true, gem: true },
      { x: 1280, y: 280 }, { x: 1540, y: 180 }, { x: 1840, y: 70 },
      { x: 2280, y: 220 }, { x: 2580, y: 340 }, { x: 2880, y: 220 },
      { x: 3200, y: 70 }, { x: 3800, y: 240 },
    ],
    hazards: [
      { x: 360, y: 0, w: 80, h: 24 },
      { x: 2140, y: 0, w: 80, h: 24 },
      { x: 3620, y: 0, w: 80, h: 24 },
    ],
  },
  {
    id: 'lv5',
    name: 'Terminal',
    sky: ['#2E1F4E', '#0A0714'],
    length: 4800,
    minLevel: 10,
    platforms: [
      { x: 0, y: 0, w: 320, h: 40 },
      { x: 400, y: 100, w: 160, h: 20 },
      { x: 640, y: 200, w: 160, h: 20 },
      { x: 880, y: 300, w: 160, h: 20 },
      { x: 1120, y: 400, w: 160, h: 20 },
      { x: 1360, y: 300, w: 160, h: 20 },
      { x: 1600, y: 180, w: 200, h: 20 },
      { x: 1880, y: 0, w: 360, h: 40 },
      { x: 2320, y: 140, w: 180, h: 20 },
      { x: 2580, y: 260, w: 180, h: 20 },
      { x: 2840, y: 380, w: 180, h: 20 },
      { x: 3100, y: 260, w: 180, h: 20 },
      { x: 3360, y: 140, w: 180, h: 20 },
      { x: 3620, y: 0, w: 460, h: 40 },
      { x: 4160, y: 160, w: 500, h: 20 },
    ],
    pickups: [
      { x: 460, y: 160 }, { x: 700, y: 260 }, { x: 940, y: 360 },
      { x: 1180, y: 460 }, { x: 1200, y: 540, hidden: true, gem: true },
      { x: 1420, y: 360 }, { x: 1660, y: 240 }, { x: 1960, y: 70 },
      { x: 2380, y: 200 }, { x: 2640, y: 320 }, { x: 2900, y: 440 },
      { x: 3160, y: 320 }, { x: 3420, y: 200 }, { x: 3700, y: 70 },
      { x: 4300, y: 220 }, { x: 4400, y: 300, hidden: true, gem: true },
    ],
    hazards: [
      { x: 320, y: 0, w: 80, h: 24 },
      { x: 2240, y: 0, w: 80, h: 24 },
      { x: 4080, y: 0, w: 80, h: 24 },
    ],
  },
];
