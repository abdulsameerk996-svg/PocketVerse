import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  Arena,
  Character,
  Sparks,
  Stage,
  TouchSticks,
  HAS_KEYBOARD,
  clamp,
  useDuelInput,
  type DuelAxes,
  type SparksHandle,
} from '@/core/game3d';
import { Text, haptics, palette, play, spacing } from '@/ui';
import type { ChallengeProps } from './types';

/**
 * ============================================================================
 *  METEOR DODGE — 3D
 * ============================================================================
 *
 * ── The bug this replaces ───────────────────────────────────────────────────
 *
 * The old 2D version positioned the player with `useWindowDimensions().width`:
 *
 *     const px = useSharedValue(width / 2);          // window width
 *     <View style={styles.dodgeArea} />              // narrower, overflow:hidden
 *
 * That held while the play area *was* the window. It stopped holding the moment
 * the app gained a centred desktop column: the window reports 1280+, the arena
 * is ~490 wide and clips its overflow, so the player was parked hundreds of
 * pixels outside it and simply never drawn. Most meteors spawned out there too,
 * because they used the same width — which is why the game looked empty rather
 * than obviously broken.
 *
 * The fix is not a bigger number. It is that **nothing here measures the
 * window**: the arena is defined in world units and the camera is fitted to it,
 * so the playfield is correct at any viewport, on any device, in any column.
 */

const ARENA_W = 6.4;
const ARENA_D = 7.6;
const PLAYER_R = 0.42;
const PLAYER_SPEED = 7.2;
/** Meteors live in a fixed pool — no allocation while playing. */
const POOL = 26;

type Meteor = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  r: number;
  spin: number;
};

type World = {
  px: number;
  pz: number;
  meteors: Meteor[];
  spawnTimer: number;
  elapsed: number;
  alive: boolean;
};

function makeWorld(): World {
  return {
    px: 0,
    // Inside the arena, not on its lip: `ARENA_D` is the full depth, so
    // anything above 0.5 of it starts out of bounds and snaps on frame one.
    pz: ARENA_D * 0.22,
    meteors: Array.from({ length: POOL }, () => ({
      active: false, x: 0, y: -99, z: 0, vy: 0, r: 0.3, spin: 0,
    })),
    spawnTimer: 0.6,
    elapsed: 0,
    alive: true,
  };
}

