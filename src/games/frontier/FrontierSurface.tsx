import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { HAS_KEYBOARD } from '@/core/game3d';
import {
  Button,
  Card,
  SpriteView,
  Text,
  haptics,
  palette,
  play,
  radius,
  spacing,
  spriteForGame,
} from '@/ui';
import { BIOMES, BOSSES, UPGRADE_MAP, normalizeFrontierSave } from './content';
import { applyUpgrade, createRun, finishRun } from './sim';
import { FrontierScene, type CamDiag } from './Scene';
import type {
  Banner,
  BiomeId,
  EventKind,
  FrontierInput,
  FrontierSave,
  UpgradeId,
  World,
} from './types';
import type { GameSurfaceProps } from '@/core/registry';

/**
 * ============================================================================
 *  POCKETVERSE FRONTIER — SURFACE
 * ============================================================================
 *
 * The shell around the sim: input (one path for thumbs, one for keys), a 10 Hz
 * HUD readout, the minimap, the upgrade picker and the run-finish flow. The
 * scene is pure three.js and never re-renders from React; the HUD is plain
 * React and never reads per-frame state — the two halves of the game only
 * meet at a 100 ms interval.
 */

const HUD_TICK = 100;

type BossHud = { name: string; accent: string; hp: number; maxHp: number; phase: number } | null;

type Hud = {
  time: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNeed: number;
  stamina: number;
  kills: number;
  elites: number;
  bosses: number;
  landmarkCount: number;
  biome: BiomeId;
  banner: Banner;
  choosing: boolean;
  choices: UpgradeId[];
  boss: BossHud;
  abilityCd: number;
  dashCd: number;
  buffT: number;
  objective: { name: string; dist: number; x: number; z: number };
  px: number;
  pz: number;
  event: { kind: EventKind; x: number; z: number };
  landmarks: { id: string; x: number; z: number; discovered: boolean; boss: boolean; accent: string }[];
  over: boolean;
};

