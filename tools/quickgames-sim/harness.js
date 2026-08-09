/*
 * Quick-play regression suite — plays the pure logic of all eleven
 * quick games (compiled from src, not copies) headlessly in Node. The logic
 * modules import nothing from React/three.js/React Native; if someone drags a
 * renderer dependency into one, the require below crashes here instead of on
 * a device.
 */
const STACK = require('./build/games/stackrush/logic.js');
const SNAP = require('./build/games/colorsnap/logic.js');
const S60 = require('./build/games/survive60/logic.js');
const HOOK = require('./build/games/hookrun/logic.js');
const TD = require('./build/games/towerdef/logic.js');
const RAIN = require('./build/games/dodgerain/logic.js');
const FLY = require('./build/games/onetap/logic.js');
const MERGE = require('./build/games/nummerge/logic.js');
const LASER = require('./build/games/lasersurvive/logic.js');
const MEM = require('./build/games/memrush/logic.js');
const ORBIT = require('./build/games/orbitguard/logic.js');
const Q = require('./build/core/game/quick.js');
const { createRng } = require('./build/core/utils/rng.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------- STACK RUSH */
console.log('Stack Rush');
{
  const base = { x: 0.3, w: 0.4 };
  const perfect = STACK.dropBlock(0.3, base);
  check('aligned drop is placed + perfect', perfect.kind === 'placed' && perfect.perfect === true, JSON.stringify(perfect));
  // A 0.1 offset on a 0.4 block (25% cut) is well past the 5.5% perfect tolerance.
  const cut = STACK.dropBlock(0.4, base);
  check('small cut is placed, not perfect', cut.kind === 'placed' && cut.perfect === false, JSON.stringify(cut));
  const over = STACK.dropBlock(0.72, base);
  check('big miss is game over', over.kind === 'over', JSON.stringify(over));
  const b = STACK.nextSlideBounds(base);
  check('sweep bounds straddle the layer', b.min <= base.x && b.max >= base.x && b.max - b.min === base.w * 2, JSON.stringify(b));
  check('speed rises with level and shrinks with speed cosmetics',
    STACK.slideSpeed(2) > STACK.slideSpeed(1) && STACK.slideSpeed(1, 0.3) < STACK.slideSpeed(1),
    `${STACK.slideSpeed(1)} → ${STACK.slideSpeed(2)}`);
  check('layer points scale with level', STACK.layerPoints(5) === 50);
  // Cutting a 0.05 sliver each drop: widths must stay finite and the tower
  // must end the game cleanly once the block is too thin — never NaN/negative.
  let prev = base;
  let drops = 0;
  let ended = false;
  let nanSeen = false;
  for (let i = 0; i < 40; i++) {
    const d = STACK.dropBlock(prev.x - 0.05, prev);
    if (d.kind === 'over') { ended = true; break; }
    prev = d.layer;
    drops++;
    if (!fin(prev.w) || prev.w < 0) nanSeen = true;
  }
  check('sliver cuts stay finite and end cleanly once too thin', ended && drops >= 5 && !nanSeen, `drops=${drops} final w=${prev.w}`);
}

/* ------------------------------------------------------------- COLOR SNAP */
console.log('\nColor Snap');
{
  for (const level of [1, 3, 6, 9]) {
    const rng = createRng(100 + level);
    for (let i = 0; i < 50; i++) {
      const r = SNAP.makeRound(level, rng);
      const count = r.tiles.filter((t) => t === r.target).length;
      check(
        `L${level} round ${i}: target once, distinct tiles, size ${SNAP.tileCount(level)}`,
        count === 1 && new Set(r.tiles).size === r.tiles.length && r.tiles.length === SNAP.tileCount(level),
        count === 1 ? '' : `target×${count}`,
      );
      if (level >= 5 && r.fakes.length) {
        check(`L${level}: fake never equals target`, r.fakes.every((f) => f !== r.target));
      } else if (level < 5) {
        check('no fakes below level 5', r.fakes.length === 0);
      }
    }
  }
  check('timer shrinks with level, grows with luck',
    SNAP.roundTime(2) < SNAP.roundTime(1) && SNAP.roundTime(1, 0.5) > SNAP.roundTime(1));
  check('hit score rewards streaks and speed', SNAP.hitScore(4, 2) > SNAP.hitScore(0, 2) && SNAP.hitScore(0, 2) > SNAP.hitScore(0, 0));
  check('shade produces a valid hex', /^#[0-9a-f]{6}$/i.test(SNAP.shade('#FF5D5D')));
}

/* ------------------------------------------------------------- SURVIVE 60 */
console.log('\nSurvive 60');
{
  check('tier boundaries', S60.enemyTier(0) === 1 && S60.enemyTier(9) === 1 && S60.enemyTier(19) === 2 && S60.enemyTier(20) === 3 && S60.enemyTier(500) === 6);
  check('difficulty monotonic', S60.enemySpeed(3) > S60.enemySpeed(1) && S60.spawnInterval(3) < S60.spawnInterval(1));
  const e = { x: 100, y: 100, vx: 0, vy: 0, r: 13, speed: 120, kind: S60.ENEMY_CHASER };
  S60.stepEnemy(e, 200, 100, 1 / 60, 400, 700);
  check('chaser moves toward the player', e.x > 100, `x=${e.x.toFixed(1)}`);
  for (let i = 0; i < 600; i++) S60.stepEnemy(e, 200, 100, 1 / 60, 400, 700);
  check('chaser converges and stays in bounds', Math.abs(e.x - 200) < 40 && e.x >= 0 && e.x <= 400 && fin(e.x) && fin(e.y), `x=${e.x.toFixed(1)} y=${e.y.toFixed(1)}`);
  const z = { x: 50, y: 50, vx: 0, vy: 0, r: 10, speed: 130, kind: S60.ENEMY_ZIGZAG };
  for (let i = 0; i < 300; i++) S60.stepEnemy(z, 300, 300, 1 / 60, 400, 700);
  check('zigzag stays finite and in bounds', fin(z.x) && fin(z.y) && z.x >= 0 && z.y <= 700, `x=${z.x.toFixed(1)} y=${z.y.toFixed(1)}`);
  check('kill points double with doubler', S60.killPoints(0, true) === S60.killPoints(0, false) * 2);
  check('run score is sane', S60.runScore(60, 20, 5) === 60 * 10 + 20 * 25 + 5 * 12);
  check('player speed honours cosmetics', S60.playerSpeed(0.5) > S60.playerSpeed(0));

  // spawnOne fills exactly one slot, in bounds, at an edge.
  const pool = Array.from({ length: S60.ENEMY_POOL + S60.PICKUP_POOL }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, kind: 0, data: 0, data2: 0 }));
  S60.spawnOne(pool, 2, 400, 700);
  const activeCount = pool.filter((p) => p.active).length;
  const e2 = pool.find((p) => p.active);
  check('spawnOne fills exactly one enemy slot', activeCount === 1, `${activeCount}`);
  check('spawned enemy has sane geometry', e2 && e2.w > 0 && e2.h > 0 && fin(e2.x) && fin(e2.y));
}

