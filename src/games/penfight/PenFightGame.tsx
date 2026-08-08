import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { createRng } from '@/core/utils/rng';
import { useInventoryStore } from '@/core/state/inventoryStore';
import {
  Button,
  Card,
  GameHud,
  PressableScale,
  Sheet,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  play,
} from '@/ui';

import { AI_PROFILES, DIFFICULTY_LABEL, chooseLaunch, thinkingTime } from './ai';
import {
  decideRound,
  MAX_DRAG_PX,
  MAX_TURNS_PER_ROUND,
  PEN_SKINS,
  RIVAL_SKIN,
  ROUNDS_TO_WIN,
  START_MARKS,
  TABLE,
  getPenSkin,
  normalizePenFightSave,
} from './content';
import { applyLaunch, clamp, makePen, resetPen } from './physics';
import { PenFightScene, type AimState, type PenWorld } from './scene/PenFightScene';
import type { Difficulty, Launch, PenSkinId, Seat, SideId, SimPhase } from './types';

/**
 * ============================================================================
 *  PEN FIGHT
 * ============================================================================
 *
 * The desk game: flick your pen into your rival's and knock it off the edge.
 * Best of three.
 *
 * Responsibilities are split hard down the middle. This file owns the *match* —
 * whose turn it is, what a drag means, when a round is over, what the run was
 * worth. `physics.ts` owns motion, `ai.ts` owns the rival, `scene/` owns pixels.
 * None of them can reach into the others.
 *
 * Turn taking is a seat table rather than an if-statement on "is it the AI".
 * A local 2-player match is two human seats; a tournament is a schedule that
 * hands different seats in. That is the whole extension point, and it is why
 * `SEATS` below is data.
 */

type Props = GameSurfaceProps & {
  /** Which side each chair belongs to. Today: you versus the machine. */
  seats?: Record<SideId, Seat>;
};

const DIFFICULTY_REWARD: Record<Difficulty, number> = { easy: 0.8, normal: 1, hard: 1.35 };
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** How much a misaligned pen twists when flicked — the whole spin mechanic. */
const SPIN_FROM_MISALIGNMENT = 0.6;
/** Drags shorter than this are treated as a tap, not a shot. */
const MIN_POWER = 0.06;

