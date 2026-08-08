import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  clamp,
  makeBody,
  stepWorld,
  useDuelInput,
  useMatch,
  type Body,
  type DuelAxes,
  type SparksHandle,
} from '@/core/game3d';
import { Text, haptics, palette, play } from '@/ui';

/**
 * ============================================================================
 *  DODGE DUEL
 * ============================================================================
 *
 * Both players share one arena while it rains hazards. Last one standing takes
 * the round; first to three takes the match.
 *
 * The difficulty curve is the design: spawn interval and fall speed both ramp
 * with round time, so a round always resolves — a stalemate between two good
 * players is impossible rather than merely unlikely.
 *
 * Two hazard types keep it from being one read: rocks fall straight and fast,
 * bombs fall slowly and burst into a short-lived danger ring, so safe ground
 * keeps moving.
 */

const HALF_W = 3.6;
const HALF_D = 4.2;
const BODY_R = 0.38;
const ACCEL = 46;
const MAX_SPEED = 7;
const POOL = 34;
const TARGET = 3;

type Hazard = {
  active: boolean;
  kind: 0 | 1; // 0 rock, 1 bomb
  x: number;
  y: number;
  z: number;
  vy: number;
  r: number;
  /** Blast ring lifetime after a bomb lands. */
  blast: number;
};

type Player = Body & { alive: boolean; deadFor: number };

type World = {
  a: Player;
  b: Player;
  hazards: Hazard[];
  spawn: number;
  elapsed: number;
  acc: { value: number };
  live: boolean;
};

const makePlayer = (x: number, z: number): Player => ({
  ...makeBody(x, z, BODY_R, 1, 6),
  alive: true,
  deadFor: 0,
});

function makeWorld(): World {
  return {
    a: makePlayer(-HALF_W * 0.5, HALF_D * 0.4),
    b: makePlayer(HALF_W * 0.5, -HALF_D * 0.4),
    hazards: Array.from({ length: POOL }, () => ({
      active: false, kind: 0 as 0 | 1, x: 0, y: -99, z: 0, vy: 0, r: 0.3, blast: 0,
    })),
    spawn: 0.8,
    elapsed: 0,
    acc: { value: 0 },
    live: false,
  };
}

