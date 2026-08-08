/*
 * Pen Fight regression suite â€” runs the real solver and the real opponent,
 * exactly as shipped. Physics and AI are pure modules, so this is execution,
 * not inference.
 */
const P = require('./build/games/penfight/physics.js');
const AI = require('./build/games/penfight/ai.js');
const C = require('./build/games/penfight/content.js');
const { createRng } = require('./build/core/utils/rng.js');

const TABLE = C.TABLE;
const M = C.START_MARKS;
const HUGE = { halfW: 1e6, halfD: 1e6 };
let failures = 0;

function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}
const finite = (p) =>
  [p.x, p.z, p.vx, p.vz, p.angle, p.omega, p.y].every(Number.isFinite);

function rack() {
  const player = P.makePen('player', M.player.x, M.player.z, M.player.angle);
  const rival = P.makePen('rival', M.rival.x, M.rival.z, M.rival.angle);
  return { player, rival, list: [player, rival], acc: { value: 0 } };
}
function solo() {
  const p = P.makePen('player', 0, 0, 0);
  return { player: p, list: [p], acc: { value: 0 } };
}
function runToRest(w, table, dt = 1 / 60, limit = 30) {
  const knocked = [];
  let peak = 0;
  for (let i = 0; i < limit / dt; i++) {
    const r = P.step(w.list, table, dt, w.acc);
    peak = Math.max(peak, r.impact);
    for (const s of r.knockedOff) if (!knocked.includes(s)) knocked.push(s);
    if (r.settled) return { knocked, peak, timedOut: false, seconds: i * dt };
  }
  return { knocked, peak, timedOut: true, seconds: limit };
}

console.log('\n1. A flicked pen always comes to rest');
for (const power of [0.1, 0.35, 0.7, 1]) {
  const w = solo();
  P.applyLaunch(w.player, { dirX: 1, dirZ: 0, power, spin: 0.5 });
  const r = runToRest(w, HUGE);
  check(
    `power ${power.toFixed(2)}`,
    !r.timedOut && w.player.resting && finite(w.player),
    `slid ${w.player.x.toFixed(2)}u, stopped after ${r.seconds.toFixed(2)}s`,
  );
}

console.log('\n2. The closed-form travel model matches the solver');
{
  let worst = 0;
  for (const power of [0, 0.25, 0.5, 0.75, 1]) {
    const w = solo();
    P.applyLaunch(w.player, { dirX: 1, dirZ: 0, power, spin: 0 });
    runToRest(w, HUGE);
    const speed = P.MIN_LAUNCH_SPEED + power * (P.MAX_LAUNCH_SPEED - P.MIN_LAUNCH_SPEED);
    worst = Math.max(worst, Math.abs(P.travelForSpeed(speed) - w.player.x));
  }
  check('travelForSpeed predicts the solver', worst < 0.12, `worst error ${worst.toFixed(3)}u`);
  // The AI inverts this; if the round trip drifts, every shot is mis-powered.
  let inv = 0;
  for (const d of [1, 3, 6, 9]) inv = Math.max(inv, Math.abs(P.travelForSpeed(P.speedForTravel(d)) - d));
  check('speedForTravel round-trips', inv < 1e-6, `worst error ${inv.toExponential(2)}`);
}

console.log('\n3. Fixed step makes play frame-rate independent');
{
  const go = (dts) => {
    const w = rack();
    P.applyLaunch(w.player, { dirX: 0.35, dirZ: -0.94, power: 0.85, spin: 0.4 });
    for (let i = 0, n = 0; n < 6000; n++) {
      if (P.step(w.list, TABLE, dts[i++ % dts.length], w.acc).settled) break;
    }
    return w;
  };
  const a = go([1 / 60]);
  const b = go([1 / 120]);
  const c = go([1 / 60, 1 / 30, 1 / 90, 1 / 45, 1 / 24]);
  const d = (x, y) =>
    Math.hypot(x.player.x - y.player.x, x.player.z - y.player.z) +
    Math.hypot(x.rival.x - y.rival.x, x.rival.z - y.rival.z);
  check('60 Hz â‰¡ 120 Hz', d(a, b) < 0.02, `Î” ${d(a, b).toExponential(2)}u`);
  check('60 Hz â‰¡ jittery frames', d(a, c) < 0.02, `Î” ${d(a, c).toExponential(2)}u`);
}

