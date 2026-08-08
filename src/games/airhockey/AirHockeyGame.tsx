import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { GameSurfaceProps } from '@/core/registry';
import {
  Arena,
  DuelHud,
  HAS_KEYBOARD,
  P1_COLOR,
  P2_COLOR,
  Sparks,
  Stage,
  TouchSticks,
  clamp,
  clampSpeed,
  collide,
  makeBody,
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
 *  AIR HOCKEY
 * ============================================================================
 *
 * The purest test of the framework: two driven paddles, one free puck, four
 * walls and two goal mouths.
 *
 * The one thing arcade air hockey has to get right is that a paddle is not a
 * physics body being pushed around — it is a *kinematic* object the player
 * drives directly, which then imparts its velocity to the puck. Simulating the
 * paddle as a normal rigid body makes the controls feel like steering a boat.
 * So paddles are moved by input and their measured velocity feeds the impulse.
 */

const HALF_W = 3.0;
const HALF_D = 4.6;
const PUCK_R = 0.26;
const PADDLE_R = 0.46;
const GOAL_HALF = 1.15;

const PADDLE_SPEED = 9.5;
const PUCK_MAX = 22;
const TARGET = 5;

type World = {
  puck: Body;
  p1: Body;
  p2: Body;
  /** Paddle velocity measured between frames — what makes a hit feel struck. */
  p1v: { x: number; z: number };
  p2v: { x: number; z: number };
  acc: { value: number };
  live: boolean;
};

function makeWorld(): World {
  const puck = makeBody(0, 0, PUCK_R, 0.5, 0.45);
  const p1 = makeBody(0, HALF_D * 0.62, PADDLE_R, 6, 0);
  const p2 = makeBody(0, -HALF_D * 0.62, PADDLE_R, 6, 0);
  return { puck, p1, p2, p1v: { x: 0, z: 0 }, p2v: { x: 0, z: 0 }, acc: { value: 0 }, live: false };
}

export default function AirHockeyGame({ onFinish, paused, requestPause }: GameSurfaceProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const finished = useRef(false);

  const serve = useCallback(() => {
    const w = world.current;
    w.puck.x = 0;
    w.puck.z = 0;
    w.puck.vx = 0;
    w.puck.vz = 0;
    w.p1.x = 0;
    w.p1.z = HALF_D * 0.62;
    w.p2.x = 0;
    w.p2.z = -HALF_D * 0.62;
    w.live = true;
  }, []);

  const handleOver = useCallback(
    (winner: 'p1' | 'p2', score: Record<'p1' | 'p2', number>) => {
      if (finished.current) return;
      finished.current = true;
      world.current.live = false;
      play(winner === 'p1' ? 'reward.chest' : 'game.over');
      onFinish({
        score: score.p1 * 120 + (winner === 'p1' ? 500 : 0),
        outcome: winner === 'p1' ? 'win' : 'lose',
        metrics: { versus_matches: 1, versus_wins: winner === 'p1' ? 1 : 0 },
        reward: {
          coins: 220 + score.p1 * 45,
          xp: 55 + score.p1 * 10,
          items: { mat_scrap: 1 },
        },
        breakdown: [
          { label: 'Final score', value: `${score.p1} – ${score.p2}` },
          { label: 'Winner', value: winner === 'p1' ? 'Player 1' : 'Player 2' },
        ],
      });
    },
    [onFinish],
  );

  const match = useMatch({ target: TARGET, countdown: 3, onOver: handleOver, onServe: serve });
  const { axes } = useDuelInput(!paused);

  // The loop must not restart when React re-renders the HUD.
  const matchRef = useRef(match);
  matchRef.current = match;


  return (
    <View style={styles.root}>
      <Stage
        fit={{ halfWidth: HALF_W, halfDepth: HALF_D, height: 1.2, margin: 0.94 }}
        cameraDir={[0, 13, 9]}
        fov={52}
        background="#070B16"
        paused={paused}
      >
        <Arena
          halfWidth={HALF_W}
          halfDepth={HALF_D}
          accent={palette.cyan}
          surface="#101B2E"
          centreLine
        />
        <Goals />
        <Rink world={world} axes={axes} matchRef={matchRef} sparks={sparks} />
        <Sparks handle={sparks} count={80} />
      </Stage>

      <DuelHud
        phase={match.phase}
        score={match.score}
        count={match.count}
        winner={match.winner}
        lastScorer={match.lastScorer}
        target={TARGET}
        rule={`First to ${TARGET}`}
        onPause={requestPause}
      />

      <TouchSticks
        axes={axes}
        split="vertical"
        visible={!HAS_KEYBOARD && match.phase !== 'over'}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ scene -- */

function Goals() {
  return (
    <>
      {[
        { z: -HALF_D + 0.06, color: P2_COLOR },
        { z: HALF_D - 0.06, color: P1_COLOR },
      ].map(({ z, color }) => (
        <mesh key={z} position={[0, 0.14, z]}>
          <boxGeometry args={[GOAL_HALF * 2, 0.26, 0.14]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

function Rink({
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
  const puckRef = useRef<THREE.Group>(null);
  const p1Ref = useRef<THREE.Group>(null);
  const p2Ref = useRef<THREE.Group>(null);

  useFrame((_s, delta) => {
    const w = world.current;
    const m = matchRef.current;
    if (!w || !m) return;

    const live = m.phase === 'playing' && w.live;

    stepWorld(delta, w.acc, (h) => {
      /* ---- paddles: kinematic, driven straight from input ---- */
      drivePaddle(w.p1, w.p1v, axes.current.p1, h, 0, HALF_D);
      drivePaddle(w.p2, w.p2v, axes.current.p2, h, -HALF_D, 0);

      if (!live) return;

      /* ---- puck ---- */
      w.puck.x += w.puck.vx * h;
      w.puck.z += w.puck.vz * h;
      const drag = Math.exp(-w.puck.damping * h);
      w.puck.vx *= drag;
      w.puck.vz *= drag;

      // Side walls always bounce.
      if (w.puck.x - PUCK_R < -HALF_W) {
        w.puck.x = -HALF_W + PUCK_R;
        w.puck.vx = Math.abs(w.puck.vx) * 0.94;
        onWall(sparks, w.puck.x, w.puck.z);
      } else if (w.puck.x + PUCK_R > HALF_W) {
        w.puck.x = HALF_W - PUCK_R;
        w.puck.vx = -Math.abs(w.puck.vx) * 0.94;
        onWall(sparks, w.puck.x, w.puck.z);
      }

      // End walls bounce except across the goal mouth.
      const inMouth = Math.abs(w.puck.x) < GOAL_HALF;
      if (w.puck.z - PUCK_R < -HALF_D) {
        if (inMouth) {
          w.live = false;
          sparks.current?.burst(w.puck.x, 0.3, -HALF_D, P1_COLOR, 28, 6);
          haptics.success();
          play('reward.coin');
          m.awardPoint('p1');
          return;
        }
        w.puck.z = -HALF_D + PUCK_R;
        w.puck.vz = Math.abs(w.puck.vz) * 0.94;
        onWall(sparks, w.puck.x, w.puck.z);
      } else if (w.puck.z + PUCK_R > HALF_D) {
        if (inMouth) {
          w.live = false;
          sparks.current?.burst(w.puck.x, 0.3, HALF_D, P2_COLOR, 28, 6);
          haptics.heavy();
          play('reward.coin');
          m.awardPoint('p2');
          return;
        }
        w.puck.z = HALF_D - PUCK_R;
        w.puck.vz = -Math.abs(w.puck.vz) * 0.94;
        onWall(sparks, w.puck.x, w.puck.z);
      }

      /* ---- paddle strikes ---- */
      strike(w.puck, w.p1, w.p1v, sparks, P1_COLOR);
      strike(w.puck, w.p2, w.p2v, sparks, P2_COLOR);

      clampSpeed(w.puck, PUCK_MAX);
    });

    /* ---- present ---- */
    if (puckRef.current) puckRef.current.position.set(w.puck.x, PUCK_R * 0.5, w.puck.z);
    if (p1Ref.current) p1Ref.current.position.set(w.p1.x, 0, w.p1.z);
    if (p2Ref.current) p2Ref.current.position.set(w.p2.x, 0, w.p2.z);
  });

  return (
    <>
      <group ref={puckRef}>
        <mesh castShadow>
          <cylinderGeometry args={[PUCK_R, PUCK_R, 0.16, 24]} />
          <meshStandardMaterial color="#F2F5FF" roughness={0.3} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[PUCK_R * 0.55, PUCK_R * 0.55, 0.02, 20]} />
          <meshStandardMaterial
            color={palette.cyan}
            emissive={palette.cyan}
            emissiveIntensity={1}
            toneMapped={false}
          />
        </mesh>
      </group>
      <Paddle groupRef={p1Ref} color={P1_COLOR} />
      <Paddle groupRef={p2Ref} color={P2_COLOR} />
    </>
  );
}

function Paddle({ groupRef, color }: { groupRef: React.RefObject<THREE.Group | null>; color: string }) {
  return (
    <group ref={groupRef}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[PADDLE_R, PADDLE_R * 0.92, 0.24, 28]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[PADDLE_R * 0.55, PADDLE_R * 0.62, 0.1, 24]} />
        <meshStandardMaterial color="#0E1424" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PADDLE_R * 1.05, PADDLE_R * 1.25, 28]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ rules -- */

/** Move a paddle from input and record the velocity it actually achieved. */
function drivePaddle(
  b: Body,
  vel: { x: number; z: number },
  axis: { x: number; z: number },
  h: number,
  minZ: number,
  maxZ: number,
) {
  const prevX = b.x;
  const prevZ = b.z;
  b.x = clamp(b.x + axis.x * PADDLE_SPEED * h, -HALF_W + PADDLE_R, HALF_W - PADDLE_R);
  b.z = clamp(b.z + axis.z * PADDLE_SPEED * h, minZ + PADDLE_R, maxZ - PADDLE_R);
  vel.x = (b.x - prevX) / h;
  vel.z = (b.z - prevZ) / h;
  b.vx = vel.x;
  b.vz = vel.z;
}

/**
 * Puck-vs-paddle. The paddle is infinitely heavy for the impulse, then its own
 * motion is added on top — that second term is the difference between a puck
 * that bounces off and one that gets *hit*.
 */
function strike(
  puck: Body,
  paddle: Body,
  vel: { x: number; z: number },
  sparks: React.RefObject<SparksHandle | null>,
  color: string,
) {
  const before = Math.hypot(puck.vx, puck.vz);
  const hit = collide(puck, { ...paddle, mass: 1e6 } as Body, 0.96);
  if (!hit.happened) return;

  // Re-separate the puck: `collide` moved a throwaway copy of the paddle.
  const dx = puck.x - paddle.x;
  const dz = puck.z - paddle.z;
  const d = Math.hypot(dx, dz) || 1;
  const min = puck.radius + paddle.radius;
  if (d < min) {
    puck.x = paddle.x + (dx / d) * min;
    puck.z = paddle.z + (dz / d) * min;
  }

  puck.vx += vel.x * 0.55;
  puck.vz += vel.z * 0.55;

  const after = Math.hypot(puck.vx, puck.vz);
  if (after > before + 1.5 || hit.impulse > 1) {
    sparks.current?.burst(puck.x, 0.25, puck.z, color, 8, 3);
    haptics.tick();
    play('game.hit', { volume: Math.min(1, after / PUCK_MAX + 0.2) });
  }
}

let lastWall = 0;
function onWall(sparks: React.RefObject<SparksHandle | null>, x: number, z: number) {
  const now = Date.now();
  // Rate-limit: a puck grinding along a wall would otherwise machine-gun both
  // the particle pool and the haptics.
  if (now - lastWall < 90) return;
  lastWall = now;
  sparks.current?.burst(x, 0.2, z, '#8FA6FF', 4, 2);
  play('game.hit', { volume: 0.35 });
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#070B16' },
});
