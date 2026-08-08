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
 *  TANK DUEL
 * ============================================================================
 *
 * Two tanks, a walled arena, breakable cover. First to three hits.
 *
 * The control scheme is the interesting decision. A tank with separate drive
 * and turret axes needs four inputs per player, which is one keyboard too many
 * for two people sharing a desk. So the turret **follows the direction you are
 * driving**, and firing is one key. You aim by moving — which makes positioning
 * and shooting the same skill, and reads instantly without a tutorial.
 *
 * Shells bounce once off walls, so the arena's geometry is a weapon rather than
 * just a boundary.
 */

const HALF_W = 3.6;
const HALF_D = 4.4;
const TANK_R = 0.42;
const SHELL_R = 0.13;
const ACCEL = 30;
const MAX_SPEED = 4.6;
const SHELL_SPEED = 11;
const RELOAD = 0.75;
const SHELL_LIFE = 2.6;
const TARGET = 3;
const SHELLS = 12;
const BLOCKS = 7;

type Tank = Body & { aim: number; reload: number; hitFlash: number };
type Shell = { active: boolean; x: number; z: number; vx: number; vz: number; life: number; owner: 0 | 1; bounced: boolean };
type Block = { x: number; z: number; hp: number; w: number; d: number };

type World = {
  a: Tank;
  b: Tank;
  shells: Shell[];
  blocks: Block[];
  acc: { value: number };
  live: boolean;
};

const makeTank = (x: number, z: number, aim: number): Tank => ({
  ...makeBody(x, z, TANK_R, 1, 3.2),
  aim,
  reload: 0,
  hitFlash: 0,
});

function layoutBlocks(): Block[] {
  // Symmetric cover, so neither side has an advantage.
  const spec: [number, number, number, number][] = [
    [0, 0, 1.5, 0.4],
    [-2.1, 1.5, 0.4, 1.3],
    [2.1, -1.5, 0.4, 1.3],
    [-2.1, -1.5, 0.4, 1.3],
    [2.1, 1.5, 0.4, 1.3],
    [0, 2.9, 1.1, 0.4],
    [0, -2.9, 1.1, 0.4],
  ];
  return spec.slice(0, BLOCKS).map(([x, z, w, d]) => ({ x, z, w, d, hp: 3 }));
}

function makeWorld(): World {
  return {
    a: makeTank(0, HALF_D * 0.66, Math.PI / 2),
    b: makeTank(0, -HALF_D * 0.66, -Math.PI / 2),
    shells: Array.from({ length: SHELLS }, () => ({
      active: false, x: 0, z: 0, vx: 0, vz: 0, life: 0, owner: 0 as 0 | 1, bounced: false,
    })),
    blocks: layoutBlocks(),
    acc: { value: 0 },
    live: false,
  };
}

export default function TankDuelGame({ onFinish, paused, requestPause }: GameSurfaceProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const finished = useRef(false);

  const serve = useCallback(() => {
    const w = world.current;
    Object.assign(w.a, makeTank(0, HALF_D * 0.66, Math.PI / 2));
    Object.assign(w.b, makeTank(0, -HALF_D * 0.66, -Math.PI / 2));
    for (const s of w.shells) s.active = false;
    w.blocks = layoutBlocks();
    w.live = true;
  }, []);

  const handleOver = useCallback(
    (winner: 'p1' | 'p2', score: Record<'p1' | 'p2', number>) => {
      if (finished.current) return;
      finished.current = true;
      world.current.live = false;
      play(winner === 'p1' ? 'reward.chest' : 'game.over');
      onFinish({
        score: score.p1 * 280 + (winner === 'p1' ? 520 : 0),
        outcome: winner === 'p1' ? 'win' : 'lose',
        metrics: {
          versus_matches: 1,
          versus_wins: winner === 'p1' ? 1 : 0,
          versus_rounds: score.p1 + score.p2,
        },
        reward: { coins: 210 + score.p1 * 60, xp: 52 + score.p1 * 14, items: { mat_scrap: 1 } },
        breakdown: [
          { label: 'Hits', value: `${score.p1} – ${score.p2}` },
          { label: 'Winner', value: winner === 'p1' ? 'Player 1' : 'Player 2' },
        ],
      });
    },
    [onFinish],
  );

  const match = useMatch({ target: TARGET, countdown: 3, onOver: handleOver, onServe: serve });
  const matchRef = useRef(match);
  matchRef.current = match;

  const fire = useCallback((who: 'a' | 'b') => {
    const w = world.current;
    if (!w.live || matchRef.current.phase !== 'playing') return;
    const t = w[who];
    if (t.reload > 0) return;
    const s = w.shells.find((x) => !x.active);
    if (!s) return;
    t.reload = RELOAD;
    s.active = true;
    s.owner = who === 'a' ? 0 : 1;
    s.bounced = false;
    s.life = SHELL_LIFE;
    s.x = t.x + Math.cos(t.aim) * (TANK_R + SHELL_R + 0.16);
    s.z = t.z + Math.sin(t.aim) * (TANK_R + SHELL_R + 0.16);
    s.vx = Math.cos(t.aim) * SHELL_SPEED;
    s.vz = Math.sin(t.aim) * SHELL_SPEED;
    // Recoil — small, but it sells the shot.
    t.vx -= Math.cos(t.aim) * 1.6;
    t.vz -= Math.sin(t.aim) * 1.6;
    sparks.current?.burst(s.x, 0.35, s.z, '#FFD166', 6, 3);
    haptics.press();
    play('game.hit', { volume: 0.5 });
  }, []);

  const actions = useRef({ p1: () => fire('a'), p2: () => fire('b') }).current;
  const { axes } = useDuelInput(!paused, actions);


  return (
    <View style={styles.root}>
      <Stage
        fit={{ halfWidth: HALF_W, halfDepth: HALF_D, height: 1.6, margin: 0.92 }}
        cameraDir={[0, 13, 9.5]}
        fov={52}
        background="#0B1109"
        paused={paused}
      >
        <Arena halfWidth={HALF_W} halfDepth={HALF_D} accent={palette.lime} surface="#17210F" />
        <Field world={world} axes={axes} matchRef={matchRef} sparks={sparks} />
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
        summary={HAS_KEYBOARD ? 'Space / Enter to fire — you aim where you drive' : undefined}
      />

      <TouchSticks
        axes={axes}
        split="vertical"
        visible={!HAS_KEYBOARD && match.phase !== 'over'}
        onActionP1={actions.p1}
        onActionP2={actions.p2}
        actionLabel="FIRE"
      />
    </View>
  );
}

