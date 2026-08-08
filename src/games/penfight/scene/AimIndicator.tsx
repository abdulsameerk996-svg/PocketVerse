import React, { memo, type RefObject } from 'react';
import * as THREE from 'three';

/**
 * The aim guide: a shaft that grows with power and an arrowhead on the end.
 *
 * It lives in the scene rather than as a 2D overlay so it sits on the desk in
 * perspective — the player is judging a shot across a surface, and a flat line
 * drawn over the top would lie about the angle.
 *
 * Both meshes are unit-sized along +X and scaled/positioned by the arena driver,
 * so aiming costs no geometry rebuilds and no React renders.
 */

export const AIM_MIN = 0.9;
export const AIM_MAX = 4.3;

export type AimRefs = {
  group: RefObject<THREE.Group | null>;
  shaft: RefObject<THREE.Mesh | null>;
  head: RefObject<THREE.Mesh | null>;
};

export const AimIndicator = memo(function AimIndicator({ refs }: { refs: AimRefs }) {
  return (
    <group ref={refs.group} visible={false}>
      <mesh ref={refs.shaft} position={[0.5, 0.02, 0]}>
        {/* unit box along +X, origin at its left edge via the position offset */}
        <boxGeometry args={[1, 0.012, 0.075]} />
        <meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh ref={refs.head} position={[1, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.16, 0.4, 10]} />
        <meshBasicMaterial transparent opacity={0.95} toneMapped={false} />
      </mesh>
    </group>
  );
});
