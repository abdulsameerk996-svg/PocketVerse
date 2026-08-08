import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Polyline } from 'react-native-svg';
import Animated, { cancelAnimation, makeMutable, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { quickReward } from '@/core/game/quick';
import { GameHud, PressableScale, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import {
  ENEMY_POOL,
  PATH,
  PROJ_POOL,
  SLOTS,
  START_LIVES,
  TOWER_DEFS,
  TOWER_ORDER,
  WAVE_COUNT,
  createGame,
  placeTower,
  pointAt,
  runScore,
  slotPos,
  stepGame,
  upgradeCost,
  upgradeTower,
  type EnemyType,
  type Game,
  type TowerType,
} from './logic';
import type { TowerDefSave } from './types';

/**
 * ============================================================================
 *  TOWER DEFENSE MINI
 * ============================================================================
 *
 * The one "systems" quick game. The simulation is pure and deterministic
 * (logic.ts) and runs on the JS thread at ~30 Hz; a fixed set of `makeMutable`
 * values carries enemy/projectile positions to animated styles, so React
 * re-renders only on tower changes, waves, coins and game over — never per
 * frame. Tap a build slot, choose a tower, upgrade as the waves tighten.
 */

const ENEMY_LOOK: Record<EnemyType, { size: number; color: string }> = {
  normal: { size: 18, color: palette.coral },
  fast: { size: 15, color: '#FFB443' },
  tank: { size: 26, color: '#B08CFF' },
  shielded: { size: 20, color: palette.mint },
  boss: { size: 38, color: palette.rose },
};

const TOWER_LABEL: Record<TowerType, string> = { gun: 'Gun', rapid: 'Rapid', frost: 'Frost' };

type Visuals = {
  ex: SharedValue<number>[];
  ey: SharedValue<number>[];
  eh: SharedValue<number>[];
  ek: SharedValue<number>[];
  px_: SharedValue<number>[];
  py_: SharedValue<number>[];
};

export function TowerDefSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width, height } = useResponsive();
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const gameRef = useRef<Game | null>(null);
  if (dims && !gameRef.current) {
    gameRef.current = createGame(dims.w, dims.h, { luck: modifiers.luck, speed: modifiers.speed });
  }
  const g = gameRef.current;

  const visuals = useRef<Visuals | null>(null);
  if (visuals.current === null) {
    const mk = (n: number) => Array.from({ length: n }, () => makeMutable(-999));
    visuals.current = {
      ex: mk(ENEMY_POOL),
      ey: mk(ENEMY_POOL),
      eh: mk(ENEMY_POOL),
      ek: mk(ENEMY_POOL),
      px_: mk(PROJ_POOL),
      py_: mk(PROJ_POOL),
    };
  }
  const vs = visuals.current;

  useEffect(
    () => () => {
      for (const arr of [vs.ex, vs.ey, vs.eh, vs.ek, vs.px_, vs.py_]) {
        for (const m of arr) cancelAnimation(m);
      }
    },
    [vs],
  );

  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [wave, setWave] = useState(1);
  const [score, setScore] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);

  const killsRef = useRef(0);
  const hitSoundAt = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);
  const tickNo = useRef(0);

  const showBanner = useCallback((text: string, ms = 1500) => {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  /* ----------------------------------------------------------- the loop */
  const tick = useCallback(() => {
    if (!g || g.phase === 'over' || g.phase === 'won' || paused) return;
    const events = stepGame(g, 1 / 30);
    tickNo.current += 1;

    for (let i = 0; i < ENEMY_POOL; i++) {
      const e = g.enemies[i];
      if (e.active) {
        const p = pointAt(g.path, g.w, g.h, e.t);
        vs.ex[i].value = p.x;
        vs.ey[i].value = p.y;
        vs.eh[i].value = Math.max(0, e.hp / e.maxHp);
        vs.ek[i].value = ENEMY_POOL + ENEMY_LOOK[e.type].size; // packed: pool off + size
      } else {
        vs.ex[i].value = -999;
      }
    }
    for (let i = 0; i < PROJ_POOL; i++) {
      const p = g.projectiles[i];
      if (p.active) {
        vs.px_[i].value = p.x;
        vs.py_[i].value = p.y;
      } else {
        vs.px_[i].value = -999;
      }
    }

    for (const ev of events) {
      if (ev === 'kill') {
        killsRef.current += 1;
        play('game.collect', { volume: 0.3 });
      } else if (ev === 'hit') {
        const now = Date.now();
        if (now - hitSoundAt.current > 160) {
          hitSoundAt.current = now;
          play('game.hit', { volume: 0.2 });
        }
      } else if (ev === 'leak') {
        setLives(g.lives);
        play('game.crash', { volume: 0.6 });
        haptics.fail();
      } else if (ev === 'waveStart') {
        setWave(g.wave);
        showBanner(`WAVE ${g.wave}`);
        play('game.start', { volume: 0.5 });
      } else if (ev === 'waveClear') {
        setCoins(g.coins);
        showBanner(`Wave ${g.wave - 1} cleared · +${120 + (g.wave - 1) * 40}`);
        play('reward.levelup', { volume: 0.6 });
        haptics.collect();
      } else if (ev === 'win') {
        setWon(true);
        showBanner('CORE SECURED', 2000);
        play('reward.chest');
        haptics.success();
        setTimeout(() => finish(true), 1400);
      } else if (ev === 'lose') {
        showBanner('OVERWHELMED', 1800);
        setTimeout(() => finish(false), 1200);
      } else if (ev === 'build') {
        setCoins(g.coins);
        play('ui.tap');
        haptics.press();
      } else if (ev === 'upgrade') {
        setCoins(g.coins);
        play('reward.chest', { volume: 0.5 });
        haptics.success();
      } else if (ev === 'denied') {
        haptics.warn();
        play('ui.error');
      }
    }

    if (tickNo.current % 8 === 0) setScore(runScore(g));
  }, [g, paused, showBanner, vs]);

  useEffect(() => {
    if (!g) return;
    const id = setInterval(tick, 33);
    return () => clearInterval(id);
  }, [g, tick]);

  useEffect(() => {
    if (g) {
      setCoins(g.coins);
      setLives(g.lives);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  useEffect(() => play('game.start'), []);

  const finish = useCallback(
    (win: boolean) => {
      if (finished.current || !g) return;
      finished.current = true;
      setOver(true);
      const sc = runScore(g);
      const elapsed = Math.round(g.time);
      setTimeout(() => {
        onFinish({
          score: sc,
          outcome: win ? 'win' : 'lose',
          metrics: { towerdef_wave: g.wave, towerdef_kills: killsRef.current },
          reward: quickReward(sc, elapsed, { won: win, wave: g.wave }),
          breakdown: [
            { label: 'Wave', value: `${Math.min(g.wave, WAVE_COUNT)} / ${WAVE_COUNT}` },
            { label: 'Kills', value: `${killsRef.current}` },
            { label: 'Lives left', value: `${g.lives}` },
          ],
        });
        setSave((s: unknown) => {
          const save2 = (s ?? { runs: 0, best: 0, bestWave: 0 }) as TowerDefSave;
          return {
            ...save2,
            runs: save2.runs + 1,
            best: Math.max(save2.best, sc),
            bestWave: Math.max(save2.bestWave, g.wave),
          };
        });
      }, 900);
    },
    [g, onFinish, setSave],
  );

  /* ------------------------------------------------------ build actions */
  const build = useCallback(
    (type: TowerType) => {
      if (selected === null || !g) return;
      const ev = placeTower(g, selected, type);
      if (ev === 'build') {
        setSelected(null);
        setCoins(g.coins);
        play('ui.tap');
        haptics.press();
      } else {
        haptics.warn();
        play('ui.error');
      }
    },
    [g, selected],
  );

  const upgrade = useCallback(() => {
    if (selected === null || !g) return;
    const ev = upgradeTower(g, selected);
    if (ev === 'upgrade') {
      setCoins(g.coins);
      play('reward.chest', { volume: 0.5 });
      haptics.success();
    } else {
      haptics.warn();
      play('ui.error');
    }
  }, [g, selected]);

  /* ------------------------------------------------------- rendering */
  const arenaW = dims?.w ?? width;
  const arenaH = dims?.h ?? height;

  const pathPts = useMemo(
    () =>
      dims
        ? PATH.map((p) => `${(p.x * dims.w).toFixed(1)},${(p.y * dims.h).toFixed(1)}`).join(' ')
        : '',
    [dims],
  );

  const selectedTower = selected !== null ? (g?.slots[selected]?.type ?? null) : null;
  const selectedLevel = selected !== null ? (g?.slots[selected]?.level ?? 0) : 0;
  const upgradePrice =
    selectedTower && selectedLevel < 3 ? upgradeCost(selectedTower, selectedLevel) : 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#101322', '#0B0A18', '#07070F']} style={StyleSheet.absoluteFill} />

      <GameHud
        onPause={requestPause}
        accent={palette.mint}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.mint}>
              TOWER DEFENSE · WAVE {Math.min(wave, WAVE_COUNT)}/{WAVE_COUNT}
            </Text>
            <Text variant="display" numeric>
              {score}
            </Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={palette.coin}>
              🪙 {coins}
            </Text>
            <Text variant="label" color={lives > 2 ? palette.mint : palette.coral}>
              {'♥'.repeat(Math.max(0, lives))}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, START_LIVES - lives))}
              </Text>
            </Text>
          </View>
        }
      />

      <View
        style={styles.arena}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setDims((d) => (d ? d : { w, h }));
        }}
      >
        {dims ? (
          <>
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Polyline points={pathPts} fill="none" stroke="#2C2347" strokeWidth={14} strokeLinejoin="round" />
              <Polyline points={pathPts} fill="none" stroke="#433566" strokeWidth={5} strokeLinejoin="round" />
            </Svg>

            {SLOTS.map((_, i) => {
              const pos = slotPos(i, dims.w, dims.h);
              const type = g?.slots[i]?.type ?? null;
              const level = g?.slots[i]?.level ?? 0;
              const isSel = selected === i;
              return (
                <PressableScale
                  key={i}
                  onPress={() => {
                    haptics.tap();
                    setSelected(isSel ? null : i);
                  }}
                  scaleTo={0.9}
                  haptic={false}
                  style={[
                    styles.slot,
                    { left: pos.x - 18, top: pos.y - 18 },
                    isSel && styles.slotSel,
                    !type && styles.slotEmpty,
                  ]}
                >
                  {type ? (
                    <>
                      <View style={[styles.towerCore, { backgroundColor: TOWER_DEFS[type].color }]} />
                      <View style={styles.pips}>
                        {[1, 2, 3].map((p) => (
                          <View
                            key={p}
                            style={[
                              styles.pip,
                              p <= level ? { backgroundColor: TOWER_DEFS[type].color } : null,
                            ]}
                          />
                        ))}
                      </View>
                    </>
                  ) : (
                    <View style={styles.slotRing} />
                  )}
                </PressableScale>
              );
            })}

            {Array.from({ length: ENEMY_POOL }, (_, i) => (
              <EnemyView key={i} index={i} vs={vs} />
            ))}
            {Array.from({ length: PROJ_POOL }, (_, i) => (
              <ProjectileView key={i} index={i} vs={vs} />
            ))}

            {banner ? (
              <View pointerEvents="none" style={styles.banner}>
                <Text variant="display" center color={won ? palette.mint : palette.text}>
                  {banner}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Build / upgrade bar */}
      {!over && (
        <View style={styles.actionBar}>
          {selected === null ? (
            <Text variant="caption" faint center style={{ flex: 1 }}>
              Tap a ring to build · waves start automatically
            </Text>
          ) : selectedTower ? (
            <>
              <View style={{ flex: 1 }}>
                <Text variant="label">{TOWER_LABEL[selectedTower]} · LV {selectedLevel}</Text>
                <Text variant="micro" muted>
                  {selectedLevel >= 3 ? 'Max level' : `Upgrade · ${upgradePrice} 🪙`}
                </Text>
              </View>
              <PressableScale
                onPress={upgrade}
                scaleTo={0.94}
                disabled={selectedLevel >= 3 || coins < upgradePrice}
                style={[styles.actionBtn, { borderColor: palette.gold }]}
              >
                <Text variant="label" color={palette.gold}>
                  UPGRADE
                </Text>
              </PressableScale>
              <PressableScale onPress={() => setSelected(null)} scaleTo={0.94} style={styles.actionBtn}>
                <Text variant="label" muted>
                  CANCEL
                </Text>
              </PressableScale>
            </>
          ) : (
            <>
              {TOWER_ORDER.map((t) => {
                const cost = TOWER_DEFS[t].cost;
                const afford = coins >= cost;
                return (
                  <PressableScale
                    key={t}
                    onPress={() => build(t)}
                    scaleTo={0.94}
                    disabled={!afford}
                    style={[styles.actionBtn, { borderColor: TOWER_DEFS[t].color, opacity: afford ? 1 : 0.4 }]}
                  >
                    <View style={[styles.actionDot, { backgroundColor: TOWER_DEFS[t].color }]} />
                    <Text variant="micro" muted>
                      {TOWER_LABEL[t]}
                    </Text>
                    <Text variant="micro" color={afford ? palette.coin : palette.textMuted}>
                      {cost}
                    </Text>
                  </PressableScale>
                );
              })}
              <PressableScale onPress={() => setSelected(null)} scaleTo={0.94} style={styles.actionBtn}>
                <Text variant="label" muted>
                  ✕
                </Text>
              </PressableScale>
            </>
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const EnemyView = React.memo(function EnemyView({
  index,
  vs,
}: {
  index: number;
  vs: Visuals;
}) {
  const style = useAnimatedStyle(() => {
    const x = vs.ex[index].value;
    if (x < -500) return { opacity: 0 };
    const size = vs.ek[index].value - ENEMY_POOL;
    const color =
      size <= 16
        ? '#FFB443'
        : size <= 18
          ? palette.coral
          : size <= 20
            ? palette.mint
            : size <= 26
              ? '#B08CFF'
              : palette.rose;
    const hp = vs.eh[index].value;
    return {
      opacity: 1,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: `${color}E6`,
      borderColor: color,
      borderWidth: 1.5,
      transform: [{ translateX: x - size / 2 }, { translateY: vs.ey[index].value - size / 2 }],
    };
  });
  const hpStyle = useAnimatedStyle(() => ({
    width: `${Math.round(vs.eh[index].value * 100)}%`,
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.enemy, style]}>
      <View style={styles.hpBar}>
        <Animated.View style={[styles.hpFill, hpStyle]} />
      </View>
    </Animated.View>
  );
});

const ProjectileView = React.memo(function ProjectileView({
  index,
  vs,
}: {
  index: number;
  vs: Visuals;
}) {
  const style = useAnimatedStyle(() => {
    const x = vs.px_[index].value;
    if (x < -500) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: x - 3 }, { translateY: vs.py_[index].value - 3 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.proj, style]} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  arena: { flex: 1, marginHorizontal: spacing.sm },
  slot: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  slotEmpty: { borderStyle: 'dashed' },
  slotSel: { borderColor: palette.gold, backgroundColor: 'rgba(255,209,102,0.14)', borderWidth: 2 },
  slotRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  towerCore: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  pips: { position: 'absolute', bottom: 2, flexDirection: 'row', gap: 2 },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  enemy: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hpBar: { position: 'absolute', bottom: -5, width: '80%', height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.55)', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: palette.mint },
  proj: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#BFF0FF' },
  banner: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(6,6,14,0.72)',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionDot: { width: 12, height: 12, borderRadius: 6 },
});
