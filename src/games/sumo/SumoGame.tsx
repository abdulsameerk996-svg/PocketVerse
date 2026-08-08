import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { GameSurfaceProps } from '@/core/registry';
import {
  Arena,
  Character,
  DuelHud,
  HAS_KEYBOARD,
  P1_COLOR,
  P2_COLOR,
  Sparks,
  Stage,
  TouchSticks,
  clampSpeed,
  collide,
  makeBody,
  radiusFromCentre,
  stepWorld,
  useDuelInput,
  useMatch,
  type Body,
  type DuelAxes,
  type SparksHandle,
} from '@/core/game3d';
import { haptics, palette, play } from '@/ui';

/**
 * ============================================================================
 *  SUMO PUSH
 * ============================================================================
 *
 * Two wrestlers, one circular ring, best of three. Push the other one out.
 *
 * Unlike Air Hockey's kinematic paddles, both bodies here are *dynamic*: input
 * applies acceleration rather than setting position, so momentum, drift and
 * over-commitment are the whole game. Charging is genuinely risky, which is
 * what makes the ring edge tense rather than incidental.
 *
 * The dash (Space / Enter, or the on-screen button) is a short burst with a
 * cooldown — the one "skill" verb, kept to one so both players learn it in a
 * round.
 */

const RING_R = 3.9;
const BODY_R = 0.52;
const ACCEL = 26;
const MAX_SPEED = 7.2;
const DASH_IMPULSE = 9.5;
const DASH_COOLDOWN = 1.1;
const TARGET = 2; // best of 3

type Fighter = Body & { dashCooldown: number; outAt: number };

type World = {
  a: Fighter;
  b: Fighter;
  acc: { value: number };
  live: boolean;
};

function makeFighter(x: number, z: number): Fighter {
  return { ...makeBody(x, z, BODY_R, 1, 2.4), dashCooldown: 0, outAt: 0 };
}

function makeWorld(): World {
  return {
    a: makeFighter(0, RING_R * 0.5),
    b: makeFighter(0, -RING_R * 0.5),
    acc: { value: 0 },
    live: false,
  };
}

export default function SumoGame({ onFinish, paused, requestPause }: GameSurfaceProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const finished = useRef(false);

  const serve = useCallback(() => {
    const w = world.current;
    Object.assign(w.a, makeFighter(0, RING_R * 0.5));
    Object.assign(w.b, makeFighter(0, -RING_R * 0.5));
    w.live = true;
  }, []);

  const handleOver = useCallback(
    (winner: 'p1' | 'p2', score: Record<'p1' | 'p2', number>) => {
      if (finished.current) return;
      finished.current = true;
      world.current.live = false;
      play(winner === 'p1' ? 'reward.chest' : 'game.over');
      onFinish({
        score: score.p1 * 260 + (winner === 'p1' ? 480 : 0),
        outcome: winner === 'p1' ? 'win' : 'lose',
        metrics: {
          versus_matches: 1,
          versus_wins: winner === 'p1' ? 1 : 0,
          versus_rounds: score.p1 + score.p2,
        },
        reward: { coins: 200 + score.p1 * 60, xp: 50 + score.p1 * 14, items: { mat_scrap: 1 } },
        breakdown: [
          { label: 'Rounds', value: `${score.p1} – ${score.p2}` },
          { label: 'Winner', value: winner === 'p1' ? 'Player 1' : 'Player 2' },
        ],
      });
    },
    [onFinish],
  );

  const match = useMatch({ target: TARGET, countdown: 3, onOver: handleOver, onServe: serve });
  const matchRef = useRef(match);
  matchRef.current = match;

  const dash = useCallback((who: 'a' | 'b') => {
    const w = world.current;
    const f = w[who];
    if (!w.live || f.dashCooldown > 0) return;
    const other = who === 'a' ? w.b : w.a;
    const dx = other.x - f.x;
    const dz = other.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    f.vx += (dx / d) * DASH_IMPULSE;
    f.vz += (dz / d) * DASH_IMPULSE;
    f.dashCooldown = DASH_COOLDOWN;
    haptics.press();
    play('game.jump');
  }, []);

  const actions = useRef({ p1: () => dash('a'), p2: () => dash('b') }).current;
  const { axes } = useDuelInput(!paused, actions);


  return (
    <View style={styles.root}>
      <Stage
        fit={{ halfWidth: RING_R, halfDepth: RING_R, height: 2.2, margin: 0.9 }}
        cameraDir={[0, 12, 11]}
        fov={54}
        background="#150B12"
        paused={paused}
      >
        <Arena
          halfWidth={RING_R}
          halfDepth={RING_R}
          shape="circle"
          accent={palette.amber}
          surface="#2A1B18"
        />
        <Ring world={world} axes={axes} matchRef={matchRef} sparks={sparks} />
        <Sparks handle={sparks} count={90} />
      </Stage>

      <DuelHud
        phase={match.phase}
        score={match.score}
        count={match.count}
        winner={match.winner}
        lastScorer={match.lastScorer}
        target={TARGET}
        rule="Best of 3"
        onPause={requestPause}
        summary={HAS_KEYBOARD ? 'Space / Enter to charge' : undefined}
      />

      <TouchSticks
        axes={axes}
        split="vertical"
        visible={!HAS_KEYBOARD && match.phase !== 'over'}
        onActionP1={actions.p1}
        onActionP2={actions.p2}
        actionLabel="DASH"
      />
    </View>
  );
}

