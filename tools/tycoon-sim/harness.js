/*
 * Café Tycoon regression suite.
 *
 * Compiles the pure engine (src/tycoon/* — no React, no React Native) to plain
 * CommonJS and plays it headlessly in Node.
 *
 * Covers: fresh state, tap math, generator costs (1.15^n), idle income,
 * offline earnings (50% rate, 8h cap, 60s floor), upgrade gating + stacking,
 * milestones, prestige token math + reset semantics, building expansion
 * (floors + rooms), slot assignment, determinism, a long-run fuzz for
 * NaN/Infinity, corrupt-save sanitising and number formatting.
 */
const E = require('./build/tycoon/engine.js');
const D = require('./build/tycoon/data.js');
const F = require('./build/tycoon/format.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? '  ' + detail : ''}`);
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const T = (s) => E.tap(s);
const A = (s, sec) => E.advance(s, sec).state;

console.log('Fresh state');
{
  const s = E.createGame(0);
  check('cash starts at 0', s.cash === 0);
  check('cps starts at 0', E.derive(s).cps === 0);
  check('tap power starts at 1', E.derive(s).tapPower === 1);
  check('all values finite', fin(s.cash) && fin(E.derive(s).cps) && fin(E.derive(s).tapPower));
  check('all generators at 0', Object.values(s.generators).every((v) => v === 0));
  check('floors starts at 1', s.floors === 1);
  check('floorWidth starts at 3', s.floorWidth === 3);
}

console.log('Tapping');
{
  let s = E.createGame(0);
  for (let i = 0; i < 10; i++) s = T(s);
  check('10 taps → cash 10', s.cash === 10, `cash=${s.cash}`);
  check('10 taps → taps 10', s.taps === 10);
  check('lifetime mirrors cash (no prestige yet)', s.lifetimeEarned === 10);
}

console.log('Generators');
{
  let s = E.createGame(0);
  for (let i = 0; i < 15; i++) s = T(s);
  const cost1 = E.costOf(D.GENERATOR_MAP.barista, 0);
  check('barista cost = 15', cost1 === 15);
  s = E.buyGenerator(s, 'barista');
  check('barista purchased', !!s && s.generators.barista === 1);
  check('cash drained', s.cash === 0);
  check('cps = 0.1', E.derive(s).cps === 0.1, `cps=${E.derive(s).cps}`);

  const cost2 = E.costOf(D.GENERATOR_MAP.barista, 1);
  check('second barista costs 15 * 1.15', Math.abs(cost2 - 17.25) < 1e-9, `cost=${cost2}`);

  let fresh = E.createGame(0);
  fresh = { ...fresh, cash: 1000 };
  check('fryer locked without barista', E.buyGenerator(fresh, 'fryer') === null);
  let withBarista = { ...fresh, generators: { ...fresh.generators, barista: 1 } };
  const fryerBought = E.buyGenerator(withBarista, 'fryer');
  check('fryer buyable with barista + cash', !!fryerBought && fryerBought.generators.fryer === 1);
}

console.log('Idle income');
{
  let s = E.createGame(0);
  for (let i = 0; i < 15; i++) s = T(s);
  s = E.buyGenerator(s, 'barista');
  const { state, earned } = E.advance(s, 10);
  check('10s idle with 0.1 cps → +1', Math.abs(earned - 1) < 1e-9, `earned=${earned}`);
  check('cash reflects idle income', state.cash === 1, `cash=${state.cash}`);
  check('play time accrued', state.playSeconds === 10);
}

console.log('Offline earnings');
{
  const base = E.createGame(100000);
  let s = { ...base, cash: 100, generators: { ...base.generators, barista: 1 }, lastSeenAt: 100000 - 2 * 3600 * 1000 };
  const off = E.offlineEarnings(s, 100000);
  const expected = 0.1 * 7200 * 0.5;
  check('2h offline at 0.1 cps → 360', Math.abs(off.earned - expected) < 1e-6, `earned=${off.earned}`);

  const short = E.offlineEarnings({ ...s, lastSeenAt: 100000 - 30 * 1000 }, 100000);
  check('30s away earns nothing', short.earned === 0);

  const capped = E.offlineEarnings({ ...s, lastSeenAt: 100000 - 20 * 3600 * 1000 }, 100000);
  const cappedExpected = 0.1 * 8 * 3600 * 0.5;
  check('20h away capped at 8h', Math.abs(capped.earned - cappedExpected) < 1e-6, `earned=${capped.earned}`);

  const applied = E.applyOffline(s, 100000);
  check('applyOffline credits cash', applied.earned === expected && applied.state.cash === 100 + expected);
  check('applyOffline stamps lastSeenAt', applied.state.lastSeenAt === 100000);
}

console.log('Upgrades');
{
  let s = E.createGame(0);
  s = { ...s, cash: 1000000 };
  check('u_fresh buyable', !!E.buyUpgrade(s, 'u_fresh'));
  s = E.buyUpgrade(s, 'u_fresh');
  check('tap power doubled', E.derive(s).tapPower === 2, `tapPower=${E.derive(s).tapPower}`);
  check('u_fresh cannot be re-bought', E.buyUpgrade(s, 'u_fresh') === null);

  const gated = E.buyUpgrade({ ...s, upgrades: [] }, 'u_espresso');
  check('u_espresso locked without display', gated === null);
  const gated2 = E.buyUpgrade({ ...s, upgrades: [], generators: { ...s.generators, display: 1 } }, 'u_espresso');
  check('u_espresso buyable with display', !!gated2 && E.derive(gated2).tapMult === 2);

  // income preview
  const preview = E.generatorIncomePreview(s, 'barista');
  check('generatorIncomePreview > 0', preview > 0, `preview=${preview}`);
}

console.log('Building expansion — floors');
{
  let s = E.createGame(0);
  s = { ...s, cash: 5000 };
  check('canBuyFloor with enough cash', E.canBuyFloor(s));
  check('floor cost > 0', E.floorCost(s) > 0);

  const costBefore = E.floorCost(s);
  const next = E.buyFloor(s);
  check('buyFloor succeeds', !!next);
  check('floors incremented', next.floors === 2);
  check('cash decreased', next.cash === 5000 - costBefore);
  check('floorWidth unchanged', next.floorWidth === 3);

  // buy up to max
  let rich = { ...E.createGame(0), cash: 1e15 };
  for (let i = 0; i < D.BUILDING.maxFloors - 1; i++) {
    rich = E.buyFloor(rich);
  }
  check('reached max floors', rich.floors === D.BUILDING.maxFloors);
  check('cannot buy beyond max', E.buyFloor(rich) === null);
}

console.log('Building expansion — rooms');
{
  let s = E.createGame(0);
  s = { ...s, cash: 5000 };
  check('canBuyRoom with enough cash', E.canBuyRoom(s));
  check('room cost > 0', E.roomCost(s) > 0);

  const costBefore = E.roomCost(s);
  const next = E.buyRoom(s);
  check('buyRoom succeeds', !!next);
  check('floorWidth incremented', next.floorWidth === 4);
  check('cash decreased', next.cash === 5000 - costBefore);
  check('floors unchanged', next.floors === 1);

  // buy up to max
  let rich = { ...E.createGame(0), cash: 1e15 };
  for (let i = 0; i < D.BUILDING.maxWidth - D.BUILDING.startingWidth; i++) {
    rich = E.buyRoom(rich);
  }
  check('reached max width', rich.floorWidth === D.BUILDING.maxWidth);
  check('cannot buy beyond max', E.buyRoom(rich) === null);
}

console.log('Slot assignment');
{
  let s = E.createGame(0);
  s = { ...s, generators: { ...s.generators, barista: 3, fryer: 2 } };
  const slots = E.slotAssignments(s);
  check('total slots = 5', slots.length === 5);
  // floor width 3 → first 3 on floor 0, next 2 on floor 1
  check('first 3 on floor 0', slots.filter((sl) => sl.floor === 0).length === 3);
  check('next 2 on floor 1', slots.filter((sl) => sl.floor === 1).length === 2);

  // with wider floor
  s = { ...s, floorWidth: 6 };
  const wideSlots = E.slotAssignments(s);
  check('wider floor → all on floor 0', wideSlots.every((sl) => sl.floor === 0));
}

console.log('Milestones');
{
  let s = E.createGame(0);
  for (let i = 0; i < 100; i++) s = T(s);
  check('100 taps unlocks m_tap_100', E.canClaimMilestone(s, 'm_tap_100'));
  const before = s.cash;
  const claimed = E.claimMilestone(s, 'm_tap_100');
  check('claim grants reward', claimed.cash === before + 500, `cash=${claimed.cash}`);
  check('claim marks milestone', claimed.milestonesClaimed.includes('m_tap_100'));
  check('cannot claim twice', E.claimMilestone(claimed, 'm_tap_100') === null);
  check('other milestones still locked', !E.canClaimMilestone(s, 'm_earn_1b'));
}

console.log('Prestige');
{
  let s = E.createGame(0);
  s = { ...s, cash: 1e6, lifetimeEarned: 1e6, allTimeEarned: 1e6, generators: { ...s.generators, barista: 5, fryer: 3 } };
  const gain = E.prestigeGain(s);
  check('1M lifetime → 1 token', gain === 1, `gain=${gain}`);
  const p = E.doPrestige(s);
  check('prestige resets cash', p.cash === 0);
  check('prestige resets generators', Object.values(p.generators).every((v) => v === 0));
  check('prestige resets run earnings', p.lifetimeEarned === 0);
  check('prestige keeps all-time', p.allTimeEarned === 1e6);
  check('prestige increments count', p.prestiges === 1);
  check('prestige banks tokens', p.prestigeTokens === 1);
  check('prestige multiplier = 1.1', E.prestigeMultiplier(p.prestigeTokens) === 1.1);
  check('prestige resets floors', p.floors === 1);
  check('prestige resets floorWidth', p.floorWidth === D.BUILDING.startingWidth);
  const rich = E.buyGenerator({ ...p, cash: 100 }, 'barista');
  check('post-prestige cps boosted ×1.1', Math.abs(E.derive(rich).cps - 0.11) < 1e-9, `cps=${E.derive(rich).cps}`);
  const poor = E.doPrestige({ ...s, lifetimeEarned: 100 });
  check('no prestige below $1M', poor.prestiges === 0 && poor.prestigeTokens === 0);
}

console.log('Determinism + long-run fuzz');
{
  const run = (seed) => {
    let s = E.createGame(0);
    for (let i = 0; i < 50000; i++) {
      const d = E.derive(s);
      if (i % 7 === 0) s = T(s);
      if (i % 3 === 0) s = A(s, 0.016);
      for (const g of D.GENERATORS) {
        if (s.cash >= E.costOf(g, s.generators[g.id]) && E.generatorUnlocked(s, g.id)) {
          s = E.buyGenerator(s, g.id) ?? s;
          break;
        }
      }
      for (const u of D.UPGRADES) {
        if (!s.upgrades.includes(u.id) && s.cash >= u.cost && E.upgradeUnlocked(s, u.id)) {
          s = E.buyUpgrade(s, u.id) ?? s;
          break;
        }
      }
      // occasionally expand building
      if (i % 500 === 0 && E.canBuyFloor(s)) s = E.buyFloor(s) ?? s;
      if (i % 400 === 0 && E.canBuyRoom(s)) s = E.buyRoom(s) ?? s;
      if (s.cash > 1e12 && s.lifetimeEarned > 1e6) s = E.doPrestige(s) ?? s;
      if (!fin(s.cash) || !fin(E.derive(s).cps)) return { s, brokeAt: i };
    }
    return { s, brokeAt: -1 };
  };
  const a = run('a');
  check('fuzz run stays finite (50k steps)', a.brokeAt === -1, a.brokeAt >= 0 ? `broke at ${a.brokeAt}` : 'ok');
  check('fuzz end state sane', a.s.cash >= 0 && a.s.taps > 0 && a.s.playSeconds > 0);
  check('fuzz floors valid', a.s.floors >= 1 && a.s.floors <= D.BUILDING.maxFloors);
  check('fuzz floorWidth valid', a.s.floorWidth >= D.BUILDING.startingWidth && a.s.floorWidth <= D.BUILDING.maxWidth);
  const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); c.lastSeenAt = 0; c.startedAt = 0; return JSON.stringify(c); };
  const b = run('a');
  check('deterministic runs agree', strip(a.s) === strip(b.s));
}