console.log('\n4. Contact transfers momentum and generates spin');
{
  const w = rack();
  P.applyLaunch(w.player, { dirX: 0, dirZ: -1, power: 0.8, spin: 0 });
  const r = runToRest(w, TABLE);
  check('contact registered', r.peak > 0, `peak impulse ${r.peak.toFixed(2)}`);
  check('rival moved', Math.abs(w.rival.z - M.rival.z) > 0.2,
    `z ${M.rival.z} â†’ ${w.rival.z.toFixed(2)}`);
  check('both finite', finite(w.player) && finite(w.rival));
  check('settles', !r.timedOut);
}
{
  const w = rack();
  w.player.x = 0.28; // glance off the side of the nib
  const dx = w.rival.x - w.player.x;
  const dz = w.rival.z - w.player.z;
  const L = Math.hypot(dx, dz);
  P.applyLaunch(w.player, { dirX: dx / L, dirZ: dz / L, power: 0.9, spin: 0 });
  runToRest(w, TABLE);
  const spun = Math.abs(w.rival.angle - M.rival.angle);
  check('glancing hit spins the rival', spun > 0.05, `${spun.toFixed(3)} rad`);
}

console.log('\n5. The opening flick is a real decision, not a formality');
{
  const conv = (diff) => {
    let ko = 0;
    let self = 0;
    const N = 250;
    for (let i = 0; i < N; i++) {
      const rng = createRng(4242 + i * 13);
      const w = rack();
      P.applyLaunch(w.player, AI.chooseLaunch(w.player, w.rival, TABLE, diff, rng));
      const r = runToRest(w, TABLE);
      if (r.knocked.includes('player')) self++;
      else if (r.knocked.includes('rival')) ko++;
    }
    return { ko: ko / N, self: self / N };
  };
  const e = conv('easy');
  const n = conv('normal');
  const h = conv('hard');
  check('casual rarely converts the opener', e.ko < 0.3, `${(e.ko * 100).toFixed(0)}%`);
  check('steady converts sometimes', n.ko > 0.15 && n.ko < 0.6, `${(n.ko * 100).toFixed(0)}%`);
  check('ruthless usually converts', h.ko > 0.6, `${(h.ko * 100).toFixed(0)}%`);
  check('accuracy is monotonic', e.ko < n.ko && n.ko < h.ko,
    `${(e.ko * 100).toFixed(0)} < ${(n.ko * 100).toFixed(0)} < ${(h.ko * 100).toFixed(0)}%`);
  check('a big shot can cost you your own pen', n.self > 0.02,
    `steady self-KOs ${(n.self * 100).toFixed(0)}% of openers`);
}