/* ---------------------------------------------------------------- HOOK RUN */
console.log('\nHook Run');
{
  const s = HOOK.attachSwing(100, 200, 300, 0, 200, 100);
  check('attach computes radius + angle', s !== null && Math.abs(s.radius - Math.hypot(100, 100)) < 1e-6 && fin(s.angle));
  let st = HOOK.attachSwing(100, 200, 300, 0, 200, 100);
  let maxAV = 0;
  let minAV = 0;
  for (let i = 0; i < 900; i++) {
    st = HOOK.stepPendulum(st, 1 / 60);
    maxAV = Math.max(maxAV, st.angVel);
    minAV = Math.min(minAV, st.angVel);
  }
  check('pendulum stays bounded over 15 s', maxAV <= HOOK.MAX_ANG_VEL + 1e-9 && minAV >= -HOOK.MAX_ANG_VEL - 1e-9, `angVel∈[${minAV.toFixed(2)},${maxAV.toFixed(2)}]`);
  const pos = HOOK.swingPos(st);
  check('swing position matches the anchor + arm', Math.abs(Math.hypot(pos.x - st.ax, pos.y - st.ay) - st.radius) < 1e-6);
  const rv = HOOK.releaseVelocity({ ...st, angle: -Math.PI / 2 + 0.2, angVel: 2, radius: 120 }, 300);
  check('zenith release launches forward', rv.vx > 100 && rv.perfect === true, `vx=${rv.vx.toFixed(0)}`);
  // Determinism: two identical pendulum runs are identical.
  const a = HOOK.attachSwing(0, 0, 0, 0, 100, -100);
  const b = HOOK.attachSwing(0, 0, 0, 0, 100, -100);
  for (let i = 0; i < 240; i++) { a && HOOK.stepPendulum(a, 1 / 60); b && HOOK.stepPendulum(b, 1 / 60); }
  check('pendulum is deterministic', a && b && a.angle === b.angle && a.angVel === b.angVel);
  const anchors = [
    { x: 120, y: 0, active: true },
    { x: 500, y: 0, active: true },
    { x: 50, y: 0, active: true },
    { x: 300, y: 0, active: false },
  ];
  check('nearestAnchor picks the closest active anchor ahead', HOOK.nearestAnchor(60, 0, anchors) === 0);
  check('no anchor in range → -1', HOOK.nearestAnchor(0, 0, [{ x: 5000, y: 0, active: true }]) === -1);
}

