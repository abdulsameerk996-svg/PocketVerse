import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Stage } from './Stage';
import { finiteOr, safePosition } from './safety';

/**
 * Extremely simple fallback scene that MUST render if everything else fails.
 * No instancing, no complex materials, just:
 * - plane
 * - box (player)
 * - sphere (enemy)
 * - ambient + directional light
 * - perspective camera via Stage
 *
 * If this cannot render, the problem is Canvas/renderer itself, not game logic.
 */
export function FallbackScene({ message = 'FALLBACK ARENA' }: { message?: string }) {
  const boxRef = useRef<THREE.Mesh>(null);
  const sphereRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (boxRef.current) {
      const [x, y, z] = safePosition(Math.sin(t * 0.6) * 1.2, 0.5, Math.cos(t * 0.6) * 1.2);
      boxRef.current.position.set(finiteOr(x, 0), 0.5, finiteOr(z, 0));
      boxRef.current.rotation.y = t;
    }
    if (sphereRef.current) {
      const [x, y, z] = safePosition(Math.cos(t * 0.8) * 3, 0.5, Math.sin(t * 0.8) * 3);
      sphereRef.current.position.set(finiteOr(x, 3), 0.5, finiteOr(z, 0));
    }
  });

  return (
    <Stage
      fit={{ halfWidth: 6, halfDepth: 6, height: 2, margin: 0.9 }}
      cameraDir={[0, 8, 8]}
      fov={50}
      background="#0A0A18"
      ambient={0.8}
      keyLight={{ position: [4, 10, 4], intensity: 1.2 }}
    >
      {/* floor - guaranteed visible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshBasicMaterial color="#1A1A2E" />
      </mesh>
      {/* grid helper as additional guarantee */}
      <gridHelper args={[12, 12, '#2A2A44', '#1E1E32']} position={[0, 0.01, 0]} />

      {/* player capsule equiv - box */}
      <mesh ref={boxRef} castShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#4ADE80" roughness={0.5} />
      </mesh>

      {/* enemy - sphere */}
      <mesh ref={sphereRef} castShadow position={[3, 0.5, 0]}>
        <sphereGeometry args={[0.35, 16, 12]} />
        <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={0.3} />
      </mesh>

      {/* extra guaranteed lights (Stage already has lights, but double up) */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
    </Stage>
  );
}

/**
 * Diagnostic overlay data for Canvas existence checks.
 * Returns true if WebGL context likely exists (checks for renderer).
 */
export function diagnoseRenderer(gl: THREE.WebGLRenderer | any): { ok: boolean; info: string } {
  try {
    if (!gl) return { ok: false, info: 'gl is null' };
    const canvas = gl.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return { ok: true, info: 'native GL (no domElement), assuming ok' };
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return { ok: false, info: `canvas ${w}x${h} zero size` };
    return { ok: true, info: `canvas ${w}x${h}` };
  } catch (e: any) {
    return { ok: false, info: `diagnose exception: ${e?.message ?? e}` };
  }
}