console.log('\n6. Matches terminate, and skill decides them');
function playMatch(dA, dB, seed) {
  const rng = createRng(seed);
  const score = { player: 0, rival: 0 };
  let first = 'player';
  let guard = 0;
  let rounds = 0;
  let flicks = 0;
  let stale = 0;
  while (score.player < C.ROUNDS_TO_WIN && score.rival < C.ROUNDS_TO_WIN) {
    if (++guard > 24) return null;
    const w = rack();
    let turn = first;
    let loser = null;
    let decided = false;
    for (let k = 0; k < C.MAX_TURNS_PER_ROUND; k++) {
      const self = turn === 'player' ? w.player : w.rival;
      const target = turn === 'player' ? w.rival : w.player;
      const l = AI.chooseLaunch(self, target, TABLE, turn === 'player' ? dA : dB, rng);
      if (![l.dirX, l.dirZ, l.power, l.spin].every(Number.isFinite)) return 'bad';
      P.applyLaunch(self, l);
      flicks++;
      const r = runToRest(w, TABLE);
      if (r.timedOut) return 'bad';
      if (!finite(w.player) || !finite(w.rival)) return 'bad';
      if (r.knocked.length >= 1) {
        loser = r.knocked.length === 1 ? r.knocked[0] : null;
        decided = true;
        break;
      }
      turn = turn === 'player' ? 'rival' : 'player';
    }
    rounds++;
    if (!decided || loser === null) stale++;
    if (loser === 'player') score.rival++;
    else if (loser === 'rival') score.player++;
    first = loser ?? 'player'; // the loser of a round flicks first in the next
  }
  return { score, rounds, flicks, stale };
}
function series(dA, dB, games = 200) {
  const t = { wins: 0, played: 0, rounds: 0, flicks: 0, stale: 0, bad: 0, runaway: 0 };
  for (let i = 0; i < games; i++) {
    const m = playMatch(dA, dB, 60000 + i * 37);
    if (m === 'bad') { t.bad++; continue; }
    if (m === null) { t.runaway++; continue; }
    t.played++; t.rounds += m.rounds; t.flicks += m.flicks; t.stale += m.stale;
    if (m.score.player > m.score.rival) t.wins++;
  }
  return t;
}
{
  const nn = series('normal', 'normal');
  const hh = series('hard', 'hard');
  const he = series('hard', 'easy');
  const eh = series('easy', 'hard');
  const bad = nn.bad + hh.bad + he.bad + eh.bad;
  const runaway = nn.runaway + hh.runaway + he.runaway + eh.runaway;
  const rounds = nn.rounds + hh.rounds;
  const flicks = (nn.flicks + hh.flicks) / rounds;
  const stale = (nn.stale + hh.stale) / rounds;
  const pct = (t) => (t.wins / Math.max(1, t.played)) * 100;

  check('no NaN, no stuck rounds in 800 matches', bad === 0, `bad=${bad}`);
  check('every match reached a result', runaway === 0, `runaway=${runaway}`);
  check('steady vs steady is near even', pct(nn) > 40 && pct(nn) < 68,
    `first seat ${pct(nn).toFixed(0)}%`);
  check('ruthless vs ruthless is not a coin-flip lock', pct(hh) > 40 && pct(hh) < 80,
    `first seat ${pct(hh).toFixed(0)}%`);
  check('ruthless beats casual', pct(he) > 75, `${pct(he).toFixed(0)}%`);
  // Casual holds the first seat here, which is worth ~59-74% on its own, so the
  // bar is "loses clearly despite the advantage", not some tighter round number.
  check('casual loses to ruthless even holding the first seat', pct(eh) < 35,
    `casual first seat wins ${pct(eh).toFixed(0)}%`);
  check('rounds are snappy', flicks >= 1.5 && flicks <= 6, `${flicks.toFixed(1)} flicks/round`);
  check('stalemates are rare', stale < 0.15, `${(stale * 100).toFixed(0)}% of rounds`);
}

console.log('\n7. The rival only ever produces shots a human could take');
{
  const rng = createRng(42);
  let unit = 0;
  let minP = 1;
  let maxP = 0;
  let minS = 1;
  let maxS = -1;
  for (let i = 0; i < 2000; i++) {
    const w = rack();
    for (const p of [w.player, w.rival]) {
      p.x = (rng() * 2 - 1) * TABLE.halfW;
      p.z = (rng() * 2 - 1) * TABLE.halfD;
      p.angle = rng() * Math.PI * 2;
    }
    const d = ['easy', 'normal', 'hard'][i % 3];
    const l = AI.chooseLaunch(w.rival, w.player, TABLE, d, rng);
    if (![l.dirX, l.dirZ, l.power, l.spin].every(Number.isFinite)) {
      check('launch finite', false, `iteration ${i}`);
      break;
    }
    unit = Math.max(unit, Math.abs(Math.hypot(l.dirX, l.dirZ) - 1));
    minP = Math.min(minP, l.power); maxP = Math.max(maxP, l.power);
    minS = Math.min(minS, l.spin); maxS = Math.max(maxS, l.spin);
  }
  check('direction is always a unit vector', unit < 1e-9, `max error ${unit.toExponential(2)}`);
  check('power stays in the human 0..1 range', minP >= 0 && maxP <= 1,
    `[${minP.toFixed(2)}, ${maxP.toFixed(2)}]`);
  check('spin stays in the human -1..1 range', minS >= -1 && maxS <= 1,
    `[${minS.toFixed(2)}, ${maxS.toFixed(2)}]`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);