console.log('Corrupt saves');
{
  const cleaned = E.validateState(null);
  check('null save → fresh state', cleaned.cash === 0 && cleaned.taps === 0);
  check('null save → floors default 1', cleaned.floors === 1);
  check('null save → floorWidth default 3', cleaned.floorWidth === 3);
  const poisoned = E.validateState({ cash: NaN, taps: Infinity, generators: { barista: 1.9, nope: 5 }, upgrades: ['u_fresh', 'bogus'], floors: -5, floorWidth: 100 });
  check('NaN cash sanitised to 0', poisoned.cash === 0);
  check('Infinity taps sanitised to 0', poisoned.taps === 0);
  check('generator counts floored + unknown ids dropped', poisoned.generators.barista === 1 && !('nope' in poisoned.generators));
  check('bogus upgrades dropped, real kept', poisoned.upgrades.includes('u_fresh') && !poisoned.upgrades.includes('bogus'));
  check('invalid floors sanitised to 1', poisoned.floors === 1);
  check('invalid floorWidth sanitised to 3', poisoned.floorWidth === 3);
  const deepNaN = E.derive({ ...E.createGame(0), prestigeTokens: NaN });
  check('derive never returns NaN', fin(deepNaN.cps) && fin(deepNaN.tapPower));
}

console.log('Formatting');
{
  check('formatMoney(0) → $0', F.formatMoney(0) === '$0');
  check('formatMoney(999) → $999', F.formatMoney(999) === '$999');
  check('formatMoney(1500) → $1.5K', F.formatMoney(1500) === '$1.5K');
  check('formatMoney(1e9) → $1B', F.formatMoney(1e9) === '$1B');
  check('formatDuration(3725) → 1h 2m', F.formatDuration(3725) === '1h 2m');
  check('formatDuration(90) → 1m 30s', F.formatDuration(90) === '1m 30s');
  check('formatNumber(12345) → 12.3K', F.formatNumber(12345) === '12.3K');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
