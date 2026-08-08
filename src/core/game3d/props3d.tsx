import React, { memo, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * ============================================================================
 *  SHARED 3D PROPS
 * ============================================================================
 *
 * The PocketVerse look, as reusable geometry: stylised low-poly, clean shapes,
 * soft light, saturated accents on a near-black ground. All procedural — no
 * models, no textures, nothing to download — which is what keeps a game's
 * open cost to a handful of buffer geometries.
 */

/* ------------------------------------------------------------------ arena -- */

export type ArenaProps = {
  halfWidth: number;
  halfDepth: number;
  /** Rounded ends make a rink; false is a plain rectangle. */
  shape?: 'rect' | 'circle';
  accent: string;
  /** Surface tint. */
  surface?: string;
  /** Draw a halfway line across the short axis. */
  centreLine?: boolean;
  thickness?: number;
};

const RIM = 0.12;
const RIM_H = 0.18;

/** The slab every arena game is played on, with a legible glowing boundary. */
export const Arena = memo(function Arena({
  halfWidth,
  halfDepth,
  shape = 'rect',
  accent,
  surface = '#171226',
  centreLine = false,
  thickness = 0.5,
}: ArenaProps) {
  const radius = Math.min(halfWidth, halfDepth);

  return (
    <group>
      {shape === 'circle' ? (
        <>
          <mesh receiveShadow position={[0, -thickness / 2, 0]}>
            <cylinderGeometry args={[radius, radius * 0.94, thickness, 48]} />
            <meshStandardMaterial color="#2A2338" roughness={0.85} metalness={0.05} />
          </mesh>
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <circleGeometry args={[radius - RIM, 48]} />
            <meshStandardMaterial color={surface} roughness={0.95} />
          </mesh>
          <mesh position={[0, RIM_H / 2, 0]}>
            <torusGeometry args={[radius - RIM / 2, RIM / 2, 8, 64]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.7}
              roughness={0.4}
            />
          </mesh>
        </>
      ) : (
        <>
          <mesh receiveShadow position={[0, -thickness / 2, 0]}>
            <boxGeometry args={[halfWidth * 2, thickness, halfDepth * 2]} />
            <meshStandardMaterial color="#2A2338" roughness={0.85} metalness={0.05} />
          </mesh>
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
            <planeGeometry args={[halfWidth * 2 - RIM * 2, halfDepth * 2 - RIM * 2]} />
            <meshStandardMaterial color={surface} roughness={0.95} />
          </mesh>
          <RimBar x={0} z={-halfDepth + RIM / 2} lx={halfWidth * 2} accent={accent} />
          <RimBar x={0} z={halfDepth - RIM / 2} lx={halfWidth * 2} accent={accent} />
          <RimBar x={-halfWidth + RIM / 2} z={0} lz={halfDepth * 2} accent={accent} />
          <RimBar x={halfWidth - RIM / 2} z={0} lz={halfDepth * 2} accent={accent} />
        </>
      )}

      {centreLine ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <planeGeometry args={[halfWidth * 2 - RIM * 3, 0.05]} />
          <meshStandardMaterial color={accent} transparent opacity={0.3} />
        </mesh>
      ) : null}

      {/* Floor far below, so anything knocked off falls into something. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -7, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#08060F" roughness={1} />
      </mesh>
    </group>
  );
});

const RimBar = memo(function RimBar({
  x,
  z,
  lx,
  lz,
  accent,
}: {
  x: number;
  z: number;
  lx?: number;
  lz?: number;
  accent: string;
}) {
  return (
    <mesh position={[x, RIM_H / 2, z]}>
      <boxGeometry args={[lx ?? RIM, RIM_H, lz ?? RIM]} />
      <meshStandardMaterial
        color={accent}
        emissive={accent}
        emissiveIntensity={0.6}
        roughness={0.4}
      />
    </mesh>
  );
});

/* -------------------------------------------------------------- character -- */

export type CharacterStyle = {
  body: string;
  accent: string;
  /** 'round' | 'block' | 'spike' — enough variety to tell rivals apart. */
  shape?: 'round' | 'block' | 'spike';
};

export type CharacterProps = {
  groupRef: RefObject<THREE.Group | null>;
  style: CharacterStyle;
  radius?: number;
  /** Gentle idle bob + squash. Disable for objects that should sit still. */
  idle?: boolean;
  /** Phase offset so two characters do not bob in lockstep. */
  phase?: number;
};

/**
 * A little arcade figure: rounded body, head, two eyes, a colour accent.
 * Deliberately abstract — expressive at 40px on a phone, and it never needs an
 * artist to produce a variant, just a different `style`.
 */
export const Character = memo(function Character({
  groupRef,
  style,
  radius = 0.5,
  idle = true,
  phase = 0,
}: CharacterProps) {
  const inner = useRef<THREE.Group>(null);
  const shape = style.shape ?? 'round';

  useFrame((state) => {
    if (!idle || !inner.current) return;
    const t = state.clock.elapsedTime + phase;
    inner.current.position.y = Math.sin(t * 2.4) * radius * 0.07;
    const squash = 1 + Math.sin(t * 2.4) * 0.035;
    inner.current.scale.set(1 / squash, squash, 1 / squash);
  });

  const bodyGeo = useMemo(() => {
    if (shape === 'block') return new THREE.BoxGeometry(radius * 1.6, radius * 1.7, radius * 1.6);
    if (shape === 'spike') return new THREE.ConeGeometry(radius, radius * 2.1, 6);
    return new THREE.CapsuleGeometry(radius * 0.82, radius * 0.8, 4, 12);
  }, [radius, shape]);

  return (
    <group ref={groupRef}>
      <group ref={inner}>
        <mesh castShadow geometry={bodyGeo} position={[0, radius, 0]}>
          <meshStandardMaterial color={style.body} roughness={0.55} metalness={0.08} />
        </mesh>

        {/* head */}
        <mesh castShadow position={[0, radius * 2.05, 0]}>
          <sphereGeometry args={[radius * 0.6, 16, 12]} />
          <meshStandardMaterial color={style.body} roughness={0.5} />
        </mesh>

        {/* eyes — the whole personality, for two spheres */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * radius * 0.24, radius * 2.14, radius * 0.5]}>
            <sphereGeometry args={[radius * 0.13, 10, 8]} />
            <meshStandardMaterial color="#0B0A12" roughness={0.3} />
          </mesh>
        ))}

        {/* accent band / visor */}
        <mesh position={[0, radius * 1.28, 0]}>
          <torusGeometry args={[radius * 0.86, radius * 0.1, 8, 20]} />
          <meshStandardMaterial
            color={style.accent}
            emissive={style.accent}
            emissiveIntensity={0.45}
            roughness={0.4}
          />
        </mesh>
      </group>
    </group>
  );
});

