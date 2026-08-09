import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Stage } from '@/core/game3d';
import { PartyCharacter, PLAYER_COLORS } from '@/core/game3d/PartyCharacter';

export function PartyHubScene({ playerCount = 4 }: { playerCount?: number }) {
  const islandRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (islandRef.current) {
      islandRef.current.position.y = Math.sin(t * 0.4) * 0.08;
      islandRef.current.rotation.y = t * 0.05;
    }
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = t * 0.02;
    }
  });

  return (
    <Stage
      fit={{ halfWidth: 8, halfDepth: 8, height: 4, margin: 0.9 }}
      cameraDir={[0, 10, 12]}
      fov={52}
      background="#0E0B1F"
      ambient={0.7}
      keyLight={{ position: [6, 12, 6], intensity: 1.4, color: '#FFFFFF' }}
    >
      <group ref={islandRef} position={[0, -0.8, 0]}>
        <mesh receiveShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[5.5, 5.0, 1.2, 20]} />
          <meshStandardMaterial color="#2A1B4D" roughness={0.9} />
        </mesh>
        <mesh receiveShadow position={[0, 0.7, 0]}>
          <cylinderGeometry args={[5.2, 5.2, 0.6, 20]} />
          <meshStandardMaterial color="#3A2A6B" roughness={0.8} />
        </mesh>
        <mesh receiveShadow position={[0, 1.05, 0]}>
          <cylinderGeometry args={[5.15, 5.15, 0.3, 20]} />
          <meshStandardMaterial color="#4ADE80" roughness={0.7} emissive="#22C55E" emissiveIntensity={0.15} />
        </mesh>
        {[0, 1, 2, 3].map(i => {
          const ang = (i / 4) * Math.PI * 2;
          const x = Math.cos(ang) * 4.8;
          const z = Math.sin(ang) * 4.8;
          return (
            <group key={i} position={[x, 1.2, z]}>
              <mesh position={[0, 0.8, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 2, 6]} />
                <meshStandardMaterial color="#FFFFFF" />
              </mesh>
              <mesh position={[0.25, 1.4, 0]}>
                <planeGeometry args={[0.6, 0.4]} />
                <meshBasicMaterial color={PLAYER_COLORS[i].primary} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
      </group>

      {PLAYER_COLORS.slice(0, playerCount).map((c, i) => {
        const ang = (i / playerCount) * Math.PI * 2 - Math.PI / 2;
        const r = 2.2;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        return (
          <PartyCharacter
            key={c.id}
            position={[x, 0, z]}
            color={c}
            playerNumber={c.id}
            animation={i === 0 ? 'victory' : 'idle'}
            scale={1.1}
          />
        );
      })}

      <group ref={cloudsRef}>
        {Array.from({ length: 6 }, (_, i) => {
          const ang = (i / 6) * Math.PI * 2;
          const r = 9 + Math.random() * 2;
          const x = Math.cos(ang) * r;
          const z = Math.sin(ang) * r;
          const y = 3 + Math.random() * 2;
          return (
            <mesh key={i} position={[x, y, z]}>
              <sphereGeometry args={[0.8 + Math.random() * 0.5, 10, 8]} />
              <meshStandardMaterial color="#FFFFFF" transparent opacity={0.18} roughness={1} />
            </mesh>
          );
        })}
      </group>

      <points>
        <sphereGeometry args={[18, 16, 16]} />
        <pointsMaterial color="#7C5CFF" size={0.06} transparent opacity={0.25} />
      </points>
    </Stage>
  );
}
