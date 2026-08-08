/*
 * Arena2d regression suite — the shared planar solver used by every 3D arena
 * game (Air Hockey, Sumo, Tank Duel, Color Clash, Dodge Duel).
 *
 * Phase 6A's corner fix lives in arena2d itself: non-finite recovery in
 * `integrate`/`collide`/`clampRect` and velocity zeroing at the walls. This
 * suite exists to keep it honest — ram bodies into every corner and edge,
 * poison their values with NaN/Infinity, and assert the world recovers.
 * If someone ever removes a guard, this fails on the first frame.
 */
const A = require('./build/core/game3d/arena2d.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

const HALF = 5;

console.log('1. Corners never trap a body');
{
  const corners = [
    [-HALF, -HALF],
    [HALF, -HALF],
    [-HALF, HALF],
    [HALF, HALF],
  ];
  for (const [cx, cz] of corners) {
    const b = A.makeBody(cx, cz, 0.5);
    for (let i = 0; i < 300; i++) {
      // Slam diagonally into the corner, alternating axes, then try to move out.
      A.push(b, cx > 0 ? 1 : -1, cz > 0 ? 1 : -1, 40);
      A.integrate(b, 1 / 60);
      A.clampRect(b, HALF, HALF);
    }
    check(
      `corner (${cx}, ${cz}) recovers and stays in bounds`,
      fin(b.x) && fin(b.z) && Math.abs(b.x) <= HALF - b.radius + 1e-9 && Math.abs(b.z) <= HALF - b.radius + 1e-9,
      `x=${b.x.toFixed(3)} z=${b.z.toFixed(3)} vx=${b.vx.toFixed(3)} vz=${b.vz.toFixed(3)}`,
    );
    // And it can still move afterwards.
    A.push(b, -cx, -cz, 20);
    A.integrate(b, 1 / 60);
    A.clampRect(b, HALF, HALF);
    check('...and still moves out of the corner', Math.hypot(b.vx, b.vz) > 0, `speed ${Math.hypot(b.vx, b.vz).toFixed(2)}`);
  }
}

console.log('\n2. NaN/Infinity never propagates');
{
  const b = A.makeBody(0, 0, 0.5);
  b.vx = NaN;
  b.vz = Infinity;
  A.integrate(b, 1 / 60);
  check('integrate zeroes a poisoned velocity', fin(b.vx) && fin(b.vz) && b.vx === 0 && b.vz === 0);

  const c = A.makeBody(NaN, Infinity, 0.5);
  A.clampRect(c, HALF, HALF);
  check('clampRect recovers a poisoned position to the centre', fin(c.x) && fin(c.z) && c.x === 0 && c.z === 0);

  const d = A.makeBody(-HALF, HALF, 0.5);
  d.x = NaN;
  A.clampRect(d, HALF, HALF);
  A.integrate(d, 1 / 60);
  check('clampRect then integrate stays finite', fin(d.x) && fin(d.z) && fin(d.vx) && fin(d.vz));
}

console.log('\n3. collide is NaN-proof and does not spread poison');
{
  const a = A.makeBody(0, 0, 1);
  const b = A.makeBody(NaN, NaN, 1);
  const hit = A.collide(a, b);
  check('collide with a NaN body is a no-hit', hit.happened === false, JSON.stringify(hit));
  check('...and the clean body is untouched', fin(a.x) && fin(a.z) && a.x === 0);

  // A real head-on collision transfers momentum and stays finite.
  const x = A.makeBody(-1.5, 0, 1);
  const y = A.makeBody(1.5, 0, 1);
  x.vx = 4;
  for (let i = 0; i < 90; i++) {
    A.integrate(x, 1 / 120);
    A.integrate(y, 1 / 120);
    A.collide(x, y);
  }
  check('head-on collision resolves and stays finite', fin(x.x) && fin(x.vx) && fin(y.x) && fin(y.vx));
  check('...and the pair separates', Math.abs(x.x - y.x) >= x.radius + y.radius - 1e-6);
}

console.log('\n4. push with a zero vector never produces NaN');
{
  const b = A.makeBody(0, 0, 0.5);
  A.push(b, 0, 0, 50);
  A.integrate(b, 1 / 60);
  check('push(0,0) is a no-op', b.vx === 0 && b.vz === 0 && fin(b.vx) && fin(b.vz));
}

console.log('\n5. Long-run fuzz: every body stays finite and inside the world');
{
  let bad = 0;
  let out = 0;
  const bodies = [A.makeBody(0, 0, 0.5), A.makeBody(2, -2, 0.7), A.makeBody(-3, 1, 0.6)];
  for (let i = 0; i < 20000; i++) {
    for (const b of bodies) {
      A.push(b, (i * 37) % 7 - 3, (i * 91) % 9 - 4, 6);
      A.integrate(b, 1 / 120);
      if (i % 2 === 0) {
        const axis = A.bounceRect(b, HALF, HALF);
        void axis;
      } else {
        A.clampRect(b, HALF, HALF);
      }
      if (!fin(b.x) || !fin(b.z) || !fin(b.vx) || !fin(b.vz)) bad++;
      if (Math.abs(b.x) > HALF + 0.5 || Math.abs(b.z) > HALF + 0.5) out++;
    }
  }
  check('20k steps, zero NaN/Infinity', bad === 0, `${bad} violations`);
  check('20k steps, zero escapes', out === 0, `${out} escapes`);
  check('velocity never exceeds a sane bound', bodies.every((b) => Math.hypot(b.vx, b.vz) < 400));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