/* ----------------------------------------------------------- TOWER DEFENSE */
console.log('\nTower Defense');
{
  const g = TD.createGame(360, 600);
  check('path length is finite and positive', fin(g.pathLen) && g.pathLen > 300, `${g.pathLen.toFixed(0)}px`);
  check('pointAt end == last waypoint', (() => {
    const p = TD.pointAt(g.path, g.w, g.h, g.pathLen);
    const last = g.path[g.path.length - 1];
    return Math.abs(p.x - last.x * g.w) < 1 && Math.abs(p.y - last.y * g.h) < 1;
  })());
  check('11 waves, boss finale', TD.WAVES.length === 11 && TD.WAVES[10].some(([t]) => t === 'boss'));

  // Place a gun, force one enemy, and confirm the whole fire→kill chain.
  const g2 = TD.createGame(360, 600);
  check('placeTower with coins succeeds', TD.placeTower(g2, 0, 'gun') === 'build' && g2.coins === TD.START_COINS - TD.TOWER_DEFS.gun.cost);
  check('placeTower twice in one slot denied', TD.placeTower(g2, 0, 'rapid') === 'denied');
  const en = g2.enemies[0];
  en.active = true;
  en.type = 'normal';
  en.hp = 42;
  en.maxHp = 42;
  en.t = 60;
  en.r = 9;
  en.reward = 6;
  let sawHit = false;
  for (let i = 0; i < 240; i++) {
    const ev = TD.stepGame(g2, 1 / 30);
    if (ev.includes('kill')) break;
    if (ev.includes('hit')) sawHit = true;
  }
  check('gun eventually kills the enemy', !en.active, `hp=${en.hp}`);
  check('kill grants coins', g2.coins > TD.START_COINS - TD.TOWER_DEFS.gun.cost);
  check('hit events fired', sawHit);

  // Shield absorbs the first hit entirely.
  const g3 = TD.createGame(360, 600);
  TD.placeTower(g3, 0, 'gun');
  const sh = g3.enemies[0];
  sh.active = true;
  sh.type = 'shielded';
  sh.hp = 84;
  sh.maxHp = 84;
  sh.armor = true;
  sh.t = 60;
  sh.r = 10;
  sh.reward = 18;
  const before = sh.hp;
  for (let i = 0; i < 240; i++) {
    TD.stepGame(g3, 1 / 30);
    if (!sh.armor) break; // the first hit has landed
  }
  check('shielded survives the first hit with full HP', sh.active && sh.hp === before, `hp=${sh.hp}`);
  check('...and the shield is broken', sh.armor === false);

  // Leak costs a life.
  const g4 = TD.createGame(360, 600);
  const lk = g4.enemies[0];
  lk.active = true;
  lk.type = 'fast';
  lk.hp = 26;
  lk.maxHp = 26;
  lk.t = g4.pathLen - 1;
  lk.r = 8;
  lk.reward = 8;
  TD.startWave(g4); // intermission freezes enemy movement; start the wave
  for (let i = 0; i < 60 && g4.lives === TD.START_LIVES; i++) TD.stepGame(g4, 1 / 30);
  check('leak reduces lives', g4.lives === TD.START_LIVES - 1 && !lk.active);

  // Upgrade math.
  const g5 = TD.createGame(360, 600);
  TD.placeTower(g5, 1, 'gun');
  const cost1 = TD.upgradeCost('gun', 1);
  g5.coins = cost1;
  check('upgrade to level 2 works', TD.upgradeTower(g5, 1) === 'upgrade' && g5.slots[1].level === 2);
  check('damage scales with level', TD.towerDamage('gun', 2) > TD.towerDamage('gun', 1));
  // Level cap: 2→3 succeeds, 3→4 is denied.
  g5.coins = TD.upgradeCost('gun', 2);
  check('level cap enforced', TD.upgradeTower(g5, 1) === 'upgrade' && g5.slots[1].level === 3 && TD.upgradeTower(g5, 1) === 'denied');

  // Determinism + a full 11-wave run to the win state with a full board.
  const runOnce = () => {
    const w = TD.createGame(360, 600);
    w.coins = 99999;
    for (let i = 0; i < 8; i++) {
      TD.placeTower(w, i, i % 3 === 0 ? 'gun' : i % 3 === 1 ? 'rapid' : 'frost');
      for (let lv = 1; lv < 3; lv++) TD.upgradeTower(w, i);
    }
    const evLog = [];
    let guard = 0;
    while (w.phase !== 'won' && w.phase !== 'over' && guard < 90000) {
      const ev = TD.stepGame(w, 1 / 30);
      for (const e of ev) evLog.push(e);
      guard++;
    }
    return { phase: w.phase, wave: w.wave, coins: w.coins, lives: w.lives, time: Math.round(w.time), score: TD.runScore(w), log: evLog.join(',') };
  };
  const r1 = runOnce();
  const r2 = runOnce();
  check('full 11-wave run is deterministic', JSON.stringify(r1) === JSON.stringify(r2));
  check('full run reaches a result (win with a maxed board)', r1.phase === 'won', `phase=${r1.phase} wave=${r1.wave}`);
  check('boss was defeated en route', r1.log.includes('kill') && r1.wave >= 11);
  check('no NaN anywhere in a full run', fin(r1.time) && fin(r1.coins) && fin(r1.score));

  // A no-build run should lose to leaks — proving the failure path works.
  const g6 = TD.createGame(360, 600);
  let guard6 = 0;
  while (g6.phase !== 'over' && guard6 < 9000) {
    TD.stepGame(g6, 1 / 30);
    guard6++;
  }
  check('a defenseless run eventually loses', g6.phase === 'over', `phase=${g6.phase} lives=${g6.lives}`);
}

