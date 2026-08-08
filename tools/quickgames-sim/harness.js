/*
 * Quick-play regression suite — plays the pure logic of all five Phase 7
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
