import React, { memo } from 'react';
import { TABLE, TABLE_THICKNESS } from '../content';

/**
 * The desk.
 *
 * The play surface sits at y = 0 — the solver's plane — with the slab hanging
 * below it, so simulation coordinates and world coordinates are the same
 * numbers and nothing has to be converted.
 *
 * The rim is four thin emissive bars rather than a texture. That is the one
 * piece of the scene the player genuinely has to read under pressure: where the
 * edge is, and therefore how close a pen is to going over.
 */

const RIM = 0.07;
const RIM_H = 0.05;

export const Desk = memo(function Desk({ accent }: { accent: string }) {
  const w = TABLE.halfW;
  const d = TABLE.halfD;

  return (
    <group>
      {/* slab */}
      <mesh receiveShadow position={[0, -TABLE_THICKNESS / 2, 0]}>
        <boxGeometry args={[w * 2, TABLE_THICKNESS, d * 2]} />
        <meshStandardMaterial color="#2B2436" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* felt play surface, a hair above the slab to avoid z-fighting */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[w * 2 - RIM * 2, d * 2 - RIM * 2]} />
        <meshStandardMaterial color="#1A1526" roughness={0.95} metalness={0} />
      </mesh>

      {/* centre line — a visual halfway mark, purely for orientation */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[w * 2 - RIM * 4, 0.02]} />
        <meshStandardMaterial color={accent} transparent opacity={0.22} />
      </mesh>

      {/* rim — the boundary the whole game is about */}
      <RimBar x={0} z={-d + RIM / 2} lengthX={w * 2} accent={accent} />
      <RimBar x={0} z={d - RIM / 2} lengthX={w * 2} accent={accent} />
      <RimBar x={-w + RIM / 2} z={0} lengthZ={d * 2} accent={accent} />
      <RimBar x={w - RIM / 2} z={0} lengthZ={d * 2} accent={accent} />

      {/* floor far below, so a knocked-off pen falls into something */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -4.3, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0A0A12" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
});

const RimBar = memo(function RimBar({
  x,
  z,
  lengthX,
  lengthZ,
  accent,
}: {
  x: number;
  z: number;
  lengthX?: number;
  lengthZ?: number;
  accent: string;
}) {
  return (
    <mesh position={[x, RIM_H / 2, z]}>
      <boxGeometry args={[lengthX ?? RIM, RIM_H, lengthZ ?? RIM]} />
      <meshStandardMaterial
        color={accent}
        emissive={accent}
        emissiveIntensity={0.55}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
});