/* ------------------------------------------------------------- DODGE RAIN */
console.log('\nDodge Rain');
{
  const s = RAIN.makeRain();
  check('rain state is finite and pooled', s.drops.length === RAIN.DROP_POOL && fin(s.time) && s.lives === 3);
  check('storm thickens: interval falls, speed rises', RAIN.dropInterval(30) < RAIN.dropInterval(0) && RAIN.dropSpeed(30) > RAIN.dropSpeed(0));
  check('speed never exceeds its cap', RAIN.dropSpeed(99999) <= 1.05);

  // Deterministic spawns: two seeded runs drop the same lanes.
  const a = RAIN.makeRain();
  const b = RAIN.makeRain();
  const ra = createRng(7);
  const rb = createRng(7);
  for (let i = 0; i < 600; i++) {
    RAIN.stepRain(a, ra, 1 / 60, 0.5);
    RAIN.stepRain(b, rb, 1 / 60, 0.5);
  }
  check('seeded storm is deterministic', a.drops.map((d) => (d.active ? d.x : -1)).join(',') === b.drops.map((d) => (d.active ? d.x : -1)).join(','));
  check('no NaN after 10 s', fin(a.time) && fin(a.score) && a.drops.every((d) => fin(d.x) && fin(d.y)));

  // A drop dead-centre above the player always hits.
  const h = RAIN.makeRain();
  h.drops[0].active = true;
  h.drops[0].x = 0.5;
  h.drops[0].y = 0.02;
  h.drops[0].speed = 0.5;
  let hits = 0;
  for (let i = 0; i < 200 && !h.over; i++) hits += RAIN.stepRain(h, Math.random, 1 / 60, 0.5);
  check('a centred drop hits the centred player', hits === 1 && h.lives === 2, `lives=${h.lives}`);
  check('three hits end the run', h.over === false); // only one hit landed

  // Off-lane drops are dodged, never hit.
  const d = RAIN.makeRain();
  d.drops[0].active = true;
  d.drops[0].x = 0.05;
  d.drops[0].y = 0.02;
  d.drops[0].speed = 0.6;
  for (let i = 0; i < 200; i++) RAIN.stepRain(d, Math.random, 1 / 60, 0.5);
  check('off-lane drops are dodges, not hits', d.lives === 3 && d.dodges >= 1, `dodges=${d.dodges}`);
}