export default function DodgeDuelGame({ onFinish, paused, requestPause }: GameSurfaceProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const finished = useRef(false);
  const [survived, setSurvived] = useState(0);

  const serve = useCallback(() => {
    const w = world.current;
    Object.assign(w.a, makePlayer(-HALF_W * 0.5, HALF_D * 0.4));
    Object.assign(w.b, makePlayer(HALF_W * 0.5, -HALF_D * 0.4));
    for (const h of w.hazards) h.active = false;
    w.spawn = 0.8;
    w.elapsed = 0;
    w.live = true;
  }, []);

  const handleOver = useCallback(
    (winner: 'p1' | 'p2', score: Record<'p1' | 'p2', number>) => {
      if (finished.current) return;
      finished.current = true;
      world.current.live = false;
      play(winner === 'p1' ? 'reward.chest' : 'game.over');
      onFinish({
        score: score.p1 * 240 + (winner === 'p1' ? 400 : 0),
        outcome: winner === 'p1' ? 'win' : 'lose',
        metrics: {
          versus_matches: 1,
          versus_wins: winner === 'p1' ? 1 : 0,
          versus_rounds: score.p1 + score.p2,
        },
        reward: { coins: 190 + score.p1 * 55, xp: 48 + score.p1 * 12, items: { mat_scrap: 1 } },
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

  const { axes } = useDuelInput(!paused);


  return (
    <View style={styles.root}>
      <Stage
        fit={{ halfWidth: HALF_W, halfDepth: HALF_D, height: 2.6, margin: 0.9 }}
        cameraDir={[0, 12, 10]}
        fov={54}
        background="#0A1016"
        paused={paused}
      >
        <Arena halfWidth={HALF_W} halfDepth={HALF_D} accent={palette.mint} surface="#12202A" />
        <Storm world={world} axes={axes} matchRef={matchRef} sparks={sparks} onTime={setSurvived} />
        <Sparks handle={sparks} count={90} />
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
        centre={
          <Text variant="caption" muted numeric>
            {survived.toFixed(1)}s
          </Text>
        }
      />

      <TouchSticks axes={axes} split="vertical" visible={!HAS_KEYBOARD && match.phase !== 'over'} />
    </View>
  );
}

function Storm({
  world,
  axes,
  matchRef,
  sparks,
  onTime,
}: {
  world: React.RefObject<World>;
  axes: { current: DuelAxes };
  matchRef: React.RefObject<ReturnType<typeof useMatch>>;
  sparks: React.RefObject<SparksHandle | null>;
  onTime: (t: number) => void;
}) {
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastReport = useRef(0);

  useFrame((state, delta) => {
    const w = world.current;
    const m = matchRef.current;
    if (!w || !m) return;
    const live = m.phase === 'playing' && w.live;

    stepWorld(delta, w.acc, (h) => {
      if (live) w.elapsed += h;

      /* ---- players ---- */
      for (const [p, axis] of [
        [w.a, axes.current.p1],
        [w.b, axes.current.p2],
      ] as const) {
        if (!p.alive) {
          p.deadFor += h;
          continue;
        }
        if (live) {
          p.vx += axis.x * ACCEL * h;
          p.vz += axis.z * ACCEL * h;
        }
        const s = Math.hypot(p.vx, p.vz);
        if (s > MAX_SPEED) {
          p.vx = (p.vx / s) * MAX_SPEED;
          p.vz = (p.vz / s) * MAX_SPEED;
        }
        p.x = clamp(p.x + p.vx * h, -HALF_W + BODY_R, HALF_W - BODY_R);
        p.z = clamp(p.z + p.vz * h, -HALF_D + BODY_R, HALF_D - BODY_R);
        const drag = Math.exp(-p.damping * h);
        p.vx *= drag;
        p.vz *= drag;
      }

      if (!live) return;

      /* ---- spawning: ramps so a round always resolves ---- */
      w.spawn -= h;
      if (w.spawn <= 0) {
        w.spawn = Math.max(0.16, 0.78 - w.elapsed * 0.03);
        const hz = w.hazards.find((x) => !x.active);
        if (hz) {
          const bomb = Math.random() < 0.28;
          hz.active = true;
          hz.kind = bomb ? 1 : 0;
          hz.r = bomb ? 0.42 : 0.24 + Math.random() * 0.2;
          hz.x = (Math.random() - 0.5) * (HALF_W * 2 - hz.r * 2);
          hz.z = (Math.random() - 0.5) * (HALF_D * 2 - hz.r * 2);
          hz.y = 10;
          hz.vy = -(bomb ? 4.2 : 7 + Math.random() * 3 + w.elapsed * 0.3);
          hz.blast = 0;
        }
      }

      /* ---- hazards ---- */
      for (const hz of w.hazards) {
        if (!hz.active) continue;

        if (hz.blast > 0) {
          hz.blast -= h;
          if (hz.blast <= 0) hz.active = false;
          else hurtInRadius(w, hz.x, hz.z, hz.r * 3.1, sparks, m);
          continue;
        }

        hz.y += hz.vy * h;
        if (hz.y <= hz.r) {
          if (hz.kind === 1) {
            hz.blast = 0.42;
            hz.y = hz.r;
            sparks.current?.burst(hz.x, 0.3, hz.z, '#FFB443', 20, 5);
            play('game.crash', { volume: 0.5 });
          } else {
            hz.active = false;
            sparks.current?.burst(hz.x, hz.r, hz.z, '#8FA6FF', 5, 2);
          }
          continue;
        }

        if (hz.y < 1.4) hurtInRadius(w, hz.x, hz.z, hz.r + BODY_R, sparks, m);
      }

      /* ---- round resolution ---- */
      const aOut = !w.a.alive;
      const bOut = !w.b.alive;
      if (aOut || bOut) {
        w.live = false;
        if (aOut && bOut) m.awardPoint(w.a.deadFor > w.b.deadFor ? 'p2' : 'p1');
        else m.awardPoint(aOut ? 'p2' : 'p1');
      }
    });

    /* ---- present ---- */
    placePlayer(aRef.current, w.a);
    placePlayer(bRef.current, w.b);

    const mesh = rocks.current;
    if (mesh) {
      w.hazards.forEach((hz, i) => {
        if (hz.active) {
          const blasting = hz.blast > 0;
          dummy.position.set(hz.x, blasting ? hz.r * 0.4 : hz.y, hz.z);
          dummy.rotation.set(hz.y * 0.5, hz.y * 0.3, 0);
          dummy.scale.setScalar(blasting ? hz.r * 3.1 * (1 - hz.blast / 0.42) : hz.r);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.12) {
      lastReport.current = now;
      onTime(w.elapsed);
    }
  });

  return (
    <>
      <Character groupRef={aRef} style={{ body: P1_COLOR, accent: '#DCEEFF', shape: 'round' }} radius={BODY_R} />
      <Character groupRef={bRef} style={{ body: P2_COLOR, accent: '#FFE0E0', shape: 'block' }} radius={BODY_R} phase={1.1} />
      <instancedMesh ref={rocks} args={[undefined, undefined, POOL]} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#6E7A8C" roughness={0.85} emissive="#FF6B3D" emissiveIntensity={0.2} />
      </instancedMesh>
    </>
  );
}

/** Knock out any living player inside a radius. */
function hurtInRadius(
  w: World,
  x: number,
  z: number,
  r: number,
  sparks: React.RefObject<SparksHandle | null>,
  m: ReturnType<typeof useMatch>,
) {
  if (m.phase !== 'playing') return;
  for (const p of [w.a, w.b]) {
    if (!p.alive) continue;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz > r * r) continue;
    p.alive = false;
    p.deadFor = 0;
    sparks.current?.burst(p.x, 0.6, p.z, '#FF4D8D', 22, 5);
    haptics.heavy();
    play('game.crash');
  }
}

function placePlayer(group: THREE.Group | null, p: Player) {
  if (!group) return;
  group.position.set(p.x, p.alive ? 0 : -0.35, p.z);
  group.rotation.z = p.alive ? -p.vx * 0.05 : Math.PI / 2.2;
  group.visible = p.alive || p.deadFor < 1.4;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0A1016' },
});