/* ---------------------------------------------------------------- sparks -- */

export type SparksHandle = {
  burst: (x: number, y: number, z: number, color: string, count?: number, power?: number) => void;
};

/**
 * A fixed pool of particles with an imperative `burst`.
 *
 * Pooled rather than mounted per effect: a collision-heavy game would otherwise
 * mount and unmount dozens of meshes a second, which is the classic way an
 * arcade game develops a stutter.
 */
export const Sparks = memo(function Sparks({
  handle,
  size = 0.11,
  count = 64,
}: {
  handle: RefObject<SparksHandle | null>;
  size?: number;
  count?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);

  const parts = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, ttl: 1,
      })),
    [count],
  );
  const cursor = useRef(0);

  // Expose burst() without re-rendering anything.
  if (handle) {
    handle.current = {
      burst(x, y, z, color, n = 10, power = 3) {
        const m = mesh.current;
        for (let i = 0; i < n; i++) {
          const p = parts[cursor.current % parts.length];
          cursor.current += 1;
          const a = Math.random() * Math.PI * 2;
          const up = 0.35 + Math.random() * 0.9;
          const sp = power * (0.5 + Math.random() * 0.8);
          p.x = x;
          p.y = y;
          p.z = z;
          p.vx = Math.cos(a) * sp;
          p.vy = up * sp;
          p.vz = Math.sin(a) * sp;
          p.ttl = 0.35 + Math.random() * 0.35;
          p.life = p.ttl;
          if (m) m.setColorAt(cursor.current % parts.length, colour.set(color));
        }
        if (m && m.instanceColor) m.instanceColor.needsUpdate = true;
      },
    };
  }

  useFrame((_s, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.ttl);
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(k * k);
      } else {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[size, 0]} />
      <meshStandardMaterial
        emissive="#FFFFFF"
        emissiveIntensity={0.7}
        roughness={0.4}
        toneMapped={false}
      />
    </instancedMesh>
  );
});