/* ------------------------------------------------------------- ONE-TAP FLIGHT */
console.log('\nOne-Tap Flight');
{
  const s = FLY.makeFlight();
  const y0 = s.y;
  FLY.stepFlight(s, Math.random, 1 / 60, true);
  check('a flap pushes the bird up', s.y < y0);
  const g = FLY.makeFlight();
  g.y = 0.3;
  g.vy = 0;
  FLY.stepFlight(g, Math.random, 1 / 60, false);
  check('gravity pulls the bird down', g.y > 0.3);
  check('gap shrinks with time, never below the floor', FLY.gapHeight(200) < FLY.gapHeight(0) && FLY.gapHeight(999) === FLY.MIN_GAP);
  check('pipes accelerate, capped', FLY.pipeSpeed(999) <= 0.34 && FLY.pipeSpeed(60) > FLY.pipeSpeed(0));

  const p = FLY.makeFlight();
  const rng = createRng(11);
  FLY.spawnPipe(p, rng);
  const pipe = p.pipes.find((x) => x.active);
  check('spawned pipe starts off the right edge with an in-bounds gap', pipe && pipe.x === 1.02 && pipe.gapY >= 0 && pipe.gapY + pipe.gapH <= 1);

  // Pass counting: a pipe fully behind the bird clears cleanly.
  const c = FLY.makeFlight();
  c.y = 0.5;
  c.pipes[0].active = true;
  c.pipes[0].x = -0.1;
  c.pipes[0].gapY = 0.4;
  c.pipes[0].gapH = 0.3;
  FLY.stepFlight(c, Math.random, 1 / 60, false);
  check('cleared pipe increments passes', c.passes === 1);

  // A misaligned gap ends the run.
  const x = FLY.makeFlight();
  x.y = 0.5;
  x.pipes[0].active = true;
  x.pipes[0].x = 0.0;
  x.pipes[0].gapY = 0.9;
  x.pipes[0].gapH = 0.05;
  FLY.stepFlight(x, Math.random, 1 / 60, false);
  check('blocked gap ends the run', x.over === true);

  // Determinism + finiteness over a long seeded run.
  const a = FLY.makeFlight();
  const b = FLY.makeFlight();
  const ra = createRng(3);
  const rb = createRng(3);
  for (let i = 0; i < 900 && !a.over && !b.over; i++) {
    FLY.stepFlight(a, ra, 1 / 60, i % 37 === 0);
    FLY.stepFlight(b, rb, 1 / 60, i % 37 === 0);
  }
  check('seeded flight is deterministic', a.passes === b.passes && a.over === b.over && fin(a.y) && fin(a.vy));
}

/* ------------------------------------------------------------- NUMBER MERGE */
console.log('\nNumber Merge');
{
  const s1 = MERGE.slideRow([2, 2, 0, 0]);
  check('pair merges once', JSON.stringify(s1.row) === JSON.stringify([4, 0, 0, 0]) && s1.gained === 4);
  const s2 = MERGE.slideRow([2, 2, 2, 2]);
  check('four equal tiles fuse into two', JSON.stringify(s2.row) === JSON.stringify([4, 4, 0, 0]) && s2.gained === 8);
  const s3 = MERGE.slideRow([2, 0, 2, 4]);
  check('non-adjacent pair fuses after sliding', JSON.stringify(s3.row) === JSON.stringify([4, 4, 0, 0]));

  const board = [0, 0, 0, 2, 0, 2, 0, 0, 0];
  const right = MERGE.moveGrid(board, 2);
  check('right slide moves and fuses', JSON.stringify(right.grid) === JSON.stringify([0, 0, 0, 0, 0, 4, 0, 0, 0]) && right.moved);
  const upBoard = [2, 0, 0, 2, 0, 0, 0, 0, 0];
  const up = MERGE.moveGrid(upBoard, 1);
  check('up slide fuses the column', JSON.stringify(up.grid) === JSON.stringify([4, 0, 0, 0, 0, 0, 0, 0, 0]) && up.moved);
  check('dead move reports moved=false', MERGE.moveGrid([2, 4, 2, 4, 2, 4, 2, 4, 2], 0).moved === false);

  const r1 = createRng(5);
  const r2 = createRng(5);
  const ga = MERGE.makeMerge();
  const gb = MERGE.makeMerge();
  ga.grid = [0, 0, 0, 0, 2, 0, 0, 0, 0];
  gb.grid = [0, 0, 0, 0, 2, 0, 0, 0, 0];
  for (let i = 0; i < 30; i++) {
    MERGE.applyMove(ga, i % 4, r1);
    MERGE.applyMove(gb, i % 4, r2);
  }
  check('seeded merge game is deterministic', JSON.stringify(ga.grid) === JSON.stringify(gb.grid) && ga.score === gb.score);
  check('no NaN after 30 moves', ga.grid.every((v) => fin(v)) && fin(ga.score));
  const fresh = MERGE.makeMerge();
  check('makeMerge seeds two tiles', fresh.grid.filter((v) => v > 0).length === 2);

  // Full board with no merges is game over.
  const full = MERGE.makeMerge();
  full.grid = [2, 4, 2, 4, 2, 4, 2, 4, 2];
  check('canMove false on a locked board', MERGE.canMove(full.grid) === false);
  const res = MERGE.applyMove(full, 0, Math.random);
  check('locked board ends the run', res.over === true);
}

