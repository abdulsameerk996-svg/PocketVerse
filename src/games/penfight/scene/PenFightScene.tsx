import React, { memo, useCallback, useEffect, useRef, type RefObject } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { GameCanvas } from '@/core/game3d';

import { TABLE } from '../content';
import type { PenSkin } from '../content';
import { PEN_RADIUS, step } from '../physics';
import type { PenBody, SideId } from '../types';
import { Desk } from './Desk';
import { Pen } from './Pen';
import { AIM_MAX, AIM_MIN, AimIndicator, type AimRefs } from './AimIndicator';

/**
 * ============================================================================
 *  PEN FIGHT — THE 3D ARENA
 * ============================================================================
 *
 * The performance contract, which is different from the 2D games and
 * deliberately so:
 *
 *   · The 2D games run their simulation as a Reanimated worklet on the UI
 *     thread. That is not available here — expo-gl draws from JS, so a worklet
 *     would have to hop back across the bridge every frame to touch the scene.
 *   · Instead the solver runs inside one `useFrame`, which is already the
 *     render tick, and writes straight onto `THREE.Object3D` transforms.
 *   · Nothing in this subtree re-renders while playing. Positions never become
 *     React state; the world is a mutable object held in a ref by the surface.
 *   · The simulation itself is fixed-step (see `physics.ts`), so a 120 Hz phone
 *     and a 60 Hz phone play the same match.
 *
 * Everything is procedural — no textures, no models, no `useLoader`. Opening the
 * game allocates a handful of buffer geometries and nothing else, and R3F
 * disposes all of them when the Canvas unmounts.
 */

export type PenWorld = {
  player: PenBody;
  rival: PenBody;
  /** Both pens, in the order the solver iterates them. */
  list: PenBody[];
  accumulator: { value: number };
  /** While false, bodies hold position and only the aim guide updates. */
  running: boolean;
};

export type AimState = {
  active: boolean;
  dirX: number;
  dirZ: number;
  /** 0..1 */
  power: number;
};

export type SceneProps = {
  world: RefObject<PenWorld>;
  aim: RefObject<AimState>;
  playerSkin: PenSkin;
  rivalSkin: PenSkin;
  accent: string;
  /** Host pause — stops the render loop entirely. */
  paused: boolean;
  onImpact: (strength: number) => void;
  onKnockOff: (sides: SideId[]) => void;
  onSettled: () => void;
};

/** Ignore anything under this normal impulse — resting contact chatter. */
const IMPACT_FLOOR = 0.35;
/** Clamp a long frame so a stall cannot fast-forward the match. */
const MAX_FRAME_DT = 0.05;

const AIM_COLD = new THREE.Color('#22D3EE');
const AIM_HOT = new THREE.Color('#FF6B6B');

export const PenFightScene = memo(function PenFightScene(props: SceneProps) {
  const { paused, accent, playerSkin, rivalSkin } = props;

  return (
    <GameCanvas
      shadows
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [0, 13.5, 11], fov: 58, near: 0.5, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene, setDpr }) => {
        // Native has no `dpr` prop and inherits the device ratio, which is 3x
        // on most Android phones — a tabletop scene gains nothing visible from
        // that and it costs most of the fill rate. Web sets its cap through the
        // `dpr` prop in `GameCanvas.web.tsx`, so only cap here.
        if (Platform.OS !== 'web') setDpr(Math.min(PixelRatio.get(), 2));
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.background = new THREE.Color('#0A0713');
        scene.fog = new THREE.Fog('#0A0713', 22, 44);
      }}
    >
      <Arena {...props} accent={accent} playerSkin={playerSkin} rivalSkin={rivalSkin} />
    </GameCanvas>
  );
});

/* -------------------------------------------------------------- the arena -- */

