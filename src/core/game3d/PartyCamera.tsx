import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { finiteOr } from './safety';

/**
 * Party camera: keeps all players visible, smooth follow, dynamic zoom based on spread.
 * - stable, no NaN, no explosion, no clipping, no black screen
 * - automatic arena framing
 * - smooth follow + zoom
 * - safe min/max distance
 */
type Props = {
  /** Refs to player positions — array of {x,z} or Vector3 */
  playerPositions: React.RefObject<{ x: number; z: number }[]>;
  /** Arena center, default 0,0 */
  center?: [number, number];
  /** Base height */
  baseHeight?: number;
  /** Min/max distance */
  minDist?: number;
  maxDist?: number;
  /** Smoothing */
  lerp?: number;
};

export function PartyCamera({
  playerPositions,
  center = [0, 0],
  baseHeight = 9,
  minDist = 6,
  maxDist = 22,
  lerp = 0.06,
}: Props) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());
  const currentPos = useRef(new THREE.Vector3(0, baseHeight, 10));

  useFrame((_, dt) => {
    try {
      const players = playerPositions.current;
      if (!players || players.length === 0) return;

      // compute centroid and spread
      let sumX = 0;
      let sumZ = 0;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let validCount = 0;
      for (const p of players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
        sumX += p.x;
        sumZ += p.z;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
        validCount++;
      }
      if (validCount === 0) return;
      const cx = sumX / validCount;
      const cz = sumZ / validCount;
      const spreadX = maxX - minX;
      const spreadZ = maxZ - minZ;
      const spread = Math.hypot(spreadX, spreadZ);

      // desired distance based on spread, clamped
      const desiredDist = finiteOr(baseHeight + spread * 0.7, baseHeight);
      const clampedDist = Math.max(minDist, Math.min(maxDist, desiredDist));

      // camera position: above centroid, looking at centroid, distance based on spread
      const angle = Math.PI / 2.8; // 3/4 view
      const camX = cx;
      const camZ = cz + clampedDist * 0.85;
      const camY = clampedDist;

      desiredPos.current.set(
        finiteOr(camX, center[0]),
        finiteOr(camY, baseHeight),
        finiteOr(camZ, center[1] + baseHeight),
      );
      target.current.set(finiteOr(cx, center[0]), 0, finiteOr(cz, center[1]));

      // smooth lerp
      const l = Math.min(1, lerp + dt * 2);
      currentPos.current.lerp(desiredPos.current, l);

      // safe final check
      if (!Number.isFinite(currentPos.current.x) || !Number.isFinite(currentPos.current.y) || !Number.isFinite(currentPos.current.z)) {
        currentPos.current.set(0, baseHeight, 10);
      }

      camera.position.copy(currentPos.current);
      camera.lookAt(target.current);
      camera.updateMatrixWorld();
    } catch (e) {
      console.error('[PartyCamera] frame error', e);
    }
  });

  return null;
}
