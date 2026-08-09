import React, { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { finiteOr, safePosition } from './safety';

export type PlayerColor = {
  id: number;
  name: string;
  primary: string;
  accent: string;
  icon: string;
};

export const PLAYER_COLORS: PlayerColor[] = [
  { id: 1, name: 'P1', primary: '#FF6B6B', accent: '#FF9E9E', icon: '🔴' },
  { id: 2, name: 'P2', primary: '#4EA8FF', accent: '#89C4FF', icon: '🔵' },
  { id: 3, name: 'P3', primary: '#4ADE80', accent: '#86EFAC', icon: '🟢' },
  { id: 4, name: 'P4', primary: '#FFD166', accent: '#FDE68A', icon: '🟡' },
];

export type PartyCharProps = {
  position?: [number, number, number];
  color: PlayerColor;
  skin?: string; // hat etc
  animation?: 'idle' | 'run' | 'jump' | 'fall' | 'victory' | 'defeat' | 'dash';
  scale?: number;
  playerNumber?: number;
};

export const PartyCharacter = memo(function PartyCharacter({
  position = [0, 0, 0],
  color,
  skin,
  animation = 'idle',
  scale = 1,
  playerNumber,
}: PartyCharProps) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);

  const safePos = safePosition(position[0], 0, position[2], [0, 0, 0]);
  const safeScale = finiteOr(scale, 1);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!group.current) return;
    const g = group.current;
    // finite guard
    g.position.set(finiteOr(safePos[0], 0), finiteOr(position[1] ?? 0, 0), finiteOr(safePos[2], 0));
    g.scale.setScalar(finiteOr(safeScale, 1));

    // animations
    const bob = Math.sin(t * 2.2 + color.id) * 0.06;
    const runCycle = Math.sin(t * 10 + color.id);
    const run = animation === 'run';
    const jump = animation === 'jump';
    const fall = animation === 'fall';

    if (head.current) {
      head.current.position.y = 1.15 + (run ? Math.abs(runCycle) * 0.06 : bob * 0.5);
      head.current.rotation.z = run ? runCycle * 0.1 : 0;
    }
    if (leftArm.current && rightArm.current) {
      if (run) {
        leftArm.current.rotation.x = runCycle * 0.8;
        rightArm.current.rotation.x = -runCycle * 0.8;
      } else if (animation === 'victory') {
        leftArm.current.rotation.z = -0.8 + Math.sin(t * 5) * 0.2;
        rightArm.current.rotation.z = 0.8 - Math.sin(t * 5) * 0.2;
        leftArm.current.rotation.x = -0.5;
        rightArm.current.rotation.x = -0.5;
      } else if (fall) {
        leftArm.current.rotation.x = Math.sin(t * 12) * 0.5;
        rightArm.current.rotation.x = Math.sin(t * 12 + 1) * 0.5;
      } else {
        leftArm.current.rotation.x = Math.sin(t * 1.2 + color.id) * 0.15;
        rightArm.current.rotation.x = Math.sin(t * 1.2 + color.id + 1) * 0.15;
      }
    }
    if (leftLeg.current && rightLeg.current) {
      if (run) {
        leftLeg.current.rotation.x = -runCycle * 0.7;
        rightLeg.current.rotation.x = runCycle * 0.7;
      } else if (jump) {
        leftLeg.current.rotation.x = -0.4;
        rightLeg.current.rotation.x = -0.4;
      } else if (fall) {
        leftLeg.current.rotation.x = 0.6 + Math.sin(t * 10) * 0.3;
        rightLeg.current.rotation.x = 0.6 - Math.sin(t * 10) * 0.3;
      } else {
        leftLeg.current.rotation.x = Math.sin(t * 0.8 + color.id) * 0.05;
        rightLeg.current.rotation.x = Math.sin(t * 0.8 + color.id + 1) * 0.05;
      }
    }

    // squash/stretch on jump
    if (jump) {
      const s = 1 + Math.sin(t * 12) * 0.08;
      g.scale.set(safeScale / s, safeScale * s, safeScale / s);
    }
  });

  return (
    <group ref={group} position={position as any} scale={scale}>
      {/* shadow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45 * scale, 14]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} />
      </mesh>

      {/* body */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.32, 0.5, 4, 10]} />
        <meshStandardMaterial color={color.primary} roughness={0.5} metalness={0.05} />
      </mesh>

      {/* head */}
      <group ref={head} position={[0, 1.15, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.36, 16, 12]} />
          <meshStandardMaterial color="#FFE8CC" roughness={0.6} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.11, 0.08, 0.28]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color="#0B0A12" />
        </mesh>
        <mesh position={[0.11, 0.08, 0.28]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color="#0B0A12" />
        </mesh>
        {/* smile */}
        <mesh position={[0, -0.12, 0.28]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.12, 0.02, 6, 12, Math.PI]} />
          <meshBasicMaterial color="#5A2A2A" />
        </mesh>
        {/* hat/accessory */}
        {skin ? (
          <mesh position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.18, 12]} />
            <meshStandardMaterial color={color.accent} />
          </mesh>
        ) : null}
      </group>

      {/* arms */}
      <group ref={leftArm} position={[-0.42, 0.6, 0]}>
        <mesh castShadow position={[0, -0.25, 0]}>
          <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
          <meshStandardMaterial color="#FFE8CC" />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.42, 0.6, 0]}>
        <mesh castShadow position={[0, -0.25, 0]}>
          <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
          <meshStandardMaterial color="#FFE8CC" />
        </mesh>
      </group>

      {/* legs */}
      <group ref={leftLeg} position={[-0.16, 0.22, 0]}>
        <mesh castShadow position={[0, -0.28, 0]}>
          <capsuleGeometry args={[0.11, 0.4, 4, 8]} />
          <meshStandardMaterial color={color.accent} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.16, 0.22, 0]}>
        <mesh castShadow position={[0, -0.28, 0]}>
          <capsuleGeometry args={[0.11, 0.4, 4, 8]} />
          <meshStandardMaterial color={color.accent} />
        </mesh>
      </group>

      {/* player ring + number + nameplate */}
      <group position={[0, 0.02, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.58, 16]} />
          <meshBasicMaterial color={color.primary} transparent opacity={0.85} />
        </mesh>
        {playerNumber ? (
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 0.3]} />
            <meshBasicMaterial color="#000" transparent opacity={0.0} />
          </mesh>
        ) : null}
      </group>
    </group>
  );
});

export const CHARACTER_SKINS = [
  { id: 'default', name: 'Pocket', glyph: '🧢', color: '#FFD166' },
  { id: 'ninja', name: 'Ninja', glyph: '🥷', color: '#7C5CFF' },
  { id: 'astro', name: 'Astro', glyph: '👨‍🚀', color: '#4EA8FF' },
  { id: 'pharaoh', name: 'Pharaoh', glyph: '👑', color: '#FFD166' },
  { id: 'ghost', name: 'Ghost', glyph: '👻', color: '#A9E7FF' },
  { id: 'robot', name: 'Robot', glyph: '🤖', color: '#A0A0BF' },
  { id: 'dragon', name: 'Dragon', glyph: '🐉', color: '#FF6B6B' },
  { id: 'cat', name: 'Cat', glyph: '🐱', color: '#FFB443' },
];
