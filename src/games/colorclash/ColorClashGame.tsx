import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { GameSurfaceProps } from '@/core/registry';
import {
  Character,
  DuelHud,
  HAS_KEYBOARD,
  P1_COLOR,
  P2_COLOR,
  Sparks,
  Stage,
  TouchSticks,
  clamp,
  collide,
  makeBody,
  stepWorld,
  useDuelInput,
  useMatch,
  useMatchClock,
  type Body,
  type DuelAxes,
  type SparksHandle,
} from '@/core/game3d';
import { Text, haptics, palette, play, spacing } from '@/ui';

/**
 * ============================================================================
 *  COLOR CLASH
 * ============================================================================
 *
 * A grid of tiles. Walk over one and it becomes yours. Most tiles when the
 * clock runs out wins.
 *
 * The whole board is one `InstancedMesh` — 100 tiles as 100 draw calls would be
 * the single most expensive thing in the collection, and per-tile colour is
 * exactly what instance colours are for. Claiming a tile is a colour write and
 * a counter bump, so the board costs nothing to run.
 */

const GRID = 9;
const TILE = 0.86;
const GAP = 0.06;
const HALF = (GRID * (TILE + GAP)) / 2;
const BODY_R = 0.33;
const ACCEL = 44;
const MAX_SPEED = 6.4;
const ROUND_SECONDS = 45;

type Owner = 0 | 1 | 2;

type World = {
  a: Body;
  b: Body;
  owners: Owner[];
  /** Flash timer per tile, for the claim pop. */
  flash: number[];
  counts: { p1: number; p2: number };
  acc: { value: number };
};

const NEUTRAL = new THREE.Color('#241C38');
const C1 = new THREE.Color(P1_COLOR);
const C2 = new THREE.Color(P2_COLOR);

function makeWorld(): World {
  return {
    a: makeBody(-HALF * 0.6, HALF * 0.6, BODY_R, 1, 6),
    b: makeBody(HALF * 0.6, -HALF * 0.6, BODY_R, 1, 6),
    owners: new Array(GRID * GRID).fill(0),
    flash: new Array(GRID * GRID).fill(0),
    counts: { p1: 0, p2: 0 },
    acc: { value: 0 },
  };
}

const tileCentre = (i: number) => {
  const col = i % GRID;
  const row = Math.floor(i / GRID);
  return {
    x: (col - (GRID - 1) / 2) * (TILE + GAP),
    z: (row - (GRID - 1) / 2) * (TILE + GAP),
  };
};

export default function ColorClashGame({ onFinish, paused, requestPause }: GameSurfaceProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const finished = useRef(false);
  const [tally, setTally] = useState({ p1: 0, p2: 0 });

  const handleOver = useCallback(
    (winner: 'p1' | 'p2', score: Record<'p1' | 'p2', number>) => {
      if (finished.current) return;
      finished.current = true;
      const total = GRID * GRID;
      play(winner === 'p1' ? 'reward.chest' : 'game.over');
      onFinish({
        score: score.p1 * 12,
        outcome: winner === 'p1' ? 'win' : 'lose',
        metrics: { versus_matches: 1, versus_wins: winner === 'p1' ? 1 : 0 },
        reward: { coins: 180 + score.p1 * 6, xp: 45 + score.p1 * 2, items: { mat_scrap: 1 } },
        breakdown: [
          { label: 'Tiles', value: `${score.p1} – ${score.p2}` },
          { label: 'Board', value: `${Math.round((score.p1 / total) * 100)}% claimed` },
        ],
      });
    },
    [onFinish],
  );

  // Tiles are the score, so the match ends on the clock rather than on a target.
  const match = useMatch({
    target: Number.MAX_SAFE_INTEGER,
    countdown: 3,
    onOver: handleOver,
    onServe: () => {
      clock.reset();
    },
  });
  const matchRef = useRef(match);
  matchRef.current = match;

  const expire = useCallback(() => {
    const c = world.current.counts;
    const winner: 'p1' | 'p2' = c.p1 >= c.p2 ? 'p1' : 'p2';
    // Drive the shared HUD's "over" state with the real tile counts.
    match.awardPoint(winner);
    handleOver(winner, { p1: c.p1, p2: c.p2 });
  }, [handleOver, match]);

  const clock = useMatchClock(ROUND_SECONDS, match.phase === 'playing', expire);

  const { axes } = useDuelInput(!paused);


  return (
    <View style={styles.root}>
      <Stage
        fit={{ halfWidth: HALF, halfDepth: HALF, height: 1.8, margin: 0.9 }}
        cameraDir={[0, 12, 9]}
        fov={52}
        background="#0C0819"
        paused={paused}
      >
        <Board world={world} axes={axes} matchRef={matchRef} sparks={sparks} onTally={setTally} />
        <Sparks handle={sparks} count={70} />
      </Stage>

      <DuelHud
        phase={match.phase}
        score={tally}
        count={match.count}
        winner={match.winner}
        lastScorer={null}
        target={GRID * GRID}
        rule={`${Math.ceil(clock.left)}s`}
        onPause={requestPause}
        centre={
          <Text variant="caption" muted>
            {Math.round((tally.p1 / (GRID * GRID)) * 100)}% · {Math.round((tally.p2 / (GRID * GRID)) * 100)}%
          </Text>
        }
      />

      <TouchSticks axes={axes} split="vertical" visible={!HAS_KEYBOARD && match.phase !== 'over'} />
    </View>
  );
}

