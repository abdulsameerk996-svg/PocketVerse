import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { GameState, GeneratorId } from '../types';
import { GENERATORS, BUILDING } from '../data';

/**
 * 3D Café Tycoon — the real3D building view.
 *
 * Renders a multi-story café building where:
 * - Each floor has walls, equipment blocks, and walking characters
 * - The building grows taller as you buy floors
 * - Equipment appears as colored 3D blocks
 * - Barista capsule-characters walk between stations
 * - Ground plane with a street
 * - Camera orbits the building
 */

const FLOOR_HEIGHT = 1.6;
const FLOOR_DEPTH = 3;
const SLOT_WIDTH = 1.2;
const WALL_THICKNESS = 0.15;
const WALL_HEIGHT = FLOOR_HEIGHT * 0.85;

/* ---- Equipment color map ---- */
const EQUIP_COLORS: Record<GeneratorId, string> = {
  barista: '#6FD3C0',
  fryer: '#FF8FB3',
  display: '#FFD166',
  drive: '#7FD8A0',
  roaster: '#C9823F',
  van: '#8AB8E8',
  franchise: '#E8934A',
  robo: '#D98BD8',
};

const EQUIP_LABELS: Record<GeneratorId, string> = {
  barista: '☕',
  fryer: '🍩',
  display: '🧁',
  drive: '🚗',
  roaster: '🫘',
  van: '🚐',
  franchise: '🏪',
  robo: '🤖',
};

/* ---- Single equipment block ---- */
function EquipmentBlock({
  generatorId,
  position,
}: {
  generatorId: GeneratorId;
  position: [number, number, number];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  const color = EQUIP_COLORS[generatorId] || '#ffffff';
  return (
    <group position={position}>
      <RoundedBox
        ref={meshRef}
        args={[0.5, 0.5, 0.5]}
        radius={0.08}
        smoothness={4}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.2}
          metalness={0.3}
          roughness={0.4}
        />
      </RoundedBox>
      {/* Label above equipment */}
      <Text
        position={[0, 0.45, 0]}
        fontSize={0.3}
        anchorX="center"
        anchorY="bottom"
      >
        {EQUIP_LABELS[generatorId]}
      </Text>
    </group>
  );
}

