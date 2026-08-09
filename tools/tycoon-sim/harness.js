/*
 * Donut Tycoon regression suite.
 *
 * Compiles the pure engine (src/tycoon/* — no React, no React Native) to plain
 * CommonJS and plays it headlessly in Node. The require itself is the coupling
 * guard: if a platform dependency ever leaks into the engine, it crashes here
 * instead of on a device.
 *
 * Covers: fresh state, tap math, generator costs (1.15^n), idle income,
 * offline earnings (50% rate, 8h cap, 60s floor), upgrade gating + stacking,
 * milestones, prestige token math + reset semantics, determinism, a long-run
 * fuzz for NaN/Infinity, corrupt-save sanitising and number formatting.
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
  // 15 taps to afford the first Barista ($15).
  for (let i = 0; i < 15; i++) s = T(s);
  const cost1 = E.costOf(D.GENERATOR_MAP.barista, 0);
  check('barista cost = 15', cost1 === 15);
  s = E.buyGenerator(s, 'barista');
  check('barista purchased', !!s && s.generators.barista === 1);
  check('cash drained', s.cash === 0);
  check('cps = 0.1', E.derive(s).cps === 0.1, `cps=${E.derive(s).cps}`);

  const cost2 = E.costOf(D.GENERATOR_MAP.barista, 1);
  check('second barista costs 15 * 1.15', Math.abs(cost2 - 17.25) < 1e-9, `cost=${cost2}`);

  // Locks: fryer needs a barista.
  let fresh = E.createGame(0);
  fresh = { ...fresh, cash: 1000 }; // afford whatever the lock test needs
  check('fryer locked without barista', E.buyGenerator(fresh, 'fryer') === null);
  let withBarista = { ...fresh, generators: { ...fresh.generators, barista: 1 } };
  const fryerLocked = E.buyGenerator({ ...withBarista, cash: 0 }, 'fryer');
  check('fryer still unaffordable without cash', fryerLocked === null);
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
  // give the save a barista + cash and move lastSeenAt back 2h
  let s = { ...base, cash: 100, generators: { ...base.generators, barista: 1 }, lastSeenAt: 100000 - 2 * 3600 * 1000 };
  const off = E.offlineEarnings(s, 100000);
  const expected = 0.1 * 7200 * 0.5; // 50% rate
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

  // gated upgrade: u_espresso needs a display case
  const gated = E.buyUpgrade({ ...s, upgrades: [] }, 'u_espresso');
  check('u_espresso locked without display', gated === null);
  const gated2 = E.buyUpgrade({ ...s, upgrades: [], generators: { ...s.generators, display: 1 } }, 'u_espresso');
  check('u_espresso buyable with display', !!gated2 && E.derive(gated2).tapMult === 2);
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
  // cps now boosted permanently
  const withBarista = E.buyGenerator(p, 'barista'); // needs cash — grant it
  const rich = E.buyGenerator({ ...p, cash: 100 }, 'barista');
  check('post-prestige cps boosted ×1.1', Math.abs(E.derive(rich).cps - 0.11) < 1e-9, `cps=${E.derive(rich).cps}`);
  // no prestige below threshold
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
      // buy anything affordable, one at a time
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
      if (s.cash > 1e12 && s.lifetimeEarned > 1e6) s = E.doPrestige(s) ?? s;
      if (!fin(s.cash) || !fin(E.derive(s).cps)) return { s, brokeAt: i };
    }
    return { s, brokeAt: -1 };
  };
  const a = run('a');
  check('fuzz run stays finite (50k steps)', a.brokeAt === -1, a.brokeAt >= 0 ? `broke at ${a.brokeAt}` : 'ok');
  check('fuzz end state sane', a.s.cash >= 0 && a.s.taps > 0 && a.s.playSeconds > 0);
  // determinism: identical seeds → identical states (ignoring wall-clock stamps)
  const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); c.lastSeenAt = 0; c.startedAt = 0; return JSON.stringify(c); };
  const b = run('a');
  check('deterministic runs agree', strip(a.s) === strip(b.s));
}

console.log('Corrupt saves');
{
  const cleaned = E.validateState(null);
  check('null save → fresh state', cleaned.cash === 0 && cleaned.taps === 0);
  const poisoned = E.validateState({ cash: NaN, taps: Infinity, generators: { barista: 1.9, nope: 5 }, upgrades: ['u_fresh', 'bogus'] });
  check('NaN cash sanitised to 0', poisoned.cash === 0);
  check('Infinity taps sanitised to 0', poisoned.taps === 0);
  check('generator counts floored + unknown ids dropped', poisoned.generators.barista === 1 && !('nope' in poisoned.generators));
  check('bogus upgrades dropped, real kept', poisoned.upgrades.includes('u_fresh') && !poisoned.upgrades.includes('bogus'));
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