export default function MeteorDodge3D({ onEnd, speed = 1 }: ChallengeProps) {
  const world = useRef<World>(makeWorld());
  const sparks = useRef<SparksHandle | null>(null);
  const [survived, setSurvived] = useState(0);
  const [over, setOver] = useState(false);

  const { axes } = useDuelInput(!over);

  // 10 Hz readout — the HUD must not re-render the scene.
  useEffect(() => {
    const id = setInterval(() => {
      if (!world.current.alive) return;
      setSurvived(world.current.elapsed);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const finish = useCallback(() => {
    if (!world.current.alive) return;
    world.current.alive = false;
    const t = world.current.elapsed;
    setOver(true);
    haptics.fail();
    play('game.crash');
    // Brief beat so the player sees the impact before the results sheet.
    setTimeout(() => {
      onEnd(Math.round(t * 60), [{ label: 'Survived', value: `${t.toFixed(1)}s` }]);
    }, 900);
  }, [onEnd]);

  return (
    <View style={styles.root}>
      <Stage
        // `height` only needs to cover the character; meteors enter from off
        // screen by design, and framing for them would push the deck away.
        fit={{ halfWidth: ARENA_W / 2, halfDepth: ARENA_D / 2, height: 1.1, margin: 0.94 }}
        cameraDir={[0, 9.5, 10]}
        fov={54}
        background="#0B0716"
        paused={false}
      >
        <Arena
          halfWidth={ARENA_W / 2}
          halfDepth={ARENA_D / 2}
          accent={palette.rose}
          surface="#191129"
        />
        <Sim world={world} axes={axes} sparks={sparks} speed={speed} onHit={finish} />
        <Sparks handle={sparks} count={72} />
      </Stage>

      <View pointerEvents="none" style={styles.hud}>
        <Text variant="micro" color={palette.rose}>
          METEOR DODGE
        </Text>
        <Text variant="display" numeric>
          {survived.toFixed(1)}s
        </Text>
        <Text variant="caption" muted>
          {HAS_KEYBOARD ? 'WASD / arrows to move' : 'drag anywhere to move'}
        </Text>
      </View>

      {over ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text variant="display" center color={palette.coral}>
            Hit!
          </Text>
        </View>
      ) : null}

      <TouchSticks axes={axes} players={1} visible={!HAS_KEYBOARD && !over} />
    </View>
  );
}

/* ------------------------------------------------------------- simulation -- */

function Sim({
  world,
  axes,
  sparks,
  speed,
  onHit,
}: {
  world: React.RefObject<World>;
  axes: { current: DuelAxes };
  sparks: React.RefObject<SparksHandle | null>;
  speed: number;
  onHit: () => void;
}) {
  const playerRef = useRef<THREE.Group>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const camera = useThree((s) => s.camera);
  const hitFired = useRef(false);

  useFrame((_state, delta) => {
    const w = world.current;
    if (!w) return;
    const dt = Math.min(delta, 0.05);

    if (w.alive) {
      w.elapsed += dt;

      /* ---- player: one input path, whatever the device ---- */
      const a = axes.current.p1;
      w.px = clamp(w.px + a.x * PLAYER_SPEED * dt, -ARENA_W / 2 + PLAYER_R, ARENA_W / 2 - PLAYER_R);
      w.pz = clamp(w.pz + a.z * PLAYER_SPEED * dt, -ARENA_D / 2 + PLAYER_R, ARENA_D / 2 - PLAYER_R);

      /* ---- spawning: harder over time, but bounded ---- */
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0) {
        w.spawnTimer = Math.max(0.14, (0.62 - w.elapsed * 0.014) / speed);
        for (const m of w.meteors) {
          if (m.active) continue;
          m.active = true;
          m.r = 0.26 + Math.random() * 0.22;
          m.x = (Math.random() - 0.5) * (ARENA_W - m.r * 2);
          m.z = (Math.random() - 0.5) * (ARENA_D - m.r * 2);
          m.y = 9;
          m.vy = -(5.2 + Math.random() * 3.4 + w.elapsed * 0.22) * speed;
          m.spin = Math.random() * Math.PI * 2;
          break;
        }
      }

      /* ---- meteors ---- */
      for (const m of w.meteors) {
        if (!m.active) continue;
        m.y += m.vy * dt;
        m.spin += dt * 3;

        // Impact with the deck: a visible puff, so near-misses read clearly.
        if (m.y <= m.r) {
          m.active = false;
          sparks.current?.burst(m.x, m.r, m.z, '#FF8A3D', 6, 2.2);
          continue;
        }

        // Collision with the player — a real 3D overlap, not a screen-space guess.
        const dx = m.x - w.px;
        const dz = m.z - w.pz;
        const reach = m.r + PLAYER_R;
        if (m.y < 1.5 && dx * dx + dz * dz < reach * reach && !hitFired.current) {
          hitFired.current = true;
          m.active = false;
          sparks.current?.burst(w.px, 0.8, w.pz, '#FF4D8D', 26, 5);
          onHit();
        }
      }
    }

    /* ---- present ---- */
    if (playerRef.current) {
      playerRef.current.position.set(w.px, 0, w.pz);
      // Lean into the direction of travel — cheap, and it makes the character
      // feel driven rather than slid around.
      const a = axes.current.p1;
      playerRef.current.rotation.z = -a.x * 0.22;
      playerRef.current.rotation.x = a.z * 0.22;
    }

    const mesh = rocks.current;
    if (mesh) {
      w.meteors.forEach((m, i) => {
        if (m.active) {
          dummy.position.set(m.x, m.y, m.z);
          dummy.rotation.set(m.spin, m.spin * 0.7, 0);
          dummy.scale.setScalar(m.r);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Gentle framing follow: the camera keeps the whole arena but drifts toward
    // the player, so they are always clearly the subject.
    camera.lookAt(w.px * 0.3, 0.4, w.pz * 0.3);
  });

  return (
    <>
      <Character
        groupRef={playerRef}
        style={{ body: '#4EA8FF', accent: '#A9E7FF', shape: 'round' }}
        radius={PLAYER_R}
      />
      {/* Shadow disc, so height off the deck is readable */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
      <instancedMesh ref={rocks} args={[undefined, undefined, POOL]} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8B5A3C" roughness={0.9} emissive="#FF4D1A" emissiveIntensity={0.25} />
      </instancedMesh>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0B0716' },
  hud: { position: 'absolute', top: spacing.md, left: 0, right: 0, alignItems: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