/* ---- Walking barista character ---- */
function BaristaCharacter({
  position,
  floorWidth,
  slotIndex,
  hue,
}: {
  position: [number, number, number];
  floorWidth: number;
  slotIndex: number;
  hue: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(Math.random() * Math.PI * 2);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    timeRef.current += delta * 1.5;

    // Walk back and forth on the floor
    const halfW = (floorWidth * SLOT_WIDTH) / 2;
    const targetX = Math.sin(timeRef.current) * (halfW - 0.5);
    const current = groupRef.current.position.x;
    groupRef.current.position.x = THREE.MathUtils.lerp(current, targetX, delta * 3);

    // Subtle bob while walking
    groupRef.current.position.y = position[1] + Math.abs(Math.sin(timeRef.current * 3)) * 0.05;
  });

  const bodyColor = new THREE.Color().setHSL(hue / 360, 0.6, 0.55);
  const headColor = new THREE.Color().setHSL(hue / 360, 0.4, 0.8);

  return (
    <group ref={groupRef} position={position}>
      {/* Body (capsule shape via cylinder + spheres) */}
      <mesh position={[0, 0.25, 0]}>
        <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
        <meshStandardMaterial color={bodyColor} metalness={0.1} roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color={headColor} metalness={0.1} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ---- Single floor of the building ---- */
function BuildingFloor({
  floorIndex,
  width,
  equipment,
  baristaCount,
  totalFloors,
}: {
  floorIndex: number;
  width: number;
  equipment: { id: GeneratorId; slot: number }[];
  baristaCount: number;
  totalFloors: number;
}) {
  const y = floorIndex * FLOOR_HEIGHT;
  const buildingWidth = width * SLOT_WIDTH;

  // Equipment positions
  const equipPositions = equipment.map((e) => ({
    id: e.id,
    pos: [
      (e.slot - (width - 1) / 2) * SLOT_WIDTH,
      y + 0.4,
      0,
    ] as [number, number, number],
  }));

  // Barista characters
  const baristas = Array.from({ length: baristaCount }, (_, i) => ({
    hue: (i * 47) % 360,
    slot: i % width,
    pos: [
      ((i % width) - (width - 1) / 2) * SLOT_WIDTH,
      y + 0.3,
      0.3,
    ] as [number, number, number],
  }));

  const floorColor = floorIndex % 2 === 0 ? '#3E2A1A' : '#4A3428';

  return (
    <group>
      {/* Floor slab */}
      <RoundedBox
        position={[0, y, 0]}
        args={[buildingWidth + 0.6, 0.15, FLOOR_DEPTH + 0.4]}
        radius={0.05}
        smoothness={2}
      >
        <meshStandardMaterial color={floorColor} metalness={0.2} roughness={0.8} />
      </RoundedBox>

      {/* Back wall */}
      <RoundedBox
        position={[0, y + FLOOR_HEIGHT / 2, -(FLOOR_DEPTH / 2 + 0.1)]}
        args={[buildingWidth + 0.4, WALL_HEIGHT, WALL_THICKNESS]}
        radius={0.02}
        smoothness={1}
      >
        <meshStandardMaterial
          color="#5C3D2E"
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.85}
        />
      </RoundedBox>

      {/* Left wall */}
      <RoundedBox
        position={[-(buildingWidth / 2 + 0.2), y + FLOOR_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, WALL_HEIGHT, FLOOR_DEPTH + 0.2]}
        radius={0.02}
        smoothness={1}
      >
        <meshStandardMaterial
          color="#5C3D2E"
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.7}
        />
      </RoundedBox>

      {/* Right wall */}
      <RoundedBox
        position={[(buildingWidth / 2 + 0.2), y + FLOOR_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, WALL_HEIGHT, FLOOR_DEPTH + 0.2]}
        radius={0.02}
        smoothness={1}
      >
        <meshStandardMaterial
          color="#5C3D2E"
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.7}
        />
      </RoundedBox>

      {/* Floor label */}
      <Text
        position={[-(buildingWidth / 2 + 0.5), y + 0.3, -(FLOOR_DEPTH / 2 + 0.15)]}
        fontSize={0.2}
        color="#96795C"
        anchorX="center"
        anchorY="middle"
      >
        F{floorIndex + 1}
      </Text>

      {/* Equipment blocks */}
      {equipPositions.map((e) => (
        <EquipmentBlock key={`${floorIndex}-${e.id}-${e.pos[0]}`} generatorId={e.id} position={e.pos} />
      ))}

      {/* Barista characters */}
      {baristas.map((b, i) => (
        <BaristaCharacter
          key={`b-${floorIndex}-${i}`}
          position={b.pos}
          floorWidth={width}
          slotIndex={b.slot}
          hue={b.hue}
        />
      ))}
    </group>
  );
}

/* ---- Building roof ---- */
function BuildingRoof({ width, floorCount }: { width: number; floorCount: number }) {
  const buildingWidth = width * SLOT_WIDTH;
  const y = floorCount * FLOOR_HEIGHT;

  return (
    <group>
      {/* Roof slab */}
      <RoundedBox
        position={[0, y + 0.08, 0]}
        args={[buildingWidth + 0.8, 0.2, FLOOR_DEPTH + 0.6]}
        radius={0.1}
        smoothness={2}
      >
        <meshStandardMaterial color="#6B4423" metalness={0.3} roughness={0.6} />
      </RoundedBox>
      {/* Sign */}
      <Text
        position={[0, y + 0.5, FLOOR_DEPTH / 2 + 0.3]}
        fontSize={0.35}
        color="#FFD98A"
        anchorX="center"
        anchorY="bottom"
        font="https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2"
      >
        CAFÉ TYCOON
      </Text>
    </group>
  );
}

