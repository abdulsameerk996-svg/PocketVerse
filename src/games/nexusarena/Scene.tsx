import React, { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Stage } from '@/core/game3d';
import { ARENA_RADIUS } from './content';
import { finiteOr } from '@/core/game3d/safety';

/**
 * Nexus Arena — original sci-fi fantasy: floating platforms, glowing energy channels,
 * ancient stone, neon accents, central power core, bridges, ramps, crystals, particles.
 * One beautiful arena, not four mediocre.
 */
export const NexusArenaScene = memo(function NexusArenaScene({
  time = 0,
  paused = false,
  children,
}: {
  time?: number;
  paused?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Stage
      fit={{ halfWidth: ARENA_RADIUS + 1.5, halfDepth: ARENA_RADIUS + 1.5, height: 3.5, margin: 0.88 }}
      cameraDir={[0, 11, 9]}
      fov={52}
      background="#0A0B1A"
      ambient={0.68}
      keyLight={{ position: [6, 14, 5], intensity: 1.5, color: '#FFFFFF' }}
      paused={paused}
    >
      <ArenaGeometry time={time} />
      {children}
    </Stage>
  );
});

function ArenaGeometry({ time }: { time: number }) {
  const coreRef = useRef<THREE.Group>(null);
  const crystalsRef = useRef<THREE.Group>(null);
  const energyRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.18;
      coreRef.current.position.y = Math.sin(t * 0.6) * 0.12 + 0.9;
    }
    if (crystalsRef.current) {
      crystalsRef.current.rotation.y = t * 0.06;
    }
    if (energyRef.current) {
      const mat = energyRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + Math.sin(t * 2) * 0.08;
    }
  });

  const platforms = useMemo(() => {
    // 4 cardinal platforms + central
    const out: { x: number; z: number; r: number; h: number; color: string }[] = [];
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (let i = 0; i < 4; i++) {
      const ang = angles[i];
      const r = ARENA_RADIUS * 0.58;
      out.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, r: 1.6, h: 0.45, color: '#2A2A4A' });
    }
    // small bridges
    return out;
  }, []);

  return (
    <group>
      {/* Floating island base */}
      <mesh receiveShadow position={[0, -0.7, 0]}>
        <cylinderGeometry args={[ARENA_RADIUS + 0.8, ARENA_RADIUS * 0.9, 1.2, 24]} />
        <meshStandardMaterial color="#1B1840" roughness={0.9} metalness={0.05} />
      </mesh>
      {/* Main floor */}
      <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ARENA_RADIUS, 32]} />
        <meshStandardMaterial color="#2E2A5A" roughness={0.75} metalness={0.1} />
      </mesh>
      {/* Inner decorative ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.72, ARENA_RADIUS * 0.75, 32]} />
        <meshBasicMaterial color="#7C5CFF" transparent opacity={0.22} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]}>
        <ringGeometry args={[ARENA_RADIUS * 0.35, ARENA_RADIUS * 0.38, 32]} />
        <meshBasicMaterial color="#22D3EE" transparent opacity={0.18} />
      </mesh>

      {/* Central power core — landmark */}
      <group ref={coreRef} position={[0, 0.9, 0]}>
        <mesh castShadow>
          <octahedronGeometry args={[0.65, 0]} />
          <meshStandardMaterial color="#FFD166" emissive="#FFD166" emissiveIntensity={1.2} roughness={0.3} />
        </mesh>
        <mesh>
          <octahedronGeometry args={[0.85, 0]} />
          <meshBasicMaterial color="#FFD166" transparent opacity={0.14} wireframe />
        </mesh>
        {/* energy channels */}
        <mesh ref={energyRef as any} position={[0, 0, 0]}>
          <torusGeometry args={[1.1, 0.06, 8, 24]} />
          <meshBasicMaterial color="#22D3EE" transparent opacity={0.25} />
        </mesh>
      </group>

      {/* Platforms */}
      {platforms.map((p, i) => (
        <group key={i} position={[p.x, p.h / 2, p.z]}>
          <mesh receiveShadow castShadow>
            <cylinderGeometry args={[p.r, p.r * 0.9, p.h, 16]} />
            <meshStandardMaterial color={p.color} roughness={0.8} />
          </mesh>
          <mesh position={[0, p.h / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[p.r * 0.85, 16]} />
            <meshStandardMaterial color="#4ADE80" emissive="#22C55E" emissiveIntensity={0.12} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Bridges — small ramps */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ang, i) => (
        <mesh key={`b${i}`} position={[Math.cos(ang) * ARENA_RADIUS * 0.29, 0.18, Math.sin(ang) * ARENA_RADIUS * 0.29]} rotation={[0, -ang, -0.18]}>
          <boxGeometry args={[2.2, 0.12, 0.9]} />
          <meshStandardMaterial color="#3A2A6B" roughness={0.7} />
        </mesh>
      ))}

      {/* Crystals — decorative */}
      <group ref={crystalsRef}>
        {Array.from({ length: 8 }, (_, i) => {
          const ang = (i / 8) * Math.PI * 2;
          const r = ARENA_RADIUS * (0.75 + (i % 2) * 0.15);
          const x = Math.cos(ang) * r;
          const z = Math.sin(ang) * r;
          return (
            <group key={i} position={[x, 0.2, z]}>
              <mesh castShadow position={[0, 0.6, 0]}>
                <octahedronGeometry args={[0.22 + (i % 3) * 0.08, 0]} />
                <meshStandardMaterial color={i % 2 === 0 ? '#22D3EE' : '#A78BFA'} emissive={i % 2 === 0 ? '#22D3EE' : '#A78BFA'} emissiveIntensity={0.5} roughness={0.4} />
              </mesh>
              <mesh position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.12, 0.14, 0.28, 8]} />
                <meshStandardMaterial color="#2A2A4A" />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Boundaries — glowing rim + ancient stone pillars */}
      <mesh position={[0, 0.45, 0]}>
        <torusGeometry args={[ARENA_RADIUS, 0.14, 10, 48]} />
        <meshStandardMaterial color="#7C5CFF" emissive="#7C5CFF" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const ang = (i / 12) * Math.PI * 2;
        const x = Math.cos(ang) * ARENA_RADIUS;
        const z = Math.sin(ang) * ARENA_RADIUS;
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <boxGeometry args={[0.32, 1.8, 0.32]} />
              <meshStandardMaterial color="#3A2A6B" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.95, 0]}>
              <sphereGeometry args={[0.18, 10, 8]} />
              <meshStandardMaterial color="#FFD166" emissive="#FFD166" emissiveIntensity={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* Lava / void below */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0F0A1A" emissive="#1A0A2A" emissiveIntensity={0.2} roughness={1} />
      </mesh>

      {/* Atmospheric particles */}
      <points>
        <sphereGeometry args={[ARENA_RADIUS * 1.2, 12, 12]} />
        <pointsMaterial color="#7C5CFF" size={0.05} transparent opacity={0.18} sizeAttenuation />
      </points>
    </group>
  );
}
