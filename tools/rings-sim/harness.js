/*
 * Neon Rings regression suite.
 *
 * Compiles the pure engine (src/rings/logic.ts) to CommonJS and plays it
 * headlessly in Node. The require is the coupling guard — a platform import in
 * the logic module crashes here instead of on a device.
 *
 * Covers: deterministic level generation, ring motion bounds, gap alignment
 * pass/hit math, scoring + combos, level-up flow, game-over flow, retry,
 * a 60-second fuzz for NaN/Infinity and save sanitising.
 */
const L = require('./build/rings/logic.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// The engine clamps dt to 0.5s (resume-spiral guard), so long horizons must be
// stepped in chunks. This mirrors how the app's ticker actually drives the sim.
function advance(s, secs) {
  let t = 0;
  while (t < secs - 1e-9 && s.status !== 'over') {
    const h = Math.min(0.25, secs - t);
    s = L.step(s, h);
    t += h;
  }
  return s;
}

console.log('Level generation');
{
  const lvl1 = L.buildLevel(1);
  const lvl1b = L.buildLevel(1);
  const lvl3 = L.buildLevel(3);
  check('level 1 has 3 rings', lvl1.length === 3, `count=${lvl1.length}`);
  check('level 4 has 6 rings', L.buildLevel(4).length === 6, `count=${L.buildLevel(4).length}`);
  check('ring count caps at 11', L.buildLevel(99).length === L.BALANCE.maxRingCount);
  check('deterministic: same level, same rings', JSON.stringify(lvl1) === JSON.stringify(lvl1b));
  check('gaps shrink with level', lvl3[0].gapHalf < lvl1[0].gapHalf);
  check('ring 0 starts gap-down (rotPhase 0)', lvl1[0].rotPhase === 0);
  for (const r of lvl1) {
    check(`ring finite + in pole bounds (${r.id})`, fin(r.baseY) && r.baseY > 0 && r.baseY < 1 && fin(r.gapHalf) && r.gapHalf > 0);
  }
}

console.log('Chaser rings');
{
  check('levels 1-2 have no chasers', L.buildLevel(1).every((r) => r.chase === 0) && L.buildLevel(2).every((r) => r.chase === 0));
  const l3 = L.buildLevel(3);
  const chasers = l3.filter((r) => r.chase > 0);
  check('level 3 has exactly one chaser', chasers.length === 1, `count=${chasers.length}`);
  check('level 3 chaser is the top ring', chasers[0].id === l3.length - 1);
  check('level 5 has two chasers', L.buildLevel(5).filter((r) => r.chase > 0).length === 2);
  check('level 7 has three chasers (capped)', L.buildLevel(7).filter((r) => r.chase > 0).length === 3 && L.buildLevel(99).filter((r) => r.chase > 0).length === 3);
  check('chaser cur starts at baseY', chasers[0].cur === chasers[0].baseY);
  check('chaser ringY returns finite in-bounds cur', (() => {
    const y = L.ringY(chasers[0], 1.234);
    return fin(y) && y > 0 && y < 1;
  })());
  check('chaser determinism (same level, same hunters)', JSON.stringify(L.buildLevel(3)) === JSON.stringify(L.buildLevel(3)));
}

console.log('Chaser behaviour');
{
  // A chaser converges on the flying ball.
  let s = L.createRun(3);
  const chaserId = s.rings.find((r) => r.chase > 0).id;
  s = { ...s, status: 'flying', launched: true, ballY: 0.5, nextRing: chaserId };
  const baseY = s.rings[chaserId].baseY;
  const moved = L.step(s, 0.2);
  const cur = moved.rings[chaserId].cur;
  check('chaser tracks the flying ball', Math.abs(cur - 0.5) < Math.abs(baseY - 0.5), `cur=${cur.toFixed(3)} base=${baseY.toFixed(3)}`);

  // A passed chaser settles back to rest height while the ball flies on.
  let s2 = L.createRun(3);
  s2 = { ...s2, status: 'flying', launched: true, ballY: 0.1, nextRing: s2.rings.length };
  s2 = { ...s2, rings: s2.rings.map((r) => (r.chase > 0 ? { ...r, cur: 0.2 } : r)) };
  const settled = L.step(s2, 0.5);
  const back = settled.rings.find((r) => r.chase > 0);
  check('passed chaser settles toward baseY', Math.abs(back.cur - back.baseY) < Math.abs(0.2 - back.baseY), `cur=${back.cur.toFixed(3)} base=${back.baseY.toFixed(3)}`);

  // Idle: chaser drifts home.
  let s3 = L.createRun(3);
  s3 = { ...s3, rings: s3.rings.map((r) => (r.chase > 0 ? { ...r, cur: 0.1 } : r)) };
  const idled = L.step(s3, 0.5);
  const home = idled.rings.find((r) => r.chase > 0);
  check('idle chaser returns toward baseY', Math.abs(home.cur - home.baseY) < Math.abs(0.1 - home.baseY), `cur=${home.cur.toFixed(3)}`);
}

console.log('Combo meter');
{
  let s = L.createRun(1);
  check('meter 0 with no combo', L.comboMeter(s) === 0);
  s = { ...s, status: 'flying', launched: true, ballY: 0, lastPassAt: 0, combo: 1, rings: [] };
  const fresh = L.comboMeter(s);
  check('meter near full right after a pass', fresh > 0.999, `meter=${fresh}`);
  const drained = advance(s, 0.45);
  const half = L.comboMeter(drained);
  check('meter drains with time', half > 0.3 && half < 0.7, `meter=${half.toFixed(3)}`);
  const expired = advance(s, 1.1);
  check('meter hits 0 after the window', L.comboMeter(expired) === 0);
  check('meter never negative or >1', (() => {
    let ok = true;
    for (let t = 0; t < 2; t += 0.05) {
      const m = L.comboMeter({ ...s, time: t });
      if (!(m >= 0 && m <= 1)) ok = false;
    }
    return ok;
  })());
}

console.log('Ring motion');
{
  const ring = L.buildLevel(1)[0];
  let minY = 1, maxY = 0;
  let ok = true;
  for (let t = 0; t < 20; t += 0.05) {
    const y = L.ringY(ring, t);
    const rot = L.ringRot(ring, t);
    if (!fin(y) || !fin(rot)) ok = false;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  check('motion stays finite over 20s', ok);
  check('slide stays near base ± amplitude', maxY - minY <= ring.slideAmp * 2 + 1e-9, `range=${(maxY - minY).toFixed(3)}`);
  check('rotation wraps into [-π, π]', L.ringRot(ring, 0.3) >= -Math.PI && L.ringRot(ring, 0.3) <= Math.PI);
  check('wrapAngle normalises', Math.abs(L.wrapAngle(2 * Math.PI + 0.3, 0) - 0.3) < 1e-9);
}

console.log('Idle + launch');
{
  let s = L.createRun(1, 0, 1);
  check('starts idle', s.status === 'idle');
  check('idle ball bounces in range', L.idleBallY(s) >= 0 && L.idleBallY(s) <= L.BALANCE.idleBounce + 1e-9);
  s = L.tap(s);
  check('tap launches', s.status === 'flying' && s.launched);
  check('tap while flying is a no-op', L.tap(s).status === 'flying');
}

console.log('Gap alignment pass/hit');
{
  // A ring with a wide gap and no motion: gap centered straight down.
  const manual = {
    id: 0,
    baseY: 0.5,
    slideAmp: 0,
    slideSpeed: 0,
    slidePhase: 0,
    rotSpeed: 0,
    rotPhase: 0, // gap open down
    gapHalf: (40 * Math.PI) / 180,
    radius: 0.2,
  };
  let s = L.createRun(1);
  s = { ...s, rings: [manual], status: 'flying', launched: true, ballY: 0 };
  // Ball will reach y=0.5 at t = 0.5 / launchSpeed.
  const tArrive = 0.5 / L.BALANCE.launchSpeed;
  const stepped = advance(s, tArrive + 0.1);
  check('aligned gap → pass (not over)', stepped.status !== 'over', `status=${stepped.status}`);
  check('aligned gap → score ≥ 1', stepped.score >= 1, `score=${stepped.score}`);
  check('aligned gap → nextRing advanced', stepped.nextRing === 1);

  // Rotate the gap 180° → solid side faces the ball.
  const blocked = { ...manual, rotPhase: Math.PI };
  let s2 = L.createRun(1);
  s2 = { ...s2, rings: [blocked], status: 'flying', launched: true, ballY: 0 };
  const s2end = advance(s2, tArrive + 0.1);
  check('closed gap → hit', s2end.status === 'over', `status=${s2end.status}`);
  check('hit keeps score 0', s2end.score === 0);

  // Half-open gap (edge of tolerance) should still pass when within gapHalf.
  const edge = { ...manual, rotPhase: (38 * Math.PI) / 180 };
  let s3 = L.createRun(1);
  s3 = { ...s3, rings: [edge], status: 'flying', launched: true, ballY: 0 };
  check('edge-of-gap pass', advance(s3, tArrive + 0.1).status !== 'over');
}

console.log('Scoring + combo');
{
  let s = L.createRun(1);
  s = { ...s, status: 'flying', launched: true };
  // Force two quick passes by stepping past the rings with wide-open gaps.
  const wide = L.buildLevel(1).map((r) => ({ ...r, rotSpeed: 0, rotPhase: 0, slideAmp: 0, slideSpeed: 0, gapHalf: (60 * Math.PI) / 180 }));
  s = { ...s, rings: wide, time: 0 };
  s = L.step(s, 0.3); // passes ring 1 (near center → perfect +2)
  const after1 = { ...s };
  check('first pass scores 2 (perfect)', after1.score === 2, `score=${after1.score}`);
  check('combo starts at 1', after1.combo === 1);
  s = L.step(s, 0.25); // ring 2 shortly after → combo 2
  check('quick second pass combos', s.combo === 2 && s.score === 4, `combo=${s.combo} score=${s.score}`);
}

console.log('Level flow');
{
  let s = L.createRun(1);
  s = { ...s, status: 'flying', launched: true, rings: [{ ...L.buildLevel(1)[0], baseY: 0.06, rotPhase: 0, rotSpeed: 0, slideAmp: 0, slideSpeed: 0, gapHalf: (50 * Math.PI) / 180 }] };
  const end = advance(s, 1.6);
  check('reaching the top levels up', end.level === 2 && end.status === 'idle', `level=${end.level}`);
  check('level-up banner flashes', end.levelUpFlash > 0);
  check('rings regenerate for level 2', end.rings.length === 4, `count=${end.rings.length}`);
  check('best level tracked', end.bestLevel === 2);
}

console.log('Game over + retry');
{
  let s = L.createRun(3, 12, 4);
  s = { ...s, status: 'flying', launched: true, rings: [{ ...L.buildLevel(3)[0], baseY: 0.4, rotPhase: Math.PI, rotSpeed: 0, slideAmp: 0, slideSpeed: 0, gapHalf: (40 * Math.PI) / 180 }] };
  const dead = L.step(s, 0.6);
  check('hit ends the run', dead.status === 'over');
  const retried = L.createRun(1, dead.best, dead.bestLevel);
  check('retry resets to level 1 with best kept', retried.level === 1 && retried.best === 12 && retried.bestLevel === 4);
}

console.log('60-second fuzz');
{
  let s = L.createRun(1, 0, 1);
  let brokeAt = -1;
  for (let i = 0; i < 60 * 120; i++) {
    if (s.status === 'idle') s = L.tap(s);
    s = L.step(s, 1 / 120);
    if (!fin(s.ballY) || !fin(s.time) || !fin(s.score) || Number.isNaN(s.level)) {
      brokeAt = i;
      break;
    }
    if (s.status === 'over') s = L.createRun(1, s.best, s.bestLevel);
  }
  check('fuzz stays finite (60s sim)', brokeAt === -1, brokeAt >= 0 ? `broke at ${brokeAt}` : 'ok');
  check('fuzz never lost best score', s.best >= 0 && fin(s.best));
}

console.log('Chaser fuzz (level 6, hunters guaranteed)');
{
  let s = L.createRun(6, 0, 1);
  let brokeAt = -1;
  let sawChaser = false;
  for (let i = 0; i < 15 * 120; i++) {
    if (s.status === 'idle') s = L.tap(s);
    s = L.step(s, 1 / 120);
    if (!fin(s.ballY) || !fin(s.time) || !fin(s.score) || Number.isNaN(s.level)) {
      brokeAt = i;
      break;
    }
    for (const r of s.rings) {
      if (r.chase > 0) {
        sawChaser = true;
        if (!fin(r.cur) || r.cur < 0 || r.cur > 1) {
          brokeAt = i;
          break;
        }
      }
    }
    if (brokeAt >= 0) break;
    const m = L.comboMeter(s);
    if (!(m >= 0 && m <= 1)) {
      brokeAt = i;
      break;
    }
    if (s.status === 'over') s = L.createRun(6, s.best, s.bestLevel);
  }
  check('chaser fuzz stays finite (15s sim)', brokeAt === -1, brokeAt >= 0 ? `broke at ${brokeAt}` : 'ok');
  check('chaser fuzz exercised hunters', sawChaser);
}

console.log('Save sanitising');
{
  const clean = L.validateState(null);
  check('null save → zeros', clean.best === 0 && clean.bestLevel === 1);
  const bad = L.validateState({ best: NaN, bestLevel: Infinity });
  check('NaN/Infinity sanitised', bad.best === 0 && bad.bestLevel === 1);
  const ok = L.validateState({ best: 42.9, bestLevel: 7 });
  check('numbers floored', ok.best === 42 && ok.bestLevel === 7);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