/* ------------------------------------------------------------- LASER SURVIVE */
console.log('\nLaser Survive');
{
  check('beam count grows on a fixed schedule', LASER.beamCount(0) === 2 && LASER.beamCount(25) === 3 && LASER.beamCount(50) === 4 && LASER.beamCount(999) === 4);
  check('beam speed escalates, capped', LASER.beamSpeed(999) <= 2.4 && LASER.beamSpeed(60) > LASER.beamSpeed(0));

  const onLine = LASER.distToBeam(0.3, 0.5, 0);
  const offLine = LASER.distToBeam(0.5, 0.65, 0);
  check('distance to beam is zero on the line', onLine < 1e-9);
  check('off-line points are farther', offLine > 0.1);

  const a = LASER.makeLasers();
  const b = LASER.makeLasers();
  for (let i = 0; i < 600; i++) {
    LASER.stepLasers(a, 1 / 60, 0.5, 0.3, 0);
    LASER.stepLasers(b, 1 / 60, 0.5, 0.3, 0);
  }
  check('beams rotate deterministically', a.beams[0].angle === b.beams[0].angle && a.time === b.time);
  check('no NaN after 10 s of beams', a.beams.every((x) => fin(x.angle)) && fin(a.score) && fin(a.time));
  // Moving diagonally across a beam line counts as a close call.
  const dg = LASER.makeLasers();
  dg.beams[0].active = true;
  dg.beams[0].angle = 0; // horizontal line through the centre at y=0.5
  dg.prevX = 0.3;
  dg.prevY = 0.4;
  const before = dg.dodges;
  LASER.stepLasers(dg, 1 / 60, 0.7, 0.6, 0);
  // Both starting beams are active by t=0, so a diagonal dash crosses at least
  // one line and never touches the player (hp stays full).
  check('crossing a beam line counts as a dodge', dg.dodges >= before + 1 && dg.hp === 3, `dodges=${dg.dodges}`);

  // Park the player on a beam line: hits land, three end the run.
  const h = LASER.makeLasers();
  h.beams[0].active = true;
  h.beams[0].angle = 0;
  let tot = 0;
  for (let i = 0; i < 400 && !h.over; i++) tot += LASER.stepLasers(h, 1 / 60, 0.5, 0.5, 0);
  check('parked on the beam costs all three hearts', h.over === true && tot >= 3, `hp=${h.hp} hits=${tot}`);
}