export default function FrontierSurface({
  onFinish,
  track,
  modifiers,
  paused,
  requestPause,
  save,
  setSave,
}: GameSurfaceProps) {
  const [seed] = useState(() => (Date.now() ^ ((Math.random() * 0x7fffffff) | 0)) | 0);
  const mods = useMemo(
    () => ({ speed: modifiers.speed ?? 0, armor: modifiers.armor ?? 0, luck: modifiers.luck ?? 0 }),
    // Host memoises modifiers per run; the surface remounts per run anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // World creation is a one-shot per run. A failed seed must surface as a
  // readable error screen instead of a blank canvas; `attempt` rebuilds it.
  // The run itself only begins from the start menu, so the sim never exists
  // until the player commits to it.
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<'menu' | 'run'>('menu');
  const world = useMemo(() => {
    if (stage !== 'run') return null;
    try {
      return createRun(seed, normalizeFrontierSave(save), mods);
    } catch (e) {
      console.error('[frontier] world creation failed:', e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, attempt, stage]);

  const worldRef = useRef<World | null>(null);
  if (world && worldRef.current === null) worldRef.current = world;

  const input = useRef<FrontierInput>({ mx: 0, mz: 0, sprint: false, melee: false, dash: false, ability: false });
  // Dev-only: filled by the scene's frame loop for the renderer diagnostic.
  const camDiag = useRef<CamDiag>({ x: 0, y: 0, z: 0 });

  const [hud, setHud] = useState<Hud>(() => (world ? snapshot(world) : emptyHud()));
  // The scene mounts immediately so R3F can warm up behind the flash; the
  // overlay guarantees the player never sees a half-initialised world.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 380);
    return () => clearTimeout(t);
  }, []);
  const [finishing, setFinishing] = useState(false);
  const finished = useRef(false);

  const trackRef = useRef(track);
  trackRef.current = track;
  const setSaveRef = useRef(setSave);
  setSaveRef.current = setSave;
  const saveRef = useRef(save);
  saveRef.current = save;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const lastTracked = useRef({ kills: 0, elites: 0, bosses: 0, landmarks: 0 });
  const lastTime = useRef(0);
  const lastHud = useRef('');

  /* ------------------------------------------------ 10 Hz HUD readout ---- */
  useEffect(() => {
    const id = setInterval(() => {
      const w = worldRef.current;
      if (!w) return;

      // sound queue — drained here so the sim never touches audio
      if (w.sfx.length) {
        for (const cue of w.sfx) play(cue as Parameters<typeof play>[0]);
        w.sfx.length = 0;
      }

      // live quest progress — deltas only, so the host's finish track() does
      // not double-count anything
      const lt = lastTracked.current;
      const delta = {
        frontier_kills: w.stats.kills - lt.kills,
        frontier_elites: w.stats.elites - lt.elites,
        frontier_bosses: w.stats.bosses - lt.bosses,
        frontier_landmarks: w.stats.landmarks - lt.landmarks,
        frontier_time: Math.round(w.time),
      };
      lt.kills = w.stats.kills;
      lt.elites = w.stats.elites;
      lt.bosses = w.stats.bosses;
      lt.landmarks = w.stats.landmarks;
      if (
        delta.frontier_kills ||
        delta.frontier_elites ||
        delta.frontier_bosses ||
        delta.frontier_landmarks ||
        delta.frontier_time !== lastTime.current
      ) {
        trackRef.current(delta);
        lastTime.current = delta.frontier_time;
      }

      const s = snapshot(w);
      const key = `${s.time.toFixed(1)}|${s.hp}|${s.level}|${s.choosing}|${s.boss?.hp ?? 'n'}|${s.kills}|${s.banner?.text ?? ''}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud(s);
      }
    }, HUD_TICK);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------- run finish flow -- */
  const endRun = useCallback(() => {
    const w = worldRef.current;
    if (!w || finished.current) return;
    finished.current = true;
    setFinishing(true);

    const result = finishRun(w);
    const prev = normalizeFrontierSave(saveRef.current);
    const next: FrontierSave = {
      bestScore: Math.max(prev.bestScore, result.score),
      bestTime: Math.max(prev.bestTime, Math.round(w.time)),
      runs: prev.runs + 1,
      totalKills: prev.totalKills + w.stats.kills,
      totalBosses: prev.totalBosses + w.stats.bosses,
      totalElites: prev.totalElites + w.stats.elites,
      totalLandmarks: prev.totalLandmarks + w.stats.landmarks,
      bossesDefeated: [...new Set([...prev.bossesDefeated, ...w.stats.bossesDefeated])],
      permanent: {
        damage: Math.min(0.3, w.permanent.damage),
        maxHp: Math.min(60, w.permanent.maxHp),
        moveSpeed: Math.min(0.12, w.permanent.moveSpeed),
      },
    };
    setSaveRef.current(next);

    // remaining deltas + run counter handed to the host (tracked once there)
    const lt = lastTracked.current;
    const metrics = {
      frontier_kills: w.stats.kills - lt.kills,
      frontier_elites: w.stats.elites - lt.elites,
      frontier_bosses: w.stats.bosses - lt.bosses,
      frontier_landmarks: w.stats.landmarks - lt.landmarks,
      frontier_time: Math.round(w.time),
      frontier_runs: 1,
    };
    lt.kills = w.stats.kills;
    lt.elites = w.stats.elites;
    lt.bosses = w.stats.bosses;
    lt.landmarks = w.stats.landmarks;

    haptics.fail();
    play('game.over');
    setTimeout(() => {
      onFinishRef.current({
        score: result.score,
        outcome: 'lose',
        metrics,
        reward: { coins: result.coins, xp: result.xp, gems: result.gems, items: result.items },
        breakdown: [
          { label: 'Time survived', value: `${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, '0')}` },
          { label: 'Enemies defeated', value: String(w.stats.kills) },
          { label: 'Elites', value: String(w.stats.elites) },
          { label: 'Bosses', value: String(w.stats.bosses) },
          { label: 'Landmarks', value: String(w.stats.landmarks) },
          { label: 'Gems collected', value: String(w.stats.gems) },
          { label: 'Rare relics', value: String(w.stats.rares) },
        ],
      });
    }, 1300);
  }, []);

  const pickUpgrade = useCallback((id: UpgradeId) => {
    const w = worldRef.current;
    if (!w) return;
    applyUpgrade(w, id);
    haptics.success();
  }, []);

  /* ----------------------------------------------------------- keyboard --- */
  useEffect(() => {
    if (!HAS_KEYBOARD || typeof window === 'undefined') return;
    const held = new Set<string>();
    const recompute = () => {
      let x = 0;
      let z = 0;
      if (held.has('a')) x -= 1;
      if (held.has('d')) x += 1;
      if (held.has('ArrowLeft')) x -= 1;
      if (held.has('ArrowRight')) x += 1;
      if (held.has('w')) z -= 1;
      if (held.has('ArrowUp')) z -= 1;
      if (held.has('s')) z += 1;
      if (held.has('ArrowDown')) z += 1;
      const len = Math.hypot(x, z);
      input.current.mx = len > 1 ? x / len : x;
      input.current.mz = len > 1 ? z / len : z;
    };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const move = ['a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k);
      if (move) {
        e.preventDefault();
        held.add(k);
        recompute();
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        input.current.melee = true;
        return;
      }
      if (e.key === 'Shift' && e.location === 2) {
        input.current.sprint = true;
        return;
      }
      if (k === 'Shift' && e.location === 0) {
        if (!e.repeat) input.current.dash = true;
        return;
      }
      if ((k === 'e' || k === 'f') && !e.repeat) input.current.ability = true;
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
        held.delete(k);
        recompute();
        return;
      }
      if (k === ' ') input.current.melee = false;
      if (e.key === 'Shift' && e.location === 2) input.current.sprint = false;
    };
    const release = () => {
      held.clear();
      input.current.mx = 0;
      input.current.mz = 0;
      input.current.melee = false;
      input.current.sprint = false;
      recompute();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);

  const showTouch = !HAS_KEYBOARD;

  if (stage === 'menu') {
    return <FrontierMenu save={save} onStart={() => setStage('run')} />;
  }

  if (!world) {
    return (
      <View style={styles.root}>
        <View style={styles.errorCard}>
          <Text variant="micro" color={palette.coral} center>
            FRONTIER · INIT ERROR
          </Text>
          <Text variant="heading" center style={{ marginTop: spacing.xs }}>
            The frontier could not load
          </Text>
          <Text variant="caption" muted center style={{ marginTop: spacing.sm }}>
            World generation hit an error. Retry — your frontier save is safe.
          </Text>
          <Button label="Try again" onPress={() => setAttempt((a) => a + 1)} full style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FrontierScene world={worldRef} input={input} paused={paused} seed={seed} onOver={endRun} camDiag={camDiag} />

      {!ready ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <Text variant="heading" color={palette.mint}>
            FRONTIER
          </Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Loading world…
          </Text>
        </View>
      ) : null}

      {/* ------------------------------------------------------------ HUD -- */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <TopBar hud={hud} paused={paused} onPause={requestPause} />
        <Vitals hud={hud} />
        {hud.boss ? <BossBar hud={hud.boss} /> : <ObjectiveRow hud={hud} />}
        <Minimap hud={hud} />
        {hud.banner ? (
          <Animated.View
            key={`${hud.banner.text}:${hud.banner.color}`}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(300)}
            pointerEvents="none"
            style={styles.bannerWrap}
          >
            <Text variant="title" center color={hud.banner.color} style={styles.bannerText}>
              {hud.banner.text}
            </Text>
          </Animated.View>
        ) : null}
        {finishing ? (
          <View pointerEvents="none" style={styles.deathOverlay}>
            <Text variant="display" center color={palette.coral}>
              You fell
            </Text>
            <Text variant="caption" muted center style={{ marginTop: spacing.xs }}>
              tallying your run…
            </Text>
          </View>
        ) : null}
        {__DEV__ ? <DevDiagnostics world={worldRef} cam={camDiag} /> : null}
      </View>

      {/* ---------------------------------------------------- touch input --- */}
      {showTouch && !hud.choosing && !finishing ? (
        <FrontierTouch input={input} />
      ) : null}

      {/* -------------------------------------------------- upgrade picker -- */}
      {hud.choosing ? (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text variant="micro" color={palette.gold} center>
              LEVEL {hud.level}
            </Text>
            <Text variant="heading" center style={{ marginTop: spacing.xxs }}>
              Choose an upgrade
            </Text>
            <Text variant="caption" muted center style={{ marginBottom: spacing.lg }}>
              The frontier waits for no one.
            </Text>
            <View style={styles.choices}>
              {hud.choices.map((id) => {
                const u = UPGRADE_MAP[id];
                return (
                  <Pressable key={id} style={styles.choice} onPress={() => pickUpgrade(id)}>
                    <Text size={22}>{u.glyph}</Text>
                    <Text variant="subheading" style={{ marginTop: spacing.xs }}>
                      {u.name}
                    </Text>
                    <Text variant="caption" muted center style={{ marginTop: 2 }}>
                      {u.desc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ============================================================ start menu == */

/**
 * Pre-run menu. The host has already paid the energy cost; this screen is the
 * honest "should you go out again" moment — your best run, the permanent
 * upgrades your boss kills earned, and the controls, all read from the same
 * persisted save the run will write to. No fabricated stats: every number
 * comes out of `normalizeFrontierSave`.
 */
function FrontierMenu({ save, onStart }: { save: unknown; onStart: () => void }) {
  const [showHelp, setShowHelp] = useState(false);
  const s = normalizeFrontierSave(save);
  const hasRun = s.runs > 0;
  const bossNames = s.bossesDefeated
    .map((id) => BOSSES[id]?.name)
    .filter((n): n is string => !!n)
    .join(' · ');
  const upgrades = [
    { label: 'DMG', value: `+${Math.round(s.permanent.damage * 100)}%` },
    { label: 'HP', value: `+${Math.round(s.permanent.maxHp)}` },
    { label: 'SPEED', value: `+${Math.round(s.permanent.moveSpeed * 100)}%` },
  ];

  return (
    <View style={styles.menuRoot}>
      <LinearGradient colors={['#0D1B3A', '#08080F']} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={styles.menuScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="micro" color={palette.cyan} center>
          POCKETVERSE · FLAGSHIP
        </Text>
        <View style={styles.menuLogo}>
          <SpriteView
            sprite={spriteForGame('frontier', palette.cyan, 'PocketVerse Frontier')}
            size={92}
            label="PocketVerse Frontier"
          />
        </View>
        <Text variant="display" center>
          Frontier
        </Text>
        <Text variant="body" muted center>
          Explore. Fight. Survive.
        </Text>

        {hasRun ? (
          <Card variant="glass" padding={spacing.lg} style={styles.menuCard}>
            <View style={styles.statRow}>
              <StatCell label="BEST SCORE" value={String(s.bestScore)} tone={palette.gold} />
              <StatCell label="BEST TIME" value={fmtClock(s.bestTime)} tone={palette.cyan} />
              <StatCell label="BOSSES" value={String(s.bossesDefeated.length)} tone={palette.coral} />
            </View>
            <View style={styles.menuDivider} />
            <Text variant="micro" muted center>
              {s.runs} RUNS · {s.totalKills} KILLS{bossNames ? ` · ${bossNames}` : ''}
            </Text>
            <View style={styles.upgradeRow}>
              {upgrades.map((u) => (
                <View key={u.label} style={styles.upgradeChip}>
                  <Text variant="micro" color={palette.mint}>
                    {u.label} {u.value}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="micro" faint center style={{ marginTop: spacing.xs }}>
              Permanent — earned by defeating bosses
            </Text>
          </Card>
        ) : (
          <Card variant="glass" padding={spacing.lg} style={styles.menuCard}>
            <Text variant="caption" muted center>
              No run yet. The frontier is seeded fresh every time you step in —
              every run is a new world.
            </Text>
          </Card>
        )}

        <Pressable onPress={() => setShowHelp((v) => !v)} style={styles.helpToggle}>
          <Text variant="label" color={palette.cyan}>
            HOW TO PLAY {showHelp ? '▾' : '▸'}
          </Text>
        </Pressable>
        {showHelp ? (
          <Card variant="glass" padding={spacing.lg} style={styles.menuCard}>
            {HELP_ROWS.map(([k, v]) => (
              <View key={k} style={styles.helpRow}>
                <Text variant="label" style={{ width: 92 }}>
                  {k}
                </Text>
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {v}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Button
          label="Start run"
          icon="▶"
          size="lg"
          full
          shine
          onPress={onStart}
          style={{ marginTop: spacing.lg }}
        />
        <Text variant="caption" faint center style={{ marginTop: spacing.sm }}>
          One life per run · rewards land when you fall
        </Text>
      </ScrollView>
    </View>
  );
}

const HELP_ROWS: [string, string][] = [
  ['Move', 'Virtual stick — or WASD / arrow keys'],
  ['Sprint', 'Hold RUN — or Shift'],
  ['Dash', '💨 button — brief invulnerability'],
  ['Melee', '⚔️ button — or Space'],
  ['Nova', '💥 button — radial blast, cooldown'],
  ['Goal', 'Reach landmarks, beat the three bosses, survive'],
];

function StatCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text variant="micro" faint>
        {label}
      </Text>
      <Text variant="subheading" color={tone}>
        {value}
      </Text>
    </View>
  );
}

function fmtClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ================================================ dev renderer readout == */

/**
 * Development-only renderer diagnostic.
 *
 * Frontier is a 3D scene driven entirely from a ref — the React tree knows
 * nothing about whether the world is actually rendering. This strip reads the
 * live sim and the camera position the frame loop wrote, so a blank scene is
 * diagnosable at a glance (WORLD missing → the sim never mounted; CAMERA
 * frozen → the render loop is not running) instead of being a mystery.
 * Stripped from production builds by the `__DEV__` guard.
 */
function DevDiagnostics({
  world,
  cam,
}: {
  world: React.RefObject<World | null>;
  cam: React.RefObject<CamDiag>;
}) {
  const [d, setD] = useState({ t: 0, px: 0, pz: 0, cam: '0,0,0', enemies: 0, over: false });

  useEffect(() => {
    const id = setInterval(() => {
      const w = world.current;
      if (!w) return;
      setD({
        t: w.time,
        px: w.player.x,
        pz: w.player.z,
        cam: `${cam.current.x.toFixed(0)},${cam.current.y.toFixed(0)},${cam.current.z.toFixed(0)}`,
        enemies: w.enemies.reduce((n, e) => n + (e.active ? 1 : 0), 0),
        over: w.over,
      });
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fin = (v: number) => Number.isFinite(v);
  const playerOk = fin(d.px) && fin(d.pz);
  const camOk = d.cam !== '0,0,0' && !d.cam.includes('NaN');
  const worldOk = d.t >= 0 && !d.over;

  const chip = (label: string, ok: boolean, detail: string, color: string) => (
    <View
      key={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(8,8,15,0.72)',
        borderWidth: 1,
        borderColor: ok ? 'rgba(52,226,168,0.5)' : 'rgba(255,107,107,0.6)',
      }}
    >
      <Text variant="micro" color={ok ? palette.mint : palette.coral}>
        {label} {ok ? '✓' : '✗'}
      </Text>
      <Text variant="micro" color={color}>
        {detail}
      </Text>
    </View>
  );

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: spacing.huge + spacing.lg,
        left: spacing.lg,
        gap: 4,
        maxWidth: '62%',
      }}
    >
      {chip('WORLD', worldOk, `t=${d.t.toFixed(0)}s`, palette.textMuted)}
      {chip('PLAYER', playerOk, `${d.px.toFixed(1)},${d.pz.toFixed(1)}`, palette.textMuted)}
      {chip('CAMERA', camOk, d.cam, palette.textMuted)}
      {chip('ENTITIES', d.enemies >= 0, `${d.enemies} alive`, palette.textMuted)}
    </View>
  );
}

/* ============================================================== readouts == */

function emptyHud(): Hud {
  return {
    time: 0,
    hp: 0,
    maxHp: 1,
    level: 1,
    xp: 0,
    xpNeed: 10,
    stamina: 0,
    kills: 0,
    elites: 0,
    bosses: 0,
    landmarkCount: 0,
    biome: 'meadow',
    banner: null,
    choosing: false,
    choices: [],
    boss: null,
    abilityCd: 0,
    dashCd: 0,
    buffT: 0,
    objective: { name: '', dist: 0, x: 0, z: 0 },
    px: 0,
    pz: 0,
    event: { kind: 'none', x: 0, z: 0 },
    landmarks: [],
    over: false,
  };
}

function snapshot(w: World): Hud {
  const p = w.player;
  const obj = w.objective;
  const dist = Math.hypot(p.x - obj.x, p.z - obj.z);
  const b = w.boss;
  return {
    time: w.time,
    hp: Math.max(0, Math.round(p.hp)),
    maxHp: p.maxHp,
    level: p.level,
    xp: Math.round(p.xp),
    xpNeed: p.xpNeed,
    stamina: Math.round(p.stamina),
    kills: w.stats.kills,
    elites: w.stats.elites,
    bosses: w.stats.bosses,
    landmarkCount: w.stats.landmarks,
    biome: w.biome,
    banner: w.banner,
    choosing: w.choosing,
    choices: w.upgradeChoices,
    boss: b && b.active && !b.dead
      ? { name: BOSSES[b.id].name, accent: BOSSES[b.id].accent, hp: Math.max(0, Math.round(b.hp)), maxHp: b.maxHp, phase: b.phase }
      : null,
    abilityCd: Math.max(0, p.abilityCd),
    dashCd: Math.max(0, p.dashCd),
    buffT: Math.max(0, w.buffT),
    objective: { name: obj.name, dist: Math.round(dist), x: obj.x, z: obj.z },
    px: p.x,
    pz: p.z,
    event: { kind: w.event.kind, x: w.event.x, z: w.event.z },
    landmarks: w.landmarks.map((lm) => ({
      id: lm.id,
      x: lm.x,
      z: lm.z,
      discovered: lm.discovered,
      boss: lm.kind === 'boss',
      accent: lm.boss ? BOSSES[lm.boss].color : palette.mint,
    })),
    over: w.over,
  };
}

/* ---------------------------------------------------------------- parts -- */

function TopBar({ hud, paused, onPause }: { hud: Hud; paused: boolean; onPause: () => void }) {
  const biome = BIOMES[hud.biome];
  const eventLabel: Record<EventKind, string> = {
    none: '',
    swarm: 'SWARM ⚠',
    treasure: 'TREASURE ✦',
    healzone: 'HEAL ZONE ✚',
    meteor: 'METEORS ☄',
    elite: 'ELITE ⚠',
  };
  const rightLabel =
    hud.buffT > 0 ? `BUFF ${hud.buffT.toFixed(0)}s`
      : hud.event.kind !== 'none' ? eventLabel[hud.event.kind]
        : `★ ${hud.landmarkCount}`;
  return (
    <View style={styles.topRow}>
      <View style={styles.topLeft}>
        <Text variant="micro" color={biome.accent}>
          {biome.name.toUpperCase()}
        </Text>
        <Text variant="caption" muted>
          LV {hud.level} · {hud.kills} ☠
        </Text>
      </View>
      <View style={styles.topRight}>
        <Text variant="micro" color={hud.buffT > 0 ? palette.gold : palette.textMuted}>
          {rightLabel}
        </Text>
      </View>
      {!paused ? (
        <Pressable style={styles.pauseBtn} onPress={onPause}>
          <Text variant="micro" muted>
            ⏸
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Vitals({ hud }: { hud: Hud }) {
  const hpFrac = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  const xpFrac = hud.xpNeed > 0 ? hud.xp / hud.xpNeed : 0;
  const staminaFrac = hud.stamina / 100;
  return (
    <View style={styles.vitals}>
      <View style={styles.barWrap}>
        <View style={[styles.bar, { width: `${Math.min(100, hpFrac * 100)}%`, backgroundColor: hpFrac < 0.3 ? palette.coral : palette.mint }]} />
      </View>
      <View style={styles.vitalsSub}>
        <View style={[styles.xpWrap, { width: `${Math.min(100, xpFrac * 100)}%` }]} />
        <View style={[styles.staminaWrap, { width: `${Math.min(100, staminaFrac * 100)}%` }]} />
      </View>
    </View>
  );
}

function ObjectiveRow({ hud }: { hud: Hud }) {
  return (
    <View style={styles.objectiveRow} pointerEvents="none">
      <Text variant="micro" color={palette.gold}>
        ◈ {hud.objective.name.toUpperCase()}
      </Text>
      <Text variant="caption" muted>
        {hud.objective.dist}m
      </Text>
    </View>
  );
}

function BossBar({ hud }: { hud: NonNullable<Hud['boss']> }) {
  const frac = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
  return (
    <View style={styles.bossWrap}>
      <View style={styles.bossRow}>
        <Text variant="micro" color={hud.accent} numberOfLines={1} style={{ flex: 1 }}>
          {hud.name}
        </Text>
        <Text variant="micro" muted>
          PHASE {hud.phase}/3
        </Text>
      </View>
      <View style={styles.bossBar}>
        <View
          style={[
            styles.bossFill,
            { width: `${Math.min(100, frac * 100)}%`, backgroundColor: hud.accent },
          ]}
        />
      </View>
    </View>
  );
}

const MINIMAP = 88;
const WORLD_PX = 100; // HALF_W * 2

function Minimap({ hud }: { hud: Hud }) {
  const toMap = (x: number, z: number) => ({
    left: ((x + 50) / WORLD_PX) * MINIMAP,
    top: ((z + 50) / WORLD_PX) * MINIMAP,
  });
  const player = toMap(hud.px, hud.pz);
  const obj = toMap(hud.objective.x, hud.objective.z);
  const ev = hud.event.kind !== 'none' ? toMap(hud.event.x, hud.event.z) : null;
  return (
    <View pointerEvents="none" style={styles.minimap}>
      <View style={styles.minimapInner}>
        {/* event zone */}
        {ev ? <View style={[styles.mapEvent, { left: ev.left - 5, top: ev.top - 5 }]} /> : null}
        {/* landmarks */}
        {hud.landmarks.map((lm) => {
          const pos = toMap(lm.x, lm.z);
          return (
            <View
              key={lm.id}
              style={[
                lm.boss ? styles.mapBoss : styles.mapSight,
                {
                  left: pos.left - 2.5,
                  top: pos.top - 2.5,
                  backgroundColor: lm.discovered ? lm.accent : `${lm.accent}55`,
                },
              ]}
            />
          );
        })}
        {/* objective */}
        <View style={[styles.mapObjective, { left: obj.left - 3, top: obj.top - 3 }]} />
        {/* player */}
        <View style={[styles.mapPlayer, { left: player.left - 3.5, top: player.top - 3.5 }]} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ touch input -- */

function FrontierTouch({ input }: { input: React.RefObject<FrontierInput> }) {
  const stickGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart((e) => {
          input.current.mx = 0;
          input.current.mz = 0;
        })
        .onUpdate((e) => {
          const len = Math.hypot(e.translationX, e.translationY);
          const strength = Math.min(1, len / 54);
          if (len < 1) return;
          input.current.mx = (e.translationX / len) * strength;
          input.current.mz = (e.translationY / len) * strength;
        })
        .onFinalize(() => {
          input.current.mx = 0;
          input.current.mz = 0;
        }),
    [input],
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* movement zone — left 45% of the screen */}
      <GestureDetector gesture={stickGesture}>
        <View style={styles.stickZone} collapsable={false} />
      </GestureDetector>

      {/* action buttons — right side */}
      <View pointerEvents="box-none" style={styles.actions}>
        <View style={styles.actionRow}>
          <ActionButton
            label="RUN"
            small
            onPressIn={() => (input.current.sprint = true)}
            onPressOut={() => (input.current.sprint = false)}
          />
          <ActionButton label="💨" onPress={() => (input.current.dash = true)} hint="DASH" />
        </View>
        <View style={styles.actionRow}>
          <ActionButton label="💥" onPress={() => (input.current.ability = true)} hint="NOVA" />
          <ActionButton
            label="⚔️"
            big
            onPressIn={() => (input.current.melee = true)}
            onPressOut={() => (input.current.melee = false)}
            hint="MELEE"
          />
        </View>
      </View>
    </View>
  );
}

const ActionButton = React.memo(function ActionButton({
  label,
  big,
  small,
  hint,
  onPress,
  onPressIn,
  onPressOut,
}: {
  label: string;
  big?: boolean;
  small?: boolean;
  hint?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.actionBtn,
          big && styles.actionBtnBig,
          small && styles.actionBtnSmall,
          pressed && styles.actionBtnPressed,
        ]}
      >
        <Text size={big ? 24 : 18}>{label}</Text>
      </Pressable>
      {hint ? (
        <Text variant="micro" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------ ui ---- */

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#08080F' },
  menuRoot: { flex: 1, backgroundColor: '#08080F' },
  menuScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  menuLogo: { alignSelf: 'center', marginTop: spacing.md },
  menuCard: { width: '100%', marginTop: spacing.md, gap: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  menuDivider: { height: 1, backgroundColor: palette.hairline, marginVertical: spacing.xs },
  upgradeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, justifyContent: 'center' },
  upgradeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(52,226,168,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,226,168,0.35)',
  },
  helpToggle: { alignSelf: 'center', marginTop: spacing.md, padding: spacing.sm },
  helpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,15,0.96)',
    gap: spacing.xs,
  },
  errorCard: {
    margin: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, gap: spacing.sm },
  topLeft: { flex: 1, gap: 1 },
  topRight: { alignItems: 'flex-end', paddingTop: 2 },
  pauseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,15,0.6)',
    borderWidth: 1,
    borderColor: palette.hairline,
    marginLeft: spacing.xs,
  },
  vitals: { paddingHorizontal: spacing.md, gap: 3 },
  barWrap: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: radius.pill },
  vitalsSub: { flexDirection: 'row', gap: 3 },
  xpWrap: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.violet,
    maxWidth: '78%',
  },
  staminaWrap: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.sky,
    maxWidth: '20%',
  },
  objectiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bossWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 3 },
  bossRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bossBar: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bossFill: { height: '100%', borderRadius: radius.pill },
  bannerWrap: { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  bannerText: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  deathOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,4,8,0.45)',
  },
  minimap: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: MINIMAP + 8,
    height: MINIMAP + 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(8,8,15,0.72)',
    borderWidth: 1,
    borderColor: palette.hairline,
    padding: 4,
  },
  minimapInner: { flex: 1, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.03)', position: 'relative' },
  mapPlayer: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: '#fff',
  },
  mapObjective: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: palette.gold, transform: [{ rotate: '45deg' }] },
  mapBoss: { position: 'absolute', width: 5, height: 5, borderRadius: 1, transform: [{ rotate: '45deg' }] },
  mapSight: { position: 'absolute', width: 3, height: 3, borderRadius: 2 },
  mapEvent: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: palette.coral },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,6,12,0.78)',
    padding: spacing.lg,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  stickZone: { position: 'absolute', left: 0, bottom: 0, width: '48%', height: '62%' },
  actions: { position: 'absolute', right: spacing.lg, bottom: spacing.xxl, gap: spacing.md },
  actionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  actionBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,31,0.82)',
    borderWidth: 2,
    borderColor: palette.hairlineStrong,
  },
  actionBtnBig: { width: 72, height: 72, borderRadius: 36, borderColor: palette.mint },
  actionBtnSmall: { width: 46, height: 46, borderRadius: 23 },
  actionBtnPressed: { backgroundColor: 'rgba(124,92,255,0.35)', borderColor: palette.violet },
});
