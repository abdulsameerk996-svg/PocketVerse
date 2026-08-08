/*
 * Registry validation suite.
 *
 * The module graph itself cannot load in plain Node — `react-native` is a
 * Metro-only module — so this suite splits the job:
 *
 *   1. the PURE parts are compiled for real and `require`d (the sprite engine
 *      and the registry contract), doubling as the usual coupling guard;
 *   2. the MODULE LIST + metadata are read from the same source files the app
 *      boots from (`src/games/index.ts` registration array and each module's
 *      `export const …Module` object). If the registration format ever drifts
 *      from this contract, the parse fails loudly here instead of on a device.
 *
 * It catches: a registered game without a vector logo (the shared 'joystick'
 * fallback), a game without metadata, duplicate ids, invalid categories,
 * orphan logos and a missing game route.
 */
const fs = require('fs');
const path = require('path');

const S = require('./build/ui/assets/sprites.js');
const R = require('./build/core/registry/types.js');

const ROOT = path.join(__dirname, '..', '..');
const GAME_MODULES_FILE = path.join(ROOT, 'src', 'games', 'index.ts');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}

/* ------------------------------------------------- 1. the registration file */

const src = fs.readFileSync(GAME_MODULES_FILE, 'utf8');

// `import { frontierModule } from './frontier'`  →  frontierModule: 'frontier'.
// Parsed by hand (no regex escapes — they are fragile through the write layer).
const imports = {};
for (const line of src.split('\n')) {
  const marker = "from './";
  const start = line.indexOf(marker);
  if (start < 0) continue;
  const dirStart = start + marker.length;
  const dirEnd = line.indexOf("'", dirStart);
  if (dirEnd < 0) continue;
  const open = line.indexOf('{');
  const close = line.indexOf('}');
  if (open < 0 || close < 0 || close < open) continue;
  const name = line.slice(open + 1, close).trim();
  const dir = line.slice(dirStart, dirEnd);
  if (name && dir) imports[name] = dir;
}

const arrayBlock = src.slice(src.indexOf('GAME_MODULES = ['));
const arrayText = arrayBlock.slice(0, arrayBlock.indexOf('];'));
const order = [];
// Full identifier is m[0] — the import map is keyed by `frontierModule`, not
// by the capture group `frontier`.
for (const m of arrayText.matchAll(/([A-Za-z0-9_]+)Module/g)) {
  const dir = imports[m[0]];
  if (!dir) {
    check(`module "${m[0]}" has an import mapping`, false);
    continue;
  }
  order.push(dir);
}
check('registration file parsed', order.length > 0, `${order.length} modules registered`);

/* -------------------------------------------------- 2. per-module metadata */

/**
 * First `key: 'value'` in a text window. Each module file defines its quests
 * and achievements first and the module object last, so the id/title/tagline
 * of the *module* are the first matches after `export const …Module` — and
 * quest ids (which contain underscores) never collide with module ids.
 */
function grab(text, key) {
  const at = text.indexOf(key + ':');
  if (at < 0) return undefined;
  const rest = text.slice(at + key.length + 1).replace(/^[ ]*/, '');
  if (rest[0] !== "'") return undefined;
  const end = rest.indexOf("'", 1);
  if (end < 0) return undefined;
  return rest.slice(1, end);
}

const metas = [];
for (const dir of order) {
  const file = path.join(ROOT, 'src', 'games', dir, 'index.ts');
  if (!fs.existsSync(file)) {
    check(`module file exists: ${dir}`, false);
    continue;
  }
  const mod = fs.readFileSync(file, 'utf8');
  const fromModule = mod.slice(mod.indexOf('export const'));
  metas.push({
    dir,
    id: grab(fromModule, 'id'),
    title: grab(fromModule, 'title'),
    tagline: grab(fromModule, 'tagline'),
    category: grab(fromModule, 'category') ?? 'arcade',
  });
}

const ids = metas.map((m) => m.id).filter(Boolean);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
check('no duplicate ids', dupes.length === 0, dupes.join(', ') || `${ids.length} unique ids`);

const validCategories = Object.keys(R.CATEGORY_LABEL || {});
for (const m of metas) {
  const name = m.id || m.dir || '?';
  check(
    `metadata complete: ${name}`,
    !!(m.id && m.title && m.tagline),
    `${m.title || 'missing title'} / ${m.tagline || 'missing tagline'}`,
  );
  check(`valid category: ${name}`, validCategories.includes(m.category), `category "${m.category}"`);
}

/* -------------------------------------------------------------- 3. logos */

// A logo is present iff the game has an EXPLICIT entry in GAME_THUMBS. A
// missing entry silently falls back to the shared joystick glyph, which is the
// stale-logo failure this check exists to catch. 'joystick' itself is fine
// when explicitly chosen (The Arcade's cabinet icon).
const thumbs = S.GAME_THUMBS || {};
for (const m of metas) {
  if (!m.id) continue;
  const motif = thumbs[m.id];
  check(
    `vector logo: ${m.id}`,
    !!motif,
    motif ?? 'MISSING — would fall back to the shared joystick glyph',
  );
}
const orphans = Object.keys(thumbs).filter((k) => !ids.includes(k));
check('no orphan logos', orphans.length === 0, orphans.join(', ') || `${Object.keys(thumbs).length} logos all used`);
const values = Object.values(thumbs);
const shared = values.filter((v, i) => values.indexOf(v) !== i);
check('no shared logo motif', shared.length === 0, shared.join(', ') || 'all distinct');

/* ---------------------------------------------------------------- 4. route */

check('game route exists', fs.existsSync(path.join(ROOT, 'app', 'game', '[id].tsx')));

/* ----------------------------------------------------------------- result */

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
