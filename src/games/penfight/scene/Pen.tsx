import React, { memo, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { PenSkin } from '../content';
import { PEN_LENGTH, PEN_RADIUS } from '../physics';

/**
 * A pen, built out of four primitives.
 *
 * Deliberately low-poly and procedural: no GLTF, no textures, nothing to load
 * or decode when the game opens. Twelve radial segments is plenty at the size a
 * pen occupies on a phone, and it keeps the whole arena under a handful of
 * draw calls.
 *
 * The pen lies along its own local +X so that the solver's `angle` maps to a
 * single Y rotation. Transforms are written by the arena driver every frame;
 * this component never re-renders during play.
 */

const BARREL_LEN = PEN_LENGTH * 0.62;
const TIP_LEN = PEN_LENGTH * 0.2;
const CAP_LEN = PEN_LENGTH * 0.18;
const SEGMENTS = 12;

export type PenProps = {
  /** Outer group: world position + heading. */
  bodyRef: RefObject<THREE.Group | null>;
  /** Inner group: tumble, applied only while the pen is falling off the desk. */
  tiltRef: RefObject<THREE.Group | null>;
  skin: PenSkin;
};

export const Pen = memo(function Pen({ bodyRef, tiltRef, skin }: PenProps) {
  // Geometry is shared per skin instance and disposed with the component by
  // R3F, so nothing here survives leaving the game.
  const barrelGeo = useMemo(
    () => new THREE.CylinderGeometry(PEN_RADIUS, PEN_RADIUS, BARREL_LEN, SEGMENTS),
    [],
  );
  const tipGeo = useMemo(
    () => new THREE.ConeGeometry(PEN_RADIUS * 0.98, TIP_LEN, SEGMENTS),
    [],
  );
  const capGeo = useMemo(
    () => new THREE.CylinderGeometry(PEN_RADIUS * 1.12, PEN_RADIUS * 1.02, CAP_LEN, SEGMENTS),
    [],
  );
  const clipGeo = useMemo(
    () => new THREE.BoxGeometry(CAP_LEN * 0.9, PEN_RADIUS * 0.34, PEN_RADIUS * 0.5),
    [],
  );

  const half = PEN_LENGTH / 2;
  const emissive = skin.glow || '#000000';
  const emissiveIntensity = skin.glow ? 0.75 : 0;

  return (
    <group ref={bodyRef}>
      <group ref={tiltRef}>
        {/* barrel — rotated so the cylinder's Y axis becomes the pen's X axis */}
        <mesh castShadow geometry={barrelGeo} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial
            color={skin.body}
            metalness={skin.metalness}
            roughness={skin.roughness}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>

        {/* writing tip */}
        <mesh
          castShadow
          geometry={tipGeo}
          position={[half - TIP_LEN / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <meshStandardMaterial color={skin.accent} metalness={0.6} roughness={0.3} />
        </mesh>

        {/* butt cap */}
        <mesh
          castShadow
          geometry={capGeo}
          position={[-half + CAP_LEN / 2, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <meshStandardMaterial
            color={skin.accent}
            metalness={skin.metalness}
            roughness={skin.roughness}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity * 0.6}
          />
        </mesh>

        {/* pocket clip — the silhouette detail that makes it read as a pen */}
        <mesh
          castShadow
          geometry={clipGeo}
          position={[-half + CAP_LEN * 1.1, PEN_RADIUS * 0.95, 0]}
        >
          <meshStandardMaterial color={skin.accent} metalness={0.75} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
});