export function PenFightGame({
  onFinish,
  track,
  modifiers,
  paused,
  requestPause,
  save,
  setSave,
  seats,
}: Props) {
  const stored = useMemo(() => normalizePenFightSave(save), [save]);
  const unlocks = useInventoryStore((s) => s.unlocks);

  const [difficulty, setDifficulty] = useState<Difficulty>(stored.difficulty);
  const [penId, setPenId] = useState<PenSkinId>(stored.pen);
  const [showLoadout, setShowLoadout] = useState(false);

  const SEATS: Record<SideId, Seat> = useMemo(
    () => seats ?? { player: { kind: 'human' }, rival: { kind: 'ai', difficulty } },
    [seats, difficulty],
  );

  /* ------------------------------------------------------------- world */

  // `useConst`, not `useRef(makeWorld())`: the latter rebuilds the whole world
  // on every render and throws it away. Rare here, but the world is the one
  // object in this file that absolutely must be created exactly once.
  const world = useConst(makeWorld);
  const aim = useConst<AimState>(() => ({ active: false, dirX: 0, dirZ: -1, power: 0 }));
  const rng = useConst(() => createRng(Date.now() >>> 0));

  const [phase, setPhaseState] = useState<SimPhase>('aim');
  const [turn, setTurnState] = useState<SideId>('player');
  const [rounds, setRounds] = useState({ player: 0, rival: 0 });
  const [banner, setBanner] = useState<string | null>(null);

  // Mirrors for the gesture + frame callbacks, which run outside React's view
  // of the world and must not close over stale state.
  const phaseRef = useRef<SimPhase>('aim');
  const turnRef = useRef<SideId>('player');
  const turnsThisRound = useRef(0);
  const flicks = useRef(0);
  const knockouts = useRef(0);
  const fellThisRound = useRef<SideId[]>([]);
  /** True once a first-turn out has sent this round to a tiebreaker. */
  const tiebreak = useRef(false);
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setPhase = useCallback((next: SimPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const setTurn = useCallback((next: SideId) => {
    turnRef.current = next;
    setTurnState(next);
  }, []);

  /** Every timeout goes through here so leaving mid-match cannot fire later. */
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    play('game.start');
    return () => {
      for (const id of timers.current) clearTimeout(id);
      timers.current = [];
    };
  }, []);

  /**
   * Equipped cosmetics have to matter here too, or Pen Fight is a side room
   * rather than part of the same world. There are no drop tables to weight, so
   * each modifier maps onto the thing it obviously means on a desk:
   *
   *   armor → a heavier barrel, harder to shove
   *   speed → more carry off the same drag
   *   luck  → a rival having a slightly worse day
   */
  useEffect(() => {
    const pen = world.current.player;
    const mass = 1 + modifiers.armor * 0.12;
    pen.inertia *= mass / pen.mass;
    pen.mass = mass;
  }, [modifiers.armor]);

  const powerSV = useSharedValue(0);

  /* --------------------------------------------------------- match flow */

  const rack = useCallback((first: SideId) => {
    const w = world.current;
    resetPen(w.player, START_MARKS.player.x, START_MARKS.player.z, START_MARKS.player.angle);
    resetPen(w.rival, START_MARKS.rival.x, START_MARKS.rival.z, START_MARKS.rival.angle);
    w.accumulator.value = 0;
    w.running = false;
    fellThisRound.current = [];
    turnsThisRound.current = 0;
    aim.current.active = false;
    powerSV.value = 0;
    turnRef.current = first;
  }, [powerSV]);

  const endMatch = useCallback(
    (playerRounds: number, rivalRounds: number) => {
      if (finished.current) return;
      finished.current = true;
      aim.current.active = false;
      world.current.running = false;
      setPhase('matchEnd');

      const won = playerRounds > rivalRounds;
      const ko = knockouts.current;
      const mult = DIFFICULTY_REWARD[difficulty];
      const score = Math.round((playerRounds * 500 + ko * 120 + (won ? 800 : 0)) * mult);

      play(won ? 'reward.chest' : 'game.over');
      if (won) haptics.success();
      else haptics.fail();

      setSave((raw: unknown) => {
        const prev = normalizePenFightSave(raw);
        const streak = won ? prev.streak + 1 : 0;
        return {
          ...prev,
          pen: penId,
          difficulty,
          matches: prev.matches + 1,
          wins: prev.wins + (won ? 1 : 0),
          knockouts: prev.knockouts + ko,
          streak,
          bestStreak: Math.max(prev.bestStreak, streak),
        };
      });

      onFinish({
        score,
        outcome: won ? 'win' : 'lose',
        // `penfight_knockouts` is deliberately absent: it is tracked live during
        // the match so quests tick as pens go over, and `finishSession` folds
        // whatever is here into the same stream — listing it would double count.
        metrics: {
          penfight_matches: 1,
          penfight_wins: won ? 1 : 0,
          penfight_flicks: flicks.current,
        },
        reward: {
          coins: Math.round((won ? 420 : 140) * mult + ko * 60),
          xp: Math.round((won ? 90 : 35) * mult + ko * 12),
          items: won
            ? { mat_scrap: 2, ...(difficulty === 'hard' ? { mat_circuit: 1 } : {}) }
            : { mat_scrap: 1 },
        },
        breakdown: [
          { label: 'Rounds', value: `${playerRounds} – ${rivalRounds}` },
          { label: 'Knock-offs', value: `${ko}` },
          { label: 'Flicks', value: `${flicks.current}` },
          { label: 'Rival', value: DIFFICULTY_LABEL[difficulty] },
        ],
      });
    },
    [difficulty, onFinish, penId, setPhase, setSave],
  );

  /** The one place a pen is put in motion, for humans and AI alike. */
  const fire = useCallback(
    (side: SideId, launch: Launch) => {
      const w = world.current;
      const pen = side === 'player' ? w.player : w.rival;
      applyLaunch(pen, launch);
      w.running = true;
      turnsThisRound.current += 1;
      flicks.current += 1;
      aim.current.active = false;
      powerSV.value = 0;
      setPhase('resolving');
      haptics.press();
      play('game.jump');
    },
    [powerSV, setPhase],
  );

  /** Hand the turn to whoever is next, and let an AI seat take it. */
  const passTurn = useCallback(
    (next: SideId) => {
      setTurn(next);
      const seat = SEATS[next];

      if (seat.kind === 'human') {
        setPhase('aim');
        return;
      }

      setPhase('thinking');
      later(
        () => {
          const w = world.current;
          const self = next === 'player' ? w.player : w.rival;
          const target = next === 'player' ? w.rival : w.player;
          const launch = chooseLaunch(
            self,
            target,
            TABLE,
            seat.difficulty,
            rng.current,
            1 + modifiers.luck * 0.6,
          );
          fire(next, launch);
        },
        thinkingTime(seat.difficulty, rng.current) * 1000,
      );
    },
    [SEATS, fire, later, modifiers.luck, setPhase, setTurn],
  );

  // `onSettled` is handed to the render loop once and must not be rebuilt every
  // time a turn changes, so it reaches `passTurn` through a ref rather than a
  // dependency.
  const passTurnRef = useRef(passTurn);
  useEffect(() => {
    passTurnRef.current = passTurn;
  }, [passTurn]);

  const finishRound = useCallback(
    (loser: SideId | null) => {
      // Every completed round (win, draw, stalemate) starts the next one fresh.
      tiebreak.current = false;
      const winner: SideId | null = loser === null ? null : loser === 'player' ? 'rival' : 'player';

      const next = { ...rounds };
      if (winner) next[winner] += 1;
      setRounds(next);

      if (winner && next[winner] >= ROUNDS_TO_WIN) {
        setBanner(winner === 'player' ? 'Match won' : 'Match lost');
        later(() => endMatch(next.player, next.rival), 900);
        return;
      }

      setBanner(
        winner === null
          ? 'Stalemate — re-rack'
          : winner === 'player'
            ? 'Round won'
            : 'Round lost',
      );
      setPhase('roundEnd');

      later(() => {
        setBanner(null);
        // The side that lost the round flicks first in the next one.
        const first: SideId = loser ?? 'player';
        rack(first);
        passTurnRef.current(first);
      }, 1400);
    },
    [endMatch, later, rack, rounds, setPhase],
  );

  /* ------------------------------------------------- callbacks from the scene */

  const onImpact = useCallback((strength: number) => {
    haptics.tick();
    play('game.hit', { volume: clamp(strength / 8, 0.2, 1) });
  }, []);

  const onKnockOff = useCallback(
    (sides: SideId[]) => {
      for (const s of sides) {
        if (!fellThisRound.current.includes(s)) fellThisRound.current.push(s);
        if (s === 'rival') {
          knockouts.current += 1;
          // Live so daily quests tick the moment the pen goes over.
          track({ penfight_knockouts: 1 });
        }
      }
      haptics.heavy();
      play('game.crash');
    },
    [track],
  );

  const onSettled = useCallback(() => {
    if (finished.current) return;

    const decision = decideRound(fellThisRound.current, turnsThisRound.current, tiebreak.current);

    if (decision.kind === 'tiebreak') {
      // FIRST-TURN OUT — an immediate win is not allowed. Re-rack and let the
      // victim open the tiebreaker; the round is decided only when the
      // tiebreaker itself produces an out (or a draw).
      tiebreak.current = true;
      setBanner('FIRST-TURN OUT!\nImmediate wins are not allowed.\nPlay the tiebreaker.');
      setPhase('roundEnd');
      const first = decision.victim;
      later(() => {
        setBanner(null);
        rack(first);
        passTurnRef.current(first);
      }, 1700);
      return;
    }

    if (decision.kind === 'roundOver') {
      finishRound(decision.loser);
      return;
    }

    passTurnRef.current(turnRef.current === 'player' ? 'rival' : 'player');
  }, [finishRound, later, rack, setPhase]);

  /* ------------------------------------------------------------- controls */

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // Physics, aim state and the scene all live on the JS thread, so there
        // is nothing to gain from a worklet here — and plenty to lose.
        .runOnJS(true)
        .onStart(() => {
          if (phaseRef.current !== 'aim' || turnRef.current !== 'player') return;
          aim.current.active = true;
          aim.current.power = 0;
          powerSV.value = 0;
        })
        .onUpdate((e) => {
          if (!aim.current.active) return;
          // Slingshot: drag away from where you want the pen to go.
          const dx = -e.translationX;
          const dy = -e.translationY;
          const len = Math.hypot(dx, dy);
          if (len > 1) {
            // Screen right is world +x, screen down is world +z under this camera.
            aim.current.dirX = dx / len;
            aim.current.dirZ = dy / len;
          }
          const power = clamp(len / MAX_DRAG_PX, 0, 1);
          aim.current.power = power;
          powerSV.value = power;
        })
        .onEnd(() => {
          const a = aim.current;
          if (!a.active) return;
          a.active = false;
          if (a.power < MIN_POWER) {
            powerSV.value = 0;
            return;
          }
          const pen = world.current.player;
          // A pen flicked across its own axis twists — that is where spin
          // comes from, so where you leave your pen matters as much as aim.
          const cross = Math.cos(pen.angle) * a.dirZ - Math.sin(pen.angle) * a.dirX;
          fire('player', {
            dirX: a.dirX,
            dirZ: a.dirZ,
            // Equipped speed cosmetics give the same drag more carry.
            power: clamp(a.power * (1 + modifiers.speed * 0.25), 0, 1),
            spin: clamp(cross * SPIN_FROM_MISALIGNMENT, -1, 1),
          });
        })
        .onFinalize(() => {
          if (aim.current.active) {
            aim.current.active = false;
            powerSV.value = 0;
          }
        }),
    [fire, modifiers.speed, powerSV],
  );

  const resetRound = useCallback(() => {
    if (phaseRef.current !== 'aim') return;
    haptics.tap();
    tiebreak.current = false;
    rack('player');
    passTurnRef.current('player');
  }, [rack]);

  /* ------------------------------------------------------------ rendering */

  const powerStyle = useAnimatedStyle(() => ({ width: `${powerSV.value * 100}%` }));

  const playerSkin = useMemo(() => getPenSkin(penId), [penId]);
  const controlsLive = phase === 'aim' && turn === 'player';

  return (
    <View style={styles.root}>
      <PenFightScene
        world={world}
        aim={aim}
        playerSkin={playerSkin}
        rivalSkin={RIVAL_SKIN}
        accent={palette.sky}
        paused={paused}
        onImpact={onImpact}
        onKnockOff={onKnockOff}
        onSettled={onSettled}
      />

      {/* Touch layer sits above the canvas so the 3D view never steals a drag. */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      <GameHud
        onPause={requestPause}
        accent={palette.sky}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.sky}>
              {rounds.player} – {rounds.rival}   ·   BEST OF {ROUNDS_TO_WIN * 2 - 1}
            </Text>
            <Text variant="subheading" color={turn === 'player' ? palette.mint : palette.coral}>
              {phase === 'thinking'
                ? 'Rival is lining up…'
                : phase === 'resolving'
                  ? 'In play'
                  : turn === 'player'
                    ? 'Your flick'
                    : 'Rival'}
            </Text>
          </View>
        }
        right={
          <PressableScale
            onPress={() => controlsLive && setShowLoadout(true)}
            style={styles.hudBtn}
            scaleTo={0.9}
          >
            <Text size={14}>{playerSkin.glyph}</Text>
          </PressableScale>
        }
      />

      {banner ? (
        <View pointerEvents="none" style={styles.banner}>
          <Text variant="display" center color={palette.sky}>
            {banner.split('\n')[0]}
          </Text>
          {banner.split('\n').slice(1).map((line, i) => (
            <Text key={i} variant="subheading" center muted style={{ marginTop: 2 }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Power meter — driven by a shared value, so dragging never re-renders. */}
      <View pointerEvents="none" style={styles.powerWrap}>
        <View style={styles.powerTrack}>
          <Animated.View style={[styles.powerFill, powerStyle]} />
        </View>
        <Text variant="micro" muted center style={{ marginTop: 6 }}>
          {controlsLive
            ? 'DRAG BACK TO AIM · RELEASE TO FLICK'
            : phase === 'thinking'
              ? `${DIFFICULTY_LABEL[difficulty].toUpperCase()} RIVAL`
              : 'PENS IN MOTION'}
        </Text>
      </View>

      <View style={styles.leftControls}>
        <Button
          label="Re-rack"
          icon="↺"
          size="sm"
          variant="secondary"
          disabled={!controlsLive}
          onPress={resetRound}
        />
      </View>

      <LoadoutSheet
        visible={showLoadout}
        onClose={() => setShowLoadout(false)}
        penId={penId}
        difficulty={difficulty}
        unlocks={unlocks}
        onPickPen={(id) => {
          setPenId(id);
          setSave((raw: unknown) => ({ ...normalizePenFightSave(raw), pen: id }));
          haptics.select();
        }}
        onPickDifficulty={(d) => {
          setDifficulty(d);
          setSave((raw: unknown) => ({ ...normalizePenFightSave(raw), difficulty: d }));
          haptics.select();
        }}
        armorHint={modifiers.armor}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ world -- */

/** A ref whose value is built once, on first render, and never rebuilt. */
function useConst<T>(factory: () => T): { current: T } {
  const ref = useRef<T | undefined>(undefined);
  if (ref.current === undefined) ref.current = factory();
  return ref as { current: T };
}

function makeWorld(): PenWorld {
  const player = makePen(
    'player',
    START_MARKS.player.x,
    START_MARKS.player.z,
    START_MARKS.player.angle,
  );
  const rival = makePen('rival', START_MARKS.rival.x, START_MARKS.rival.z, START_MARKS.rival.angle);
  return { player, rival, list: [player, rival], accumulator: { value: 0 }, running: false };
}

/* ----------------------------------------------------------- loadout sheet -- */

const LoadoutSheet = React.memo(function LoadoutSheet({
  visible,
  onClose,
  penId,
  difficulty,
  unlocks,
  onPickPen,
  onPickDifficulty,
  armorHint,
}: {
  visible: boolean;
  onClose: () => void;
  penId: PenSkinId;
  difficulty: Difficulty;
  unlocks: Record<string, true>;
  onPickPen: (id: PenSkinId) => void;
  onPickDifficulty: (d: Difficulty) => void;
  armorHint: number;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Desk kit" subtitle="Your pen and your rival">
      <Text variant="micro" muted style={{ marginBottom: spacing.sm }}>
        PEN
      </Text>
      <View style={styles.penRow}>
        {PEN_SKINS.map((skin) => {
          const owned = skin.price === 0 || !!unlocks[skin.id];
          const active = skin.id === penId;
          return (
            <PressableScale
              key={skin.id}
              onPress={() => owned && onPickPen(skin.id)}
              disabled={!owned}
              scaleTo={0.96}
              style={[
                styles.penTile,
                active ? { borderColor: palette.sky, backgroundColor: 'rgba(78,168,255,0.12)' } : null,
                !owned ? { opacity: 0.4 } : null,
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: skin.body }]} />
              <Text variant="caption" center numberOfLines={1}>
                {skin.name}
              </Text>
              <Text variant="micro" muted center>
                {owned ? (active ? 'EQUIPPED' : 'TAP') : 'IN STORE'}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <Text variant="micro" muted style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        RIVAL
      </Text>
      <View style={styles.diffRow}>
        {DIFFICULTIES.map((d) => {
          const active = d === difficulty;
          return (
            <PressableScale
              key={d}
              onPress={() => onPickDifficulty(d)}
              scaleTo={0.96}
              style={[
                styles.diffTile,
                active ? { borderColor: palette.sky, backgroundColor: 'rgba(78,168,255,0.12)' } : null,
              ]}
            >
              <Text variant="subheading" center>
                {DIFFICULTY_LABEL[d]}
              </Text>
              <Text variant="micro" muted center>
                ±{Math.round(AI_PROFILES[d].aimError * 100) / 100} RAD
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <Card variant="glass" style={{ marginTop: spacing.lg }} padding={spacing.md}>
        <Text variant="caption" muted>
          The rival aims with the same physics you do — difficulty only changes how
          badly it misses. A harder desk pays more coins and XP.
          {armorHint > 0 ? ' Your equipped armour does nothing here; pens do not bleed.' : ''}
        </Text>
        <View style={styles.ruleLine}>
          <Text variant="micro" color={palette.gold}>
            HOUSE RULE
          </Text>
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            Knock the rival out on your very first flick of a round and the win is
            refused — the round re-racks into a tiebreaker instead.
          </Text>
        </View>
      </Card>

      <Button label="Back to the desk" onPress={onClose} full style={{ marginTop: spacing.lg }} />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0A0713' },
  hudCentre: { alignItems: 'center', gap: 2 },
  hudBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,23,0.72)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    alignItems: 'center',
  },
  powerWrap: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.huge },
  powerTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  powerFill: { height: '100%', backgroundColor: palette.sky },
  leftControls: { position: 'absolute', left: spacing.lg, bottom: spacing.lg },
  penRow: { flexDirection: 'row', gap: spacing.sm },
  penTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  diffRow: { flexDirection: 'row', gap: spacing.sm },
  diffTile: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.hairline,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ruleLine: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
});
