import React, { memo, useEffect, type ReactNode } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { GameCanvas } from './GameCanvas';
import { finiteOr, safeCameraDir } from './safe';

/**
 * ============================================================================
 *  STAGE — the 3D shell every PocketVerse 3D game mounts into
 * ============================================================================
 *
 * Pen Fight proved the setup; this generalises it so no other game has to
 * rediscover it:
 *
 *   · one shadow-casting key light plus ambient and hemisphere fill — enough
 *     for the soft, stylised look, cheap enough for a phone;
 *   · a device-pixel-ratio cap, because a low-poly arcade scene gains nothing
 *     visible from 3x and loses most of the fill rate;
 *   · fog and a matched clear colour, so the arena fades into the background
 *     rather than ending at a hard edge;
 *   · **auto-framed camera** — the single most valuable piece. A hardcoded
 *     camera looks right on exactly one aspect ratio. `fit` describes the box
 *     the game needs on screen and the camera solves for it, so the same scene
 *     frames correctly on a phone, a tablet and a 520px desktop column.
 *
 * `frameloop="never"` while paused stops the render loop dead, which is both
 * the pause behaviour and the battery story.
 */

export type StageFit = {
  /** Half-extent the camera must keep in frame, in world units. */
  halfWidth: number;
  halfDepth: number;
  /** Highest point that must stay visible (players, arcs, projectiles). */
  height?: number;
  /** Fraction of the viewport the box should fill. */
  margin?: number;
};

export type StageProps = {
  children?: ReactNode;
  /** Camera direction — normalised internally. Distance is solved for. */
  cameraDir?: [number, number, number];
  fov?: number;
  fit: StageFit;
  /** Scene background + fog colour. */
  background?: string;
  /** Key light tint and position. */
  keyLight?: { color?: string; position?: [number, number, number]; intensity?: number };
  ambient?: number;
  /** Stops the render loop entirely. */
  paused?: boolean;
  shadows?: boolean;
};

export const Stage = memo(function Stage({
  children,
  cameraDir = [0, 13.5, 11],
  fov = 55,
  fit,
  background = '#0A0713',
  keyLight,
  ambient = 0.55,
  paused = false,
  shadows = true,
}: StageProps) {
  return (
    <GameCanvas
      shadows={shadows}
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: cameraDir, fov, near: 0.5, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene, setDpr }) => {
        // Native inherits the device ratio (3x on most Android phones); web
        // caps via the `dpr` prop in GameCanvas.web.tsx.
        if (Platform.OS !== 'web') setDpr(Math.min(PixelRatio.get(), 2));
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.background = new THREE.Color(background);
        scene.fog = new THREE.Fog(background, 26, 70);
      }}
    >
      <StageRig cameraDir={cameraDir} fit={fit} ambient={ambient} keyLight={keyLight} shadows={shadows} />
      {children}
    </GameCanvas>
  );
});

function StageRig({
  cameraDir,
  fit,
  ambient,
  keyLight,
  shadows,
}: Required<Pick<StageProps, 'cameraDir' | 'fit' | 'ambient'>> &
  Pick<StageProps, 'keyLight' | 'shadows'>) {
  useFitCamera(cameraDir, fit);

  const kl = keyLight ?? {};
  const pos = kl.position ?? [6, 16, 8];
  const reach = Math.max(fit.halfWidth, fit.halfDepth) * 2.2 + 6;

  return (
    <>
      <ambientLight intensity={ambient} />
      <hemisphereLight args={['#8FA6FF', '#241A33', 0.45]} />
      <directionalLight
        castShadow={shadows}
        color={kl.color ?? '#FFFFFF'}
        position={pos}
        intensity={kl.intensity ?? 1.85}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-bias={-0.0012}
      />
    </>
  );
}

/**
 * Solve the camera distance so `fit` lands just inside the frustum.
 *
 * A fixed camera position is only correct for one aspect ratio; every other
 * device either crops the arena or strands it in the middle of the screen. In a
 * game about edges and boundaries, not seeing the edge is a gameplay bug.
 *
 * Runs on mount and on resize, never per frame.
 */
export function useFitCamera(dir: [number, number, number], fit: StageFit) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const { halfWidth, halfDepth, height = 1, margin = 0.92 } = fit;

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || size.width === 0 || size.height === 0) return;

    // A zero-length or poisoned direction would normalise to NaN and render a
    // blank scene — sanitise before any camera math (see `safe.ts`).
    const [dx, dy, dz] = safeCameraDir(dir);
    const unit = new THREE.Vector3(dx, dy, dz).normalize();
    const corners: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const y of [0, height]) {
          corners.push(new THREE.Vector3(sx * halfWidth, y, sz * halfDepth));
        }
      }
    }

    cam.aspect = size.width / size.height;

    let dist = Math.hypot(dx, dy, dz) || 20;
    for (let i = 0; i < 18; i++) {
      cam.position.copy(unit).multiplyScalar(dist);
      cam.lookAt(0, 0, 0);
      cam.near = Math.max(0.1, dist * 0.04);
      cam.far = dist * 3 + 60;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();

      let worst = 0;
      for (const c of corners) {
        const p = c.clone().project(cam);
        worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
      // A poisoned projection (camera still invalid mid-solve) must abort the
      // solve rather than NaN the distance for the rest of the loop.
      if (!Number.isFinite(worst) || worst < 1e-9) break;
      if (Math.abs(worst - margin) < 0.004) break;
      // Projected extent is near-linear in 1/distance across these corrections,
      // so scaling by the overflow ratio converges in a handful of steps.
      dist = finiteOr((dist * worst) / margin, 20);
    }
  }, [camera, size.width, size.height, dir, halfWidth, halfDepth, height, margin]);
}