/* ---- Ground plane ---- */
function Ground() {
  return (
    <group>
      {/* Sidewalk */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[20, 0.1, 12]} />
        <meshStandardMaterial color="#6B5744" />
      </mesh>
      {/* Road */}
      <mesh position={[0, -0.2, 4]} receiveShadow>
        <boxGeometry args={[20, 0.1, 4]} />
        <meshStandardMaterial color="#3A3A3A" />
      </mesh>
      {/* Road line */}
      <mesh position={[0, -0.14, 4]}>
        <boxGeometry args={[18, 0.02, 0.15]} />
        <meshStandardMaterial color="#666666" />
      </mesh>
    </group>
  );
}

/* ---- Floating money label ---- */
function FloatingMoney({
  position,
  amount,
  opacity,
}: {
  position: [number, number, number];
  amount: string;
  opacity: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.y += delta * 0.5;
    }
  });

  return (
    <group ref={ref} position={position}>
      <Text
        fontSize={0.25}
        color="#FFD98A"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`+${amount}`}
      </Text>
    </group>
  );
}

/* ---- Scene content (inside Canvas) ---- */
function SceneContent({ state }: { state: GameState }) {
  const width = Math.max(1, Math.floor(state.floorWidth));
  const totalFloors = Math.max(1, state.floors);

  // Distribute equipment across floors
  const floorEquipment: { id: GeneratorId; slot: number }[][] = Array.from(
    { length: totalFloors },
    () => [],
  );

  let flatIdx = 0;
  for (const def of GENERATORS) {
    const owned = state.generators[def.id] ?? 0;
    for (let i = 0; i < owned; i++) {
      const floor = Math.floor(flatIdx / width);
      const slot = flatIdx % width;
      if (floor < totalFloors) {
        floorEquipment[floor].push({ id: def.id, slot });
      }
      flatIdx++;
    }
  }

  // Count baristas per floor
  const baristaPerFloor: number[] = Array.from({ length: totalFloors }, () => 0);
  const baristaTotal = state.generators.barista ?? 0;
  for (let i = 0; i < baristaTotal; i++) {
    const f = Math.min(Math.floor(i / width), totalFloors - 1);
    baristaPerFloor[f]++;
  }

  const cameraDistance = Math.max(6, totalFloors * 1.2 + width * 0.8);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} color="#FFF6EC" />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        color="#FFD98A"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-3, 4, 2]} intensity={0.4} color="#FF8FB3" />
      <pointLight position={[3, 2, -2]} intensity={0.3} color="#6FD3C0" />

      {/* Ground */}
      <Ground />

      {/* Building floors (rendered bottom to top) */}
      {Array.from({ length: totalFloors }, (_, fi) => (
        <BuildingFloor
          key={fi}
          floorIndex={fi}
          width={width}
          equipment={floorEquipment[fi] || []}
          baristaCount={baristaPerFloor[fi] || 0}
          totalFloors={totalFloors}
        />
      ))}

      {/* Roof */}
      <BuildingRoof width={width} floorCount={totalFloors} />

      {/* Camera */}
      <OrbitControls
        enablePan={false}
        minDistance={cameraDistance * 0.7}
        maxDistance={cameraDistance * 1.5}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, (totalFloors * FLOOR_HEIGHT) / 2, 0]}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

/* ---- Main exported component ---- */
export function CafeScene3D({ state }: { state: GameState }) {
  const totalFloors = Math.max(1, state.floors);
  const cameraDistance = Math.max(6, totalFloors * 1.2 + state.floorWidth * 0.8);

  return (
    <Canvas
      camera={{
        position: [cameraDistance * 0.7, totalFloors * FLOOR_HEIGHT * 0.6, cameraDistance * 0.5],
        fov: 50,
        near: 0.1,
        far: 100,
      }}
      shadows
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#1E140D');
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <Suspense fallback={null}>
        <SceneContent state={state} />
      </Suspense>
    </Canvas>
  );
}