function Arena({
  world,
  aim,
  playerSkin,
  rivalSkin,
  accent,
  onImpact,
  onKnockOff,
  onSettled,
}: SceneProps) {
  const playerGroup = useRef<THREE.Group | null>(null);
  const playerTilt = useRef<THREE.Group | null>(null);
  const rivalGroup = useRef<THREE.Group | null>(null);
  const rivalTilt = useRef<THREE.Group | null>(null);

  const aimRefs: AimRefs = {
    group: useRef<THREE.Group | null>(null),
    shaft: useRef<THREE.Mesh | null>(null),
    head: useRef<THREE.Mesh | null>(null),
  };

  // Callbacks live in refs so the frame closure never needs rebuilding — a
  // changed prop must not cost a resubscribe on the render loop.
  const impactCb = useLatest(onImpact);
  const knockCb = useLatest(onKnockOff);
  const settledCb = useLatest(onSettled);

  useFitTableToViewport();

  const syncAim = useCallback(
    (w: PenWorld) => {
      const g = aimRefs.group.current;
      const shaft = aimRefs.shaft.current;
      const head = aimRefs.head.current;
      if (!g || !shaft || !head) return;

      const a = aim.current;
      if (!a || !a.active) {
        g.visible = false;
        return;
      }

      g.visible = true;
      // Start the guide at the pen's surface, not its centre. Pens rack up
      // end-on, so a centre-anchored guide spends its first unit buried inside
      // the barrel exactly when the player is lining up the opening flick.
      const p = w.player;
      const ax = Math.cos(p.angle);
      const az = Math.sin(p.angle);
      const extent = Math.abs(ax * a.dirX + az * a.dirZ) * p.half + p.radius;
      g.position.set(p.x + a.dirX * extent, 0.012, p.z + a.dirZ * extent);
      g.rotation.y = -Math.atan2(a.dirZ, a.dirX);

      const len = AIM_MIN + a.power * (AIM_MAX - AIM_MIN);
      shaft.scale.x = len;
      shaft.position.x = len / 2;
      head.position.x = len + 0.2;

      const shaftMat = shaft.material as THREE.MeshBasicMaterial;
      const headMat = head.material as THREE.MeshBasicMaterial;
      shaftMat.color.lerpColors(AIM_COLD, AIM_HOT, a.power);
      headMat.color.copy(shaftMat.color);
    },
    // aimRefs identity is stable per mount; listing `aim` is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aim],
  );

  useFrame((_state, delta) => {
    const w = world.current;
    if (!w) return;

    if (w.running) {
      const report = step(w.list, TABLE, Math.min(delta, MAX_FRAME_DT), w.accumulator);
      if (report.impact > IMPACT_FLOOR) impactCb.current(report.impact);
      if (report.knockedOff.length > 0) knockCb.current(report.knockedOff);
      if (report.settled) {
        w.running = false;
        settledCb.current();
      }
    }

    syncBody(playerGroup.current, playerTilt.current, w.player);
    syncBody(rivalGroup.current, rivalTilt.current, w.rival);
    syncAim(w);
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#8FA6FF', '#241A33', 0.45]} />
      <directionalLight
        castShadow
        position={[6, 14, 6]}
        intensity={1.85}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0012}
      />

      <Desk accent={accent} />

      <Pen bodyRef={playerGroup} tiltRef={playerTilt} skin={playerSkin} />
      <Pen bodyRef={rivalGroup} tiltRef={rivalTilt} skin={rivalSkin} />

      <AimIndicator refs={aimRefs} />
    </>
  );
}

/* ------------------------------------------------------------------ utils -- */

/** Where the camera sits, as a direction. Distance is solved for below. */
const CAMERA_DIR = new THREE.Vector3(0, 13.5, 11).normalize();
/** Fraction of the viewport the desk should occupy at its widest. */
const FIT_MARGIN = 0.92;

/**
 * Pull the camera back until the whole desk is on screen.
 *
 * The camera used to be a fixed position tuned against a 390x844 phone. Any
 * other aspect — a desktop browser column, a tall 20:9 phone, a tablet, a
 * rotated window — either cropped the corners off the desk or left it stranded
 * in the middle of the screen, and in a game about knocking a pen over an edge,
 * not being able to see the edge is a gameplay bug rather than a cosmetic one.
 *
 * Rather than guess a fov per device, this projects the desk's corners and
 * scales the camera distance until they land just inside the frustum. It runs
 * on mount and on resize, never per frame.
 */
function useFitTableToViewport() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || size.width === 0 || size.height === 0) return;

    // Corners of the play surface, lifted to pen height so a pen standing at
    // the rim is never clipped either.
    const w = TABLE.halfW;
    const d = TABLE.halfD;
    const corners: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(sx * w, 0, sz * d));
        corners.push(new THREE.Vector3(sx * w, PEN_RADIUS * 2, sz * d));
      }
    }

    cam.aspect = size.width / size.height;

    let dist = 17.4; // the original hand-tuned distance, as a starting guess
    for (let i = 0; i < 16; i++) {
      cam.position.copy(CAMERA_DIR).multiplyScalar(dist);
      cam.lookAt(0, 0, 0);
      cam.near = Math.max(0.1, dist * 0.05);
      cam.far = dist * 3 + 40;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();

      let worst = 0;
      for (const c of corners) {
        const p = c.clone().project(cam);
        worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
      if (Math.abs(worst - FIT_MARGIN) < 0.004) break;
      // Perspective extent is very close to linear in 1/distance over the small
      // corrections this makes, so scaling by the overflow ratio converges fast.
      dist *= worst / FIT_MARGIN;
    }
  }, [camera, size.width, size.height]);
}

function syncBody(group: THREE.Group | null, tilt: THREE.Group | null, body: PenBody) {
  if (!group) return;
  group.position.set(body.x, PEN_RADIUS + body.y, body.z);
  group.rotation.y = -body.angle;
  if (tilt) tilt.rotation.z = body.fallen ? body.tumble : 0;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
