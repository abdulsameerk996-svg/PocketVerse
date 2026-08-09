import React, { memo, useEffect, type ReactNode, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { GameCanvas } from './GameCanvas';
import { finiteOr, safeCameraDir, safeColor } from './safety';
import { FallbackScene } from './FallbackScene';

/**
 * ============================================================================
 *  STAGE — robust 3D shell
 * ============================================================================
 *
 * Includes:
 * - safe camera defaults (finite guards)
 * - safe lighting defaults
 * - safe geometry defaults via instancing elsewhere
 * - safe material defaults
 * - cleanup on unmount
 * - finite-value guards for camera solve
 * - fallback visible scene if main children throw
 * - retryable via ErrorBoundary is handled outside (global ErrorBoundary)
 *
 * The fallback scene is extremely simple: plane + box + sphere + lights.
 * If that cannot render, the problem is Canvas/renderer itself.
 */

export type StageFit = {
  halfWidth: number;
  halfDepth: number;
  height?: number;
  margin?: number;
};

export type StageProps = {
  children?: ReactNode;
  cameraDir?: [number, number, number];
  fov?: number;
  fit: StageFit;
  background?: string;
  keyLight?: { color?: string; position?: [number, number, number]; intensity?: number };
  ambient?: number;
  paused?: boolean;
  shadows?: boolean;
  /** If true, always render fallback alongside main scene for diagnostics (dev). */
  forceFallback?: boolean;
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
  forceFallback = false,
}: StageProps) {
  const safeBg = safeColor(background, '#0A0713');
  const safeCamDir = safeCameraDir(cameraDir);
  const safeFov = finiteOr(fov, 55);

  return (
    <GameCanvas
      shadows={shadows}
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: safeCamDir as any, fov: safeFov, near: 0.5, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <StageRig cameraDir={safeCamDir} fit={fit} ambient={finiteOr(ambient, 0.55)} keyLight={keyLight} shadows={shadows} background={safeBg} />
      {forceFallback ? <FallbackScene message="DEV FALLBACK" /> : null}
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
  background,
}: Required<Pick<StageProps, 'cameraDir' | 'fit' | 'ambient'>> &
  Pick<StageProps, 'keyLight' | 'shadows' | 'background'>) {
  useFitCamera(cameraDir, fit);

  const kl = keyLight ?? {};
  const rawPos = kl.position ?? [6, 16, 8];
  const pos: [number, number, number] = [
    finiteOr(rawPos[0], 6),
    finiteOr(rawPos[1], 16),
    finiteOr(rawPos[2], 8),
  ];
  const reach = Math.max(finiteOr(fit.halfWidth, 5), finiteOr(fit.halfDepth, 5)) * 2.2 + 6;
  const safeReach = finiteOr(reach, 20);
  const intensity = finiteOr(kl.intensity, 1.85);
  const color = safeColor(kl.color, '#FFFFFF');

  return (
    <>
      <ambientLight intensity={finiteOr(ambient, 0.55)} />
      <hemisphereLight args={['#8FA6FF', '#241A33', 0.45]} />
      <directionalLight
        castShadow={!!shadows}
        color={color}
        position={pos}
        intensity={intensity}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-safeReach}
        shadow-camera-right={safeReach}
        shadow-camera-top={safeReach}
        shadow-camera-bottom={-safeReach}
        shadow-bias={-0.0012}
      />
      {/* background + fog is set in GameCanvas onCreated, but also set here as fallback */}
      <color attach="background" args={[background as any]} />
      <fog attach="fog" args={[background as any, 26, 70]} />
    </>
  );
}

export function useFitCamera(dir: [number, number, number], fit: StageFit) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const { halfWidth, halfDepth, height = 1, margin = 0.92 } = fit;

  useEffect(() => {
    try {
      const cam = camera as THREE.PerspectiveCamera;
      if (!cam.isPerspectiveCamera) return;
      if (size.width === 0 || size.height === 0) {
        console.warn('[Stage] size zero, skipping fit', size.width, size.height);
        return;
      }

      const [dx, dy, dz] = safeCameraDir(dir);
      const unit = new THREE.Vector3(dx, dy, dz).normalize();
      if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y) || !Number.isFinite(unit.z)) {
        console.warn('[Stage] unit vector non-finite, aborting fit');
        return;
      }

      const corners: THREE.Vector3[] = [];
      const hw = finiteOr(halfWidth, 5);
      const hd = finiteOr(halfDepth, 5);
      const h = finiteOr(height, 1);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          for (const y of [0, h]) {
            corners.push(new THREE.Vector3(sx * hw, y, sz * hd));
          }
        }
      }

      cam.aspect = size.width / size.height;

      let dist = Math.hypot(dx, dy, dz) || 20;
      dist = finiteOr(dist, 20);
      for (let i = 0; i < 18; i++) {
        dist = finiteOr(dist, 20);
        cam.position.copy(unit).multiplyScalar(dist);
        cam.lookAt(0, 0, 0);
        cam.near = Math.max(0.1, dist * 0.04);
        cam.far = dist * 3 + 60;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();

        let worst = 0;
        for (const c of corners) {
          try {
            const p = c.clone().project(cam);
            worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
          } catch {
            worst = NaN;
            break;
          }
        }
        if (!Number.isFinite(worst) || worst < 1e-9) break;
        if (Math.abs(worst - margin) < 0.004) break;
        dist = finiteOr((dist * worst) / margin, 20);
      }
    } catch (e) {
      console.error('[Stage] useFitCamera threw', e);
    }
  }, [camera, size.width, size.height, dir, halfWidth, halfDepth, height, margin]);
}
