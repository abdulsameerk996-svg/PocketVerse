/*
 * Frontier regression suite — plays the exact sim the app ships (compiled from
 * src, not a copy) headlessly in Node. The sim is pure TS with no React or
 * three.js, which is why this works at all; if someone drags a renderer
 * dependency into sim.ts, the require below crashes here instead of on a
 * device.
 *
 * The suite exists because the frontier is the one game where the hard part is
 * *systems*, not geometry: world generation, spawn pressure, boss phases,
 * loot tables, reward math. Those are all testable — so they are all tested.
 */
const {
  createRun,
  step,
  FIXED_DT,
  applyUpgrade,
  spawnBoss,
  hitBoss,
  finishRun,
  ENEMY_POOL,
  PICKUP_POOL,
  PROJ_POOL,
  TELE_POOL,
} = require('./build/games/frontier/sim.js');
const { makeLandmarks, biomeAt, decorations } = require('./build/games/frontier/world.js');
const {
  BOSSES,
  BIOMES,
  ENEMIES,
  HALF_W,
  normalizeFrontierSave,
  defaultFrontierSave,
  rewardForRun,
} = require('./build/games/frontier/content.js');
let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : '  ' + detail}`);
}

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const idle = (over = {}) => ({
  mx: 0,
  mz: 0,
  sprint: false,
  melee: false,
  dash: false,
  ability: false,
  ...over,
});

function snap(w) {
  return JSON.stringify({
    t: Math.round(w.time * 100),
    over: w.over,
    px: w.player.x,
    pz: w.player.z,
    hp: w.player.hp,
    level: w.player.level,
    xp: w.player.xp,
    kills: w.stats.kills,
    elites: w.stats.elites,
    bosses: w.stats.bosses,
    landmarks: w.stats.landmarks,
    gems: w.stats.gems,
    rares: w.stats.rares,
    biome: w.biome,
    boss: w.boss ? { hp: Math.round(w.boss.hp), phase: w.boss.phase, dead: w.boss.dead } : null,
    event: w.event.kind,
    enemyCount: w.enemies.filter((e) => e.active).length,
    pickups: w.pickups.filter((p) => p.active).map((p) => p.kind).sort().join(','),
  });
}

function assertFiniteWorld(w, label) {
  let bad = 0;
  if (!fin(w.player.x) || !fin(w.player.z) || !fin(w.player.hp) || !fin(w.player.maxHp)) bad++;
  if (w.player.hp < 0 || w.player.hp > w.player.maxHp + 0.01) bad++;
  for (const e of w.enemies) {
    if (e.active && (!fin(e.x) || !fin(e.z) || !fin(e.hp) || !fin(e.vx) || !fin(e.vz))) bad++;
  }
  for (const p of w.pickups) if (p.active && (!fin(p.x) || !fin(p.z) || !fin(p.ttl))) bad++;
  for (const pr of w.projectiles) if (pr.active && (!fin(pr.x) || !fin(pr.z) || !fin(pr.vx) || !fin(pr.vz))) bad++;
  for (const t of w.teles) if (t.active && (!fin(t.x) || !fin(t.z) || !fin(t.r) || !fin(t.ttl))) bad++;
  if (w.boss && w.boss.active && (!fin(w.boss.x) || !fin(w.boss.z) || !fin(w.boss.hp))) bad++;
  check(`${label}: no NaN / bounds`, bad === 0, bad === 0 ? '' : `${bad} violations`);
}

console.log('World generation');
{
  const a = makeLandmarks(42);
  const b = makeLandmarks(42);
  check('landmarks deterministic per seed', JSON.stringify(a) === JSON.stringify(b));
  const bosses = a.filter((l) => l.kind === 'boss');
  check('exactly 3 boss landmarks', bosses.length === 3, `${bosses.length}`);
  check(
    'each boss sits in its own biome',
    bosses.every((l) => l.boss && biomeAt(l.x, l.z, 42) === BOSSES[l.boss].biome),
  );
  const seen = new Set(a.map((l) => l.biome));
  check('every biome represented by a landmark', BIOMES_ORDER().every((b) => seen.has(b)), [...seen].join(','));
  check('landmarks stay in world', a.every((l) => Math.abs(l.x) < HALF_W - 2 && Math.abs(l.z) < HALF_W - 2));
  check('biomeAt centre is meadow', biomeAt(0, 0, 42) === 'meadow');

  const d1 = decorations(42);
  const d2 = decorations(42);
  check('decorations deterministic', JSON.stringify(d1) === JSON.stringify(d2));
  check('decoration budget bounded', d1.length <= 210 && d1.length >= 20, `${d1.length}`);

  // coverage of the biome field across the whole square
  const field = new Set();
  for (let x = -HALF_W + 1; x <= HALF_W - 1; x += 3) {
    for (let z = -HALF_W + 1; z <= HALF_W - 1; z += 3) field.add(biomeAt(x, z, 42));
  }
  check('biome field covers all four biomes', BIOMES_ORDER().every((b) => field.has(b)), [...field].join(','));
}

console.log('\nRun construction');
{
  const save = defaultFrontierSave();
  const w = createRun(7, save, { speed: 0.1, armor: 2, luck: 0.5 });
  check('armour adds HP (100 + 2×20)', w.player.maxHp === 140, `${w.player.maxHp}`);
  check('speed modifier folds into move speed', w.mods.moveSpeed === 0.1);
  check('luck stored on world', w.luck === 0.5);
  check('pools sized', w.enemies.length === ENEMY_POOL && w.pickups.length === PICKUP_POOL
    && w.projectiles.length === PROJ_POOL && w.teles.length === TELE_POOL);
  check('starts in meadow', w.biome === 'meadow');
  check('player finite', fin(w.player.x) && fin(w.player.hp) && w.player.hp === 140);
}

console.log('\nPlayer movement');
{
  const w = createRun(3, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  for (let i = 0; i < 60; i++) step(w, idle({ mx: 1, mz: 0 }), FIXED_DT);
  check('moves along +X at full speed', w.player.x > 7 && w.player.x < 9.5, `x=${w.player.x.toFixed(2)}`);
  check('stays on the Z axis', Math.abs(w.player.z) < 1e-9, `z=${w.player.z}`);

  const d = createRun(4, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  for (let i = 0; i < 60; i++) step(d, idle({ mx: 0.7071, mz: 0.7071 }), FIXED_DT);
  const dist = Math.hypot(d.player.x, d.player.z);
  check('diagonal is normalised (same speed)', Math.abs(dist - 7.4) < 1.6, `dist=${dist.toFixed(2)}`);

  const c = createRun(5, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  for (let i = 0; i < 60; i++) step(c, idle({ mx: -1, mz: -1 }), FIXED_DT);
  // input is normalised by the sim, so a full diagonal moves at ~0.707×speed per axis
  check('negative quadrant reachable', c.player.x < -4.8 && c.player.z < -4.8, `x=${c.player.x.toFixed(1)} z=${c.player.z.toFixed(1)}`);
  check('player clamped inside world', Math.abs(c.player.x) < HALF_W && Math.abs(c.player.z) < HALF_W);
}

console.log('\nCombat, loot, level-up');
{
  const w = createRun(11, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  const e = w.enemies[0];
  e.active = true;
  e.kind = 'walker';
  e.x = w.player.x + 0.8;
  e.z = w.player.z;
  e.hp = ENEMIES.walker.hp;
  e.maxHp = ENEMIES.walker.hp;
  e.r = ENEMIES.walker.r;
  e.speed = 0;
  e.damage = ENEMIES.walker.damage;
  e.attackCd = 0;
  for (let i = 0; i < 150; i++) step(w, idle({ melee: true }), FIXED_DT);

  check('melee kills a walker', w.stats.kills >= 1, `kills=${w.stats.kills}`);
  check('kill drops a gem pickup', w.pickups.some((p) => p.active && p.kind === 'gem'));
  check('contact damage reached the player', w.player.hp < w.player.maxHp, `hp=${w.player.hp}`);
  assertFiniteWorld(w, 'combat');

  // force a level-up: nearly full xp + a gem at the player's feet
  const w2 = createRun(12, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  w2.player.xp = w2.player.xpNeed - 1;
  const gem = w2.pickups.find((p) => !p.active);
  gem.active = true;
  gem.kind = 'gem';
  gem.ttl = 10;
  gem.x = w2.player.x;
  gem.z = w2.player.z;
  step(w2, idle(), FIXED_DT);
  check('gem collection triggers level-up', w2.choosing && w2.player.level === 2, `level=${w2.player.level}`);
  check('three upgrade choices offered', w2.upgradeChoices.length === 3, `${w2.upgradeChoices.length}`);
  check('choices are distinct', new Set(w2.upgradeChoices).size === w2.upgradeChoices.length);
}

console.log('\nUpgrades');
{
  const w = createRun(13, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  w.choosing = true;
  check('unknown upgrade rejected', applyUpgrade(w, 'nope') === false && w.choosing === true);
  w.choosing = true;
  check('damage upgrade applies', applyUpgrade(w, 'damage') && Math.abs(w.mods.damage - 1.22) < 1e-9, `${w.mods.damage}`);
  w.choosing = true;
  const hpBefore = w.player.maxHp;
  applyUpgrade(w, 'maxHp');
  check('maxHp upgrade raises cap and heals', w.player.maxHp === hpBefore + 25 && w.player.hp === hpBefore + 25);
  w.choosing = true;
  applyUpgrade(w, 'multishot');
  check('multishot stacks shots', w.mods.multishot === 2);
  check('choosing cleared after apply', !w.choosing);
}

console.log('\nBosses');
{
  const w = createRun(21, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  spawnBoss(w, 'warden');
  const def = BOSSES.warden;
  check('boss spawns at full phase-1 HP', w.boss && w.boss.active && !w.boss.dead && w.boss.hp === def.hp, `${w.boss?.hp}`);
  check('boss phases start at 1', w.boss?.phase === 1);

  hitBoss(w, 400);
  check('boss takes damage', w.boss.hp === def.hp - 400, `${w.boss.hp}`);
  w.player.invuln = 99999;
  w.player.x = 0;
  w.player.z = 0;
  // push past the 66% threshold, then step so the phase transition resolves
  hitBoss(w, w.boss.hp - def.hp * 0.5 + 1);
  for (let i = 0; i < 90; i++) step(w, idle(), FIXED_DT);
  check('boss enters phase 2 at 66%', w.boss?.phase === 2, `phase=${w.boss?.phase}`);

  hitBoss(w, 999999);
  check('boss dies', w.boss?.dead === true);
  check('boss counts in stats', w.stats.bosses === 1 && w.stats.bossesDefeated.includes('warden'));
  check('first-kill permanent damage applied', Math.abs(w.permanent.damage - def.permanent.damage) < 1e-9);
  check('boss drops rare loot', w.pickups.filter((p) => p.active && p.kind === 'rare').length >= 2);
  assertFiniteWorld(w, 'boss fight');
  const r = finishRun(w);
  check('boss adds score', r.score >= 500, `${r.score}`);
  check('boss rewards coins and items', r.coins > 0 && r.items.mat_core === 1, JSON.stringify(r));
}

console.log('\nEvents + long run');
{
  const w = createRun(99, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  w.player.invuln = 999999;
  const events = new Set();
  for (let i = 0; i < 5400; i++) {
    if (i % 300 === 0 && w.event.kind !== 'none') events.add(w.event.kind);
    step(w, idle(), FIXED_DT);
  }
  check('90s idle run stays alive (invuln respected)', !w.over, `over=${w.over}`);
  check('at least one event fired in 90s', events.size > 0, [...events].join(','));
  check('survival time advanced', Math.abs(w.time - 90) < 0.5, `${w.time.toFixed(1)}s`);
  check('enemies kept spawning (population pressure)', w.stats.kills > 0 || w.enemies.filter((e) => e.active).length > 0);
  assertFiniteWorld(w, 'long run');
}

console.log('\nDeterminism (same seed → same world)');
{
  const run = (seed, steps) => {
    const w = createRun(seed, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
    for (let i = 0; i < steps; i++) step(w, idle(), FIXED_DT);
    return snap(w);
  };
  const a = run(77, 1200);
  const b = run(77, 1200);
  check('two identical runs are byte-identical', a === b);
  const c = run(78, 1200);
  check('a different seed diverges', a !== c);
}

console.log('\nRewards');
{
  const stats = { kills: 30, elites: 2, bosses: 1, landmarks: 4, rares: 3, time: 210 };
  const a = finishRun({
    ...stubWorld(), seed: 1, time: 210, stats,
  });
  const b = rewardForRun(stats);
  check('sim finishRun agrees with content rewardForRun', JSON.stringify(a.score) === JSON.stringify(b.score)
    && JSON.stringify(a.coins) === JSON.stringify(b.coins)
    && JSON.stringify(a.gems) === JSON.stringify(b.gems), `${a.score}/${a.coins}`);
  check('score is positive and monotonic', a.score > 0 && a.coins > 0 && a.xp > 0);
  check('material drops follow thresholds', a.items.mat_scrap >= 1 && a.items.mat_core === 1, JSON.stringify(a.items));
  const zero = finishRun({
    ...stubWorld(), seed: 2, time: 0, stats: { kills: 0, elites: 0, bosses: 0, landmarks: 0, rares: 0, time: 0 },
  });
  check('empty run still rewards participation', zero.coins >= 80 && zero.score === 0);
}

console.log('\nSave normalisation');
{
  const base = defaultFrontierSave();
  check('null save → defaults', JSON.stringify(normalizeFrontierSave(null)) === JSON.stringify(base));
  check('garbage save → finite defaults', normalizeFrontierSave({ bestScore: NaN, totalKills: 'x', permanent: { damage: -2 } }).bestScore === 0
    && normalizeFrontierSave({ bestScore: NaN, totalKills: 'x', permanent: { damage: -2 } }).permanent.damage === 0);
  const s = normalizeFrontierSave({
    bestScore: 1200,
    bossesDefeated: ['warden', 'bogus', 'voidengine'],
    permanent: { damage: 0.08, maxHp: 20, moveSpeed: 0.03 },
  });
  check('valid fields kept', s.bestScore === 1200 && s.permanent.damage === 0.08);
  check('unknown boss ids filtered', s.bossesDefeated.length === 2 && s.bossesDefeated.includes('warden') && s.bossesDefeated.includes('voidengine'));
  check('negative values clamped', s.permanent.moveSpeed === 0.03 && s.bestTime === 0);
}

console.log('\nCorner hold — 20,000 movement steps');
// The repair-pass requirement: a character rammed into every corner for 20k
// steps must stay finite, stay in bounds, and be able to move away afterwards.
// The player is made immortal so the fuzz targets movement stability rather
// than combat survival — `invuln > 0` blocks all damage in `step`.
{
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  let violations = 0;
  corners.forEach(([dx, dz], ci) => {
    const w = createRun(7000 + ci, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
    w.player.invuln = 1e9;
    const input = idle({ mx: dx, mz: dz });
    // The run legitimately freezes on the level-up picker; a real player picks
    // an upgrade, so the fuzz does too (first choice, deterministically).
    const settle = () => {
      if (w.choosing && w.upgradeChoices.length) applyUpgrade(w, w.upgradeChoices[0]);
    };
    let bad = 0;
    for (let i = 0; i < 20000; i++) {
      step(w, input, FIXED_DT);
      settle();
      if (i % 1000 === 0 || i === 19999) {
        if (!Number.isFinite(w.player.x) || !Number.isFinite(w.player.z)) bad += 1;
        if (Math.abs(w.player.x) >= HALF_W || Math.abs(w.player.z) >= HALF_W) bad += 1;
      }
    }
    // Escape: release the corner, push away, confirm movement recovers.
    const escape = idle({ mx: -dx, mz: -dz });
    const sx = w.player.x;
    const sz = w.player.z;
    for (let i = 0; i < 120; i++) {
      step(w, escape, FIXED_DT);
      settle();
    }
    const moved = Math.hypot(w.player.x - sx, w.player.z - sz);
    check(
      `corner (${dx},${dz}): 20k steps finite + in bounds`,
      bad === 0,
      bad ? `${bad} violations` : `${Math.round(w.time)}s simulated`,
    );
    check(`corner (${dx},${dz}): player escapes`, moved > 0.5, `moved ${moved.toFixed(2)}`);
    violations += bad;
  });
}

console.log('\nRender readiness (frame-1 scene state)');
// What the R3F scene needs on its first frame to show anything at all: a
// finite player inside the world, a finite ground half-extent, a finite
// objective target, landmarks to draw, an enemy pool that spawns quickly, and
// pool sizes that match the scene's instanced meshes.
{
  const w = createRun(9001, defaultFrontierSave(), { speed: 0, armor: 0, luck: 0 });
  const p = w.player;
  check('player finite on spawn', fin(p.x) && fin(p.z));
  check('player inside world bounds', Math.abs(p.x) < HALF_W && Math.abs(p.z) < HALF_W, `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  check('ground half-extent finite and positive', fin(HALF_W) && HALF_W > 0, `HALF_W=${HALF_W}`);
  check('objective has finite target', fin(w.objective.x) && fin(w.objective.z), `${w.objective.x.toFixed(1)},${w.objective.z.toFixed(1)}`);
  check(
    'landmarks finite and in bounds',
    w.landmarks.length > 0 && w.landmarks.every((l) => fin(l.x) && fin(l.z) && Math.abs(l.x) < HALF_W && Math.abs(l.z) < HALF_W),
    `${w.landmarks.length} landmarks`,
  );
  let spawned = false;
  for (let i = 0; i < 600 && !spawned; i++) {
    step(w, idle({}), FIXED_DT);
    spawned = w.enemies.some((e) => e.active);
  }
  const active = w.enemies.filter((e) => e.active);
  check('enemies spawn within 10 s', active.length > 0, `${active.length} active`);
  check(
    'active enemies finite + in bounds',
    active.every((e) => fin(e.x) && fin(e.z) && Math.abs(e.x) < HALF_W && Math.abs(e.z) < HALF_W),
    `${active.length} active`,
  );
  check(
    'pools sized for instancing',
    w.enemies.length === ENEMY_POOL && w.pickups.length === PICKUP_POOL &&
      w.projectiles.length === PROJ_POOL && w.teles.length === TELE_POOL,
    `${ENEMY_POOL}/${PICKUP_POOL}/${PROJ_POOL}/${TELE_POOL}`,
  );
}

console.log(failures === 0 ? '\nALL FRONTIER CHECKS PASSED' : `\n${failures} FRONTIER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

/* ------------------------------------------------------------- helpers ---- */

function BIOMES_ORDER() {
  return ['meadow', 'forest', 'ruins', 'danger'];
}

function stubWorld() {
  return {
    player: { x: 0, z: 0 },
    stats: { kills: 0, elites: 0, bosses: 0, landmarks: 0, gems: 0, rares: 0, time: 0, bossesDefeated: [], upgradesTaken: [] },
  };
}