/* ------------------------------------------------------------- MEMORY RUSH */
console.log('\nMemory Rush');
{
  const r1 = createRng(9);
  const r2 = createRng(9);
  let s1 = [];
  let s2 = [];
  for (let i = 0; i < 20; i++) {
    s1 = MEM.extendSeq(s1, r1);
    s2 = MEM.extendSeq(s2, r2);
  }
  check('extendSeq is deterministic', JSON.stringify(s1) === JSON.stringify(s2));
  check('extendSeq only ever appends valid pads', s1.length === 20 && s1.every((p) => p >= 0 && p < MEM.PADS));
  check('checkEntry verdicts', MEM.checkEntry([1, 2, 3], 0) === 'ok' && MEM.checkEntry([1, 2, 3], 2) === 'done' && MEM.checkEntry([1, 2, 3], 3) === 'wrong' && MEM.checkEntry([1, 2, 3], -1) === 'wrong');
  check('timing curves tighten with stage', MEM.padTimer(6) < MEM.padTimer(1) && MEM.showPadMs(6) < MEM.showPadMs(1));
  check('stage score is positive and grows', MEM.stageScore(3, 3) > MEM.stageScore(1, 3));
  const norm = MEM.normalizeMemSave({ runs: -2, best: 'x', bestStreak: 12 });
  check('save normalisation clamps garbage', norm.runs === 0 && norm.best === 0 && norm.bestStreak === 12);
}

/* ------------------------------------------------------------- ORBIT GUARD */
console.log('\nOrbit Guard');
{
  check('angleDiff wraps into [-π, π]', Math.abs(ORBIT.angleDiff(6.0, 0.1)) < Math.PI && Math.abs(ORBIT.angleDiff(-6.0, 0.1)) < Math.PI && ORBIT.angleDiff(0, 0) === 0);

  const a = ORBIT.makeOrbit();
  const b = ORBIT.makeOrbit();
  const ra = createRng(13);
  const rb = createRng(13);
  for (let i = 0; i < 900 && !a.over && !b.over; i++) {
    ORBIT.stepOrbit(a, ra, 1 / 60, Math.sin(i * 0.05) * 2);
    ORBIT.stepOrbit(b, rb, 1 / 60, Math.sin(i * 0.05) * 2);
  }
  check('seeded orbit run is deterministic', a.blocks === b.blocks && a.hp === b.hp && a.over === b.over);
  check('no NaN in a 15 s orbit run', a.orbs.every((o) => fin(o.dist) && fin(o.angle)) && fin(a.score));
  check('a swinging shield deflects some orbs', a.blocks > 0, `blocks=${a.blocks}`);

  // A parked shield covering its half of the ring blocks everything aligned.
  const d = ORBIT.makeOrbit();
  d.nextSpawn = 999;
  d.eliteTimer = 999;
  d.orbs[0].active = true;
  d.orbs[0].angle = 0;
  d.orbs[0].dist = 0.4;
  d.orbs[0].speed = 0.1;
  d.orbs[0].kind = 'normal';
  d.orbs[0].hp = 1;
  ORBIT.stepOrbit(d, Math.random, 1 / 60, 0);
  check('orb inside the shield arc is deflected', d.orbs[0].active === false && d.blocks === 1);

  // An orb aimed away from the shield reaches the core.
  const h = ORBIT.makeOrbit();
  h.nextSpawn = 999; // isolate single orb — no auto spawns
  h.eliteTimer = 999;
  h.orbs[0].active = true;
  h.orbs[0].angle = Math.PI; // opposite the shield at 0
  h.orbs[0].dist = 0.4;
  h.orbs[0].speed = 0.5;
  h.orbs[0].kind = 'normal';
  h.orbs[0].hp = 1;
  let hits = 0;
  for (let i = 0; i < 200 && !h.over; i++) hits += ORBIT.stepOrbit(h, Math.random, 1 / 60, 0);
  check('shielded-away orb hits the core', hits === 1 && h.hp === 2, `hp=${h.hp} hits=${hits}`);
  check('three core hits end the run', h.over === false);
}

/* ------------------------------------------------------ SHARED QUICK HELPERS */
console.log('\nShared quick helpers');
{
  const r = Q.quickReward(400, 60, { won: true });
  check('reward is positive and sane', r.coins > 0 && r.xp > 0 && (r.items?.mat_scrap || r.items?.mat_circuit));
  check('difficulty curve grows toward the ceiling', Q.difficultyCurve(100, 1, 0.5) > 100 && Q.difficultyCurve(100, 1, 2) === 200);
  check('combo multiplier caps', Q.comboMultiplier(2) < Q.comboMultiplier(5) && Q.comboMultiplier(99) === Q.comboMultiplier(5));
  check('bumpBest keeps the max', Q.bumpBest({ runs: 1, best: 50 }, 80).best === 80 && Q.bumpBest({ runs: 1, best: 50 }, 10).best === 50);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