function Field({
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
  const shellMesh = useRef<THREE.InstancedMesh>(null);
  const blockMesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_s, delta) => {
    const w = world.current;
    const m = matchRef.current;
    if (!w || !m) return;
    const live = m.phase === 'playing' && w.live;

    stepWorld(delta, w.acc, (h) => {
      /* ---- tanks ---- */
      for (const [t, axis] of [
        [w.a, axes.current.p1],
        [w.b, axes.current.p2],
      ] as const) {
        if (t.reload > 0) t.reload -= h;
        if (t.hitFlash > 0) t.hitFlash -= h;

        if (live) {
          t.vx += axis.x * ACCEL * h;
          t.vz += axis.z * ACCEL * h;
          // Turret follows the drive direction — one stick, one skill.
          if (Math.hypot(axis.x, axis.z) > 0.15) {
            const want = Math.atan2(axis.z, axis.x);
            let diff = want - t.aim;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            t.aim += diff * Math.min(1, h * 12);
          }
        }

        // Defensive: a bad value must never freeze a tank or break its turret.
        if (!Number.isFinite(t.vx) || !Number.isFinite(t.vz)) {
          t.vx = 0;
          t.vz = 0;
        }
        const sp = Math.hypot(t.vx, t.vz);
        if (sp > MAX_SPEED) {
          t.vx = (t.vx / sp) * MAX_SPEED;
          t.vz = (t.vz / sp) * MAX_SPEED;
        }
        t.x = clamp(t.x + t.vx * h, -HALF_W + TANK_R, HALF_W - TANK_R);
        t.z = clamp(t.z + t.vz * h, -HALF_D + TANK_R, HALF_D - TANK_R);
        const drag = Math.exp(-t.damping * h);
        t.vx *= drag;
        t.vz *= drag;

        // Cover is solid to tanks too.
        for (const b of w.blocks) {
          if (b.hp <= 0) continue;
          resolveBoxCircle(t, b, TANK_R);
        }
        // A tank wedged between cover and a wall must never be shoved outside
        // the arena by the resolution — re-clamp so it always stays playable.
        t.x = clamp(t.x, -HALF_W + TANK_R, HALF_W - TANK_R);
        t.z = clamp(t.z, -HALF_D + TANK_R, HALF_D - TANK_R);
      }

      if (!live) return;

      /* ---- shells ---- */
      for (const s of w.shells) {
        if (!s.active) continue;
        s.life -= h;
        if (s.life <= 0) {
          s.active = false;
          continue;
        }
        s.x += s.vx * h;
        s.z += s.vz * h;

        // One wall bounce, then it dies — geometry as a weapon, briefly.
        let bounced = false;
        if (s.x < -HALF_W + SHELL_R) {
          s.x = -HALF_W + SHELL_R;
          s.vx = Math.abs(s.vx);
          bounced = true;
        } else if (s.x > HALF_W - SHELL_R) {
          s.x = HALF_W - SHELL_R;
          s.vx = -Math.abs(s.vx);
          bounced = true;
        }
        if (s.z < -HALF_D + SHELL_R) {
          s.z = -HALF_D + SHELL_R;
          s.vz = Math.abs(s.vz);
          bounced = true;
        } else if (s.z > HALF_D - SHELL_R) {
          s.z = HALF_D - SHELL_R;
          s.vz = -Math.abs(s.vz);
          bounced = true;
        }
        if (bounced) {
          if (s.bounced) {
            s.active = false;
            sparks.current?.burst(s.x, 0.3, s.z, '#8FA6FF', 4, 2);
            continue;
          }
          s.bounced = true;
          sparks.current?.burst(s.x, 0.3, s.z, '#8FA6FF', 3, 1.6);
        }

        // Cover takes damage and eventually opens up.
        let blocked = false;
        for (const b of w.blocks) {
          if (b.hp <= 0) continue;
          if (
            Math.abs(s.x - b.x) < b.w / 2 + SHELL_R &&
            Math.abs(s.z - b.z) < b.d / 2 + SHELL_R
          ) {
            b.hp -= 1;
            s.active = false;
            blocked = true;
            sparks.current?.burst(s.x, 0.35, s.z, b.hp <= 0 ? '#FFB443' : '#C9D4E2', b.hp <= 0 ? 16 : 7, 3.4);
            play('game.hit', { volume: 0.45 });
            break;
          }
        }
        if (blocked) continue;

        /* ---- hits ---- */
        for (const [idx, t] of [w.a, w.b].entries()) {
          if (s.owner === idx) continue; // no self-hits
          const dx = s.x - t.x;
          const dz = s.z - t.z;
          if (dx * dx + dz * dz > (TANK_R + SHELL_R) ** 2) continue;
          s.active = false;
          t.hitFlash = 0.4;
          w.live = false;
          sparks.current?.burst(t.x, 0.5, t.z, '#FF4D8D', 26, 5.5);
          haptics.heavy();
          play('game.crash');
          m.awardPoint(idx === 0 ? 'p2' : 'p1');
          break;
        }
      }
    });

    /* ---- present ---- */
    placeTank(aRef.current, w.a);
    placeTank(bRef.current, w.b);

    const sm = shellMesh.current;
    if (sm) {
      w.shells.forEach((s, i) => {
        if (s.active) {
          dummy.position.set(s.x, 0.28, s.z);
          dummy.scale.setScalar(1);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        sm.setMatrixAt(i, dummy.matrix);
      });
      sm.instanceMatrix.needsUpdate = true;
    }

    const bm = blockMesh.current;
    if (bm) {
      w.blocks.forEach((b, i) => {
        if (b.hp > 0) {
          dummy.position.set(b.x, 0.3 * (b.hp / 3) + 0.05, b.z);
          dummy.scale.set(b.w, 0.6 * (b.hp / 3) + 0.1, b.d);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        bm.setMatrixAt(i, dummy.matrix);
      });
      bm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <Tank groupRef={aRef} color={P1_COLOR} />
      <Tank groupRef={bRef} color={P2_COLOR} />

      <instancedMesh ref={shellMesh} args={[undefined, undefined, SHELLS]} frustumCulled={false}>
        <sphereGeometry args={[SHELL_R, 10, 8]} />
        <meshStandardMaterial
          color="#FFD166"
          emissive="#FFB443"
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={blockMesh} args={[undefined, undefined, BLOCKS]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6B7A55" roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Tank({ groupRef, color }: { groupRef: React.RefObject<THREE.Group | null>; color: string }) {
  return (
    <group ref={groupRef}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[TANK_R * 1.9, 0.3, TANK_R * 2.3]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[TANK_R * 0.62, TANK_R * 0.7, 0.24, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.25} />
      </mesh>
      {/* barrel — points along +X so `aim` is a single Y rotation */}
      <mesh castShadow position={[TANK_R * 0.95, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, TANK_R * 1.5, 10]} />
        <meshStandardMaterial color="#2A3140" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TANK_R * 1.1, TANK_R * 1.3, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function placeTank(group: THREE.Group | null, t: Tank) {
  if (!group) return;
  group.position.set(t.x, 0, t.z);
  // Model faces +X; three's +Y rotation takes +X toward -Z, hence the negation.
  group.rotation.y = -t.aim;
  const flash = Math.max(0, t.hitFlash);
  group.scale.setScalar(1 + flash * 0.4);
}

/** Push a circular body out of an axis-aligned box. */
function resolveBoxCircle(b: Body, box: { x: number; z: number; w: number; d: number }, r: number) {
  const nearestX = clamp(b.x, box.x - box.w / 2, box.x + box.w / 2);
  const nearestZ = clamp(b.z, box.z - box.d / 2, box.z + box.d / 2);
  const dx = b.x - nearestX;
  const dz = b.z - nearestZ;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r || d2 === 0) return;
  const d = Math.sqrt(d2);
  b.x = nearestX + (dx / d) * r;
  b.z = nearestZ + (dz / d) * r;
  const dot = b.vx * (dx / d) + b.vz * (dz / d);
  if (dot < 0) {
    b.vx -= dot * (dx / d);
    b.vz -= dot * (dz / d);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0B1109' },
});