function Ring({
  world,
  axes,
  matchRef,
  sparks,
}: {
  world: React.RefObject<World>;
  axes: { current: DuelAxes };
  matchRef: React.RefObject<ReturnType<typeof useMatch>>;
  sparks: React.RefObject<SparksHandle | null>;
}) {
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);

  useFrame((_s, delta) => {
    const w = world.current;
    const m = matchRef.current;
    if (!w || !m) return;
    const live = m.phase === 'playing' && w.live;

    stepWorld(delta, w.acc, (h) => {
      for (const [f, axis] of [
        [w.a, axes.current.p1],
        [w.b, axes.current.p2],
      ] as const) {
        if (f.dashCooldown > 0) f.dashCooldown -= h;

        if (live && f.outAt === 0) {
          // Acceleration, not teleportation — momentum is the game.
          f.vx += axis.x * ACCEL * h;
          f.vz += axis.z * ACCEL * h;
        }
        clampSpeed(f, MAX_SPEED + DASH_IMPULSE);

        f.x += f.vx * h;
        f.z += f.vz * h;
        const drag = Math.exp(-f.damping * h);
        f.vx *= drag;
        f.vz *= drag;

        // Off the edge: fall, then the round is decided.
        if (f.outAt === 0 && radiusFromCentre(f) > RING_R - BODY_R * 0.4) {
          f.outAt = 1;
          sparks.current?.burst(f.x, 0.6, f.z, palette.amber, 22, 5);
          haptics.heavy();
          play('game.crash');
        }
        if (f.outAt > 0) f.outAt += h;
      }

      if (live) {
        const hit = collide(w.a, w.b, 1.05);
        if (hit.happened && hit.impulse > 1.2) {
          sparks.current?.burst(
            (w.a.x + w.b.x) / 2,
            0.7,
            (w.a.z + w.b.z) / 2,
            '#FFD166',
            Math.min(16, 4 + hit.impulse * 1.5),
            3.4,
          );
          haptics.tick();
          play('game.hit', { volume: Math.min(1, hit.impulse / 8) });
        }

        // Resolve the round once whoever fell has visibly dropped.
        const aOut = w.a.outAt > 0.35;
        const bOut = w.b.outAt > 0.35;
        if (aOut || bOut) {
          w.live = false;
          // Both out in one shove: whoever left first loses.
          if (aOut && bOut) m.awardPoint(w.a.outAt > w.b.outAt ? 'p2' : 'p1');
          else m.awardPoint(aOut ? 'p2' : 'p1');
        }
      }
    });

    place(aRef.current, w.a);
    place(bRef.current, w.b);
  });

  return (
    <>
      <Character
        groupRef={aRef}
        style={{ body: P1_COLOR, accent: '#CFE9FF', shape: 'round' }}
        radius={BODY_R}
        phase={0}
      />
      <Character
        groupRef={bRef}
        style={{ body: P2_COLOR, accent: '#FFD9D9', shape: 'block' }}
        radius={BODY_R}
        phase={1.6}
      />
    </>
  );
}

/** Position a fighter, and let a knocked-out one tumble off the edge. */
function place(group: THREE.Group | null, f: Fighter) {
  if (!group) return;
  const fallen = f.outAt > 0 ? f.outAt : 0;
  group.position.set(f.x, -fallen * fallen * 9, f.z);
  group.rotation.z = -f.vx * 0.06 + fallen * 2.2;
  group.rotation.x = f.vz * 0.06;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#150B12' },
});