function Board({
  world,
  axes,
  matchRef,
  sparks,
  onTally,
}: {
  world: React.RefObject<World>;
  axes: { current: DuelAxes };
  matchRef: React.RefObject<ReturnType<typeof useMatch>>;
  sparks: React.RefObject<SparksHandle | null>;
  onTally: (t: { p1: number; p2: number }) => void;
}) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const scratch = useMemo(() => new THREE.Color(), []);
  const lastReport = useRef(0);
  const seeded = useRef(false);

  useFrame((state, delta) => {
    const w = world.current;
    const m = matchRef.current;
    const mesh = tiles.current;
    if (!w || !m || !mesh) return;
    const live = m.phase === 'playing';

    if (!seeded.current) {
      seeded.current = true;
      for (let i = 0; i < GRID * GRID; i++) mesh.setColorAt(i, NEUTRAL);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    stepWorld(delta, w.acc, (h) => {
      for (const [body, axis] of [
        [w.a, axes.current.p1],
        [w.b, axes.current.p2],
      ] as const) {
        if (live) {
          body.vx += axis.x * ACCEL * h;
          body.vz += axis.z * ACCEL * h;
        }
        const s = Math.hypot(body.vx, body.vz);
        if (s > MAX_SPEED) {
          body.vx = (body.vx / s) * MAX_SPEED;
          body.vz = (body.vz / s) * MAX_SPEED;
        }
        body.x = clamp(body.x + body.vx * h, -HALF + BODY_R, HALF - BODY_R);
        body.z = clamp(body.z + body.vz * h, -HALF + BODY_R, HALF - BODY_R);
        const drag = Math.exp(-body.damping * h);
        body.vx *= drag;
        body.vz *= drag;
      }
      // Players bump rather than overlap — contesting a tile should be physical.
      collide(w.a, w.b, 0.85);
    });

    /* ---- claiming ---- */
    if (live) {
      let changed = false;
      for (const [body, owner, color] of [
        [w.a, 1 as Owner, C1],
        [w.b, 2 as Owner, C2],
      ] as const) {
        const idx = tileAt(body.x, body.z);
        if (idx < 0 || w.owners[idx] === owner) continue;
        const prev = w.owners[idx];
        w.owners[idx] = owner;
        w.flash[idx] = 1;
        if (prev === 1) w.counts.p1--;
        else if (prev === 2) w.counts.p2--;
        if (owner === 1) w.counts.p1++;
        else w.counts.p2++;
        mesh.setColorAt(idx, color);
        changed = true;
        const c = tileCentre(idx);
        sparks.current?.burst(c.x, 0.25, c.z, owner === 1 ? P1_COLOR : P2_COLOR, 5, 2.4);
        play('game.collect', { volume: 0.35 });
      }
      if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    /* ---- tiles: flat, with a short pop when claimed ---- */
    for (let i = 0; i < GRID * GRID; i++) {
      if (w.flash[i] > 0) w.flash[i] = Math.max(0, w.flash[i] - delta * 3.2);
      const c = tileCentre(i);
      const lift = w.flash[i] * 0.22;
      dummy.position.set(c.x, lift, c.z);
      dummy.scale.set(TILE, 0.14 + lift * 0.5, TILE);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (aRef.current) aRef.current.position.set(w.a.x, 0.1, w.a.z);
    if (bRef.current) bRef.current.position.set(w.b.x, 0.1, w.b.z);

    // Report the tally to React at 8 Hz, not per frame.
    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.12) {
      lastReport.current = now;
      onTally({ p1: w.counts.p1, p2: w.counts.p2 });
    }
    void scratch;
  });

  return (
    <>
      <instancedMesh
        ref={tiles}
        args={[undefined, undefined, GRID * GRID]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} metalness={0.05} />
      </instancedMesh>

      <Character groupRef={aRef} style={{ body: P1_COLOR, accent: '#DCEEFF', shape: 'round' }} radius={BODY_R} />
      <Character groupRef={bRef} style={{ body: P2_COLOR, accent: '#FFE0E0', shape: 'spike' }} radius={BODY_R} phase={2.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2 + 1.4, HALF * 2 + 1.4]} />
        <meshStandardMaterial color="#120C22" roughness={1} />
      </mesh>
    </>
  );
}

/** Which tile a world position sits on, or -1 outside the board. */
function tileAt(x: number, z: number): number {
  const col = Math.round(x / (TILE + GAP) + (GRID - 1) / 2);
  const row = Math.round(z / (TILE + GAP) + (GRID - 1) / 2);
  if (col < 0 || col >= GRID || row < 0 || row >= GRID) return -1;
  return row * GRID + col;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0C0819' },
});
