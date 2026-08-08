/*
 * Sprite regression suite — resolves every id the app renders through the
 * exact sprites.ts the app ships (compiled from src, not a copy) and checks
 * that each produces a valid, deterministic, non-empty sprite.
 *
 * The `require` of the compiled module doubles as a coupling guard: if someone
 * ever drags React Native or a DOM dependency into the sprite engine, this
 * require crashes here instead of on a device.
 *
 * New items/games/icons are NOT required to appear here: the engine's fallback
 * chain guarantees art for unknown ids at runtime. These lists exist to lock
 * the authored mappings and to prove the fallback itself works.
 */
const { spriteForItem, spriteForGame, spriteForIcon, spriteForFace, spriteForEntity, spriteForLock, SPRITE_SIZE } = require('./build/ui/assets/sprites.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : '  ' + detail}`);
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const inBounds = (v) => v >= -10 && v <= SPRITE_SIZE + 10;

function validateSprite(sprite) {
  if (!sprite || !sprite.id || !sprite.label || !sprite.accent) return 'missing identity';
  if (!Array.isArray(sprite.shapes) || sprite.shapes.length === 0) return 'no shapes';
  for (const s of sprite.shapes) {
    switch (s.t) {
      case 'circle':
        if (!fin(s.cx) || !fin(s.cy) || !fin(s.r) || s.r <= 0) return `bad circle ${s.cx},${s.cy},${s.r}`;
        if (!inBounds(s.cx) || !inBounds(s.cy)) return 'circle out of bounds';
        break;
      case 'ring':
        if (!fin(s.cx) || !fin(s.cy) || !fin(s.r) || !fin(s.w) || s.w <= 0) return `bad ring ${s.cx},${s.cy},${s.r},${s.w}`;
        break;
      case 'rect':
        if (!fin(s.x) || !fin(s.y) || !fin(s.w) || !fin(s.h) || s.w <= 0 || s.h <= 0) return `bad rect ${s.x},${s.y},${s.w},${s.h}`;
        if (!inBounds(s.x) || !inBounds(s.y) || !inBounds(s.x + s.w) || !inBounds(s.y + s.h)) return 'rect out of bounds';
        break;
      case 'poly':
        if (!s.pts || s.pts.length < 3) return 'poly has <3 points';
        for (const [px, py] of s.pts) {
          if (!fin(px) || !fin(py) || !inBounds(px) || !inBounds(py)) return `bad poly point ${px},${py}`;
        }
        break;
      case 'line':
        if (!fin(s.x1) || !fin(s.y1) || !fin(s.x2) || !fin(s.y2) || !fin(s.w) || s.w <= 0) return 'bad line';
        break;
      default:
        return `unknown shape type ${s.t}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------- items -- */

// Core items (src/content/items.ts) + every module id (grep of content files).
const CORE_ITEMS = [
  'hat_none', 'hat_cap', 'hat_beanie', 'hat_crown', 'hat_helmet', 'hat_halo',
  'shirt_basic', 'shirt_hoodie', 'shirt_jacket', 'shirt_farmer', 'shirt_aurora',
  'shoes_basic', 'shoes_runner', 'shoes_boots', 'shoes_flame',
  'aura_none', 'aura_pulse', 'aura_static', 'aura_solar',
  'bg_night', 'bg_neon', 'bg_reef', 'bg_meadow', 'bg_void',
  'deco_lamp', 'deco_plant', 'deco_rug', 'deco_arcade', 'deco_poster',
  'deco_aquarium', 'deco_trophy', 'deco_neonsign', 'deco_console',
  'pet_blob', 'pet_cat', 'pet_dragon', 'pet_ghost',
  'trail_none', 'trail_spark', 'trail_neon',
  'mat_scrap', 'mat_circuit', 'mat_core', 'mat_starfrag',
  'con_energy_s', 'con_energy_l', 'con_xp_boost', 'con_luck',
];

const MODULE_ITEMS = [
  'car_hatch', 'car_hyper', 'car_sport', 'car_truck', 'car_van',
  'crop_carrot', 'crop_corn', 'crop_grapes', 'crop_pumpkin', 'crop_star', 'crop_wheat',
  'food_apple', 'food_cake', 'food_fish', 'food_kibble', 'food_star',
  'loc_pond', 'loc_reef', 'loc_river', 'loc_void',
  'm_clean', 'm_collector', 'm_first_km', 'm_ghost', 'm_long_haul', 'm_near_miss',
  'pen_carbon', 'pen_classic', 'pen_gold', 'pen_plasma',
  'pistol', 'railgun', 'shotgun', 'smg',
  'run_default', 'run_dragon', 'run_ghost', 'run_ninja', 'run_robot',
  'song_drift', 'song_neon', 'song_pulse', 'song_static', 'song_void',
  'toy_ball', 'toy_drone', 'toy_laser', 'toy_puzzle',
];

const kindFor = (id) =>
  id.startsWith('car_') ? 'vehicle'
    : id.startsWith('crop_') ? 'crop'
      : id.startsWith('food_') ? 'consumable'
        : id.startsWith('pen_') ? 'cosmetic'
          : id.startsWith('run_') ? 'cosmetic'
            : id.startsWith('song_') ? 'trophy'
              : id.startsWith('toy_') ? 'decoration'
                : id.startsWith('mat_') ? 'material'
                  : id.startsWith('con_') ? 'consumable'
                    : 'material';

const ALL_ITEMS = [...CORE_ITEMS, ...MODULE_ITEMS];

console.log(`Items (${ALL_ITEMS.length})`);
const itemResults = ALL_ITEMS.map((id) => {
  const item = { id, name: id, kind: kindFor(id), rarity: 'common', glyph: 'x' };
  const sprite = spriteForItem(item);
  const err = validateSprite(sprite);
  check(`${id}: resolves`, !err, err ?? `${sprite.shapes.length} shapes`);
  return sprite;
});

// Determinism: identical ids must produce byte-identical sprites.
const a = JSON.stringify(spriteForItem({ id: 'mat_scrap', name: 'Scrap', kind: 'material', rarity: 'common', glyph: 'x' }));
const b = JSON.stringify(spriteForItem({ id: 'mat_scrap', name: 'Scrap', kind: 'material', rarity: 'common', glyph: 'x' }));
check('item determinism', a === b);

// Fallback: an unknown id must still produce a valid sprite.
const unknown = spriteForItem({ id: 'brand_new_thing', name: 'New thing', kind: 'crop', rarity: 'mythic', glyph: 'x' });
check('unknown item falls back', validateSprite(unknown) === null, `${unknown.shapes.length} shapes`);

/* ------------------------------------------------------------- games -- */

console.log('\nGames (17)');
const GAMES = [
  'pet', 'runner', 'driving', 'puzzle', 'zombie', 'farm', 'fishing',
  'platformer', 'rhythm', 'arcade', 'penfight', 'airhockey', 'sumo',
  'tankduel', 'colorclash', 'dodgeduel', 'frontier',
  'stackrush', 'colorsnap', 'survive60', 'hookrun', 'towerdef',
];
for (const id of GAMES) {
  const sprite = spriteForGame(id, '#7C5CFF', id);
  check(`${id}: resolves`, validateSprite(sprite) === null, `${sprite.shapes.length} shapes`);
}

/* ------------------------------------------------------------- icons -- */

console.log('\nIcons (quest/achievement/HUD emojis)');
const ICONS = [
  '☠️', '⚡', '⭐', '🌐', '🌱', '🌿', '🍖', '🎒', '🎣', '🎮', '🎯', '🎵', '🎼',
  '🏁', '🏃', '🏆', '🐉', '🐣', '👾', '💞', '💨', '💰', '📅', '📊', '📋', '📖',
  '📦', '🔓', '🔥', '🔺', '🕹️', '🖊️', '🗃️', '🗓️', '🛋️', '🛡️', '🛣️', '🧗',
  '🧟', '🧩', '🧭', '🧹', '🧺', '🪙', '🫘', '✅', '🔒', '📜', '🔩', '🗡️', '⏱️',
  '❤️', '➰', '💥', '🎨', '🏒', '🤼', '🎧', '🧨', '🔋', '🍬', '🔌', '📈', '🍀',
  '🚫', '🧢', '🎩', '👑', '⛑️', '💫', '👕', '🧥', '🥼', '🧵', '✨', '👟', '🥾',
  '🩴', '⚪', '🟣', '🌃', '🏙️', '🐠', '🌾', '🌌', '🪔', '🪴', '🧶', '🖼️', '🐟',
  '🔆', '🖥️', '🐱', '👻', '·', '🛠️', '💎', '⚙️', '🎭', '📳', '🌀', '🫲', '🎁',
  '💾', '🏠',
];
for (const icon of ICONS) {
  const sprite = spriteForIcon(icon, 'icon', '#7C5CFF');
  check(`${icon}: resolves`, validateSprite(sprite) === null, `${sprite.shapes.length} shapes`);
}
const unknownIcon = spriteForIcon('🗿', 'mystery');
check('unknown icon falls back', validateSprite(unknownIcon) === null, `${unknownIcon.shapes.length} shapes`);

/* ------------------------------------------------------------- faces -- */

console.log('\nFaces');
for (const face of ['face_calm', 'face_grin', 'face_cool', 'face_wink', 'face_focus', 'face_sleepy']) {
  const sprite = spriteForFace(face);
  check(`${face}: resolves`, validateSprite(sprite) === null, `${sprite.shapes.length} shapes`);
}

/* ---------------------------------------------------------- entities -- */

console.log('\nEntities');
for (const kind of ['zombie', 'scrap', 'player', 'bullet']) {
  for (let v = 0; v < 4; v++) {
    const sprite = spriteForEntity(kind, v);
    check(`${kind}#${v}: resolves`, validateSprite(sprite) === null, `${sprite.shapes.length} shapes`);
  }
}

/* --------------------------------------------------------------- lock -- */

const lock = spriteForLock('test lock');
check('lock sprite resolves', validateSprite(lock) === null, `${lock.shapes.length} shapes`);

console.log(failures === 0 ? '\nALL SPRITE CHECKS PASSED' : `\n${failures} SPRITE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
