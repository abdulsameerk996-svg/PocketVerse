import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import type { GameState, GeneratorId } from '../types';
import { GENERATORS } from '../data';

/**
 * 3D Café Tycoon — vanilla Three.js on a canvas element.
 *
 * No R3F, no drei, no import.meta. Just raw Three.js rendering onto
 * an HTML canvas via a React ref. Works reliably with Expo web builds.
 *
 * The building is an isometric-style 3D structure:
 * - Floors stack vertically with colored slabs
 * - Equipment blocks sit on each floor
 * - Capsule barista characters walk between stations
 * - Camera orbits slowly, user can drag to rotate
 */

const FLOOR_HEIGHT = 1.8;
const SLOT_WIDTH = 1.4;
const FLOOR_DEPTH = 3.2;

const EQUIP_COLORS: Record<string, number> = {
  barista: 0x6fd3c0,
  fryer: 0xff8fb3,
  display: 0xffd166,
  drive: 0x7fd8a0,
  roaster: 0xc9823f,
  van: 0x8ab8e8,
  franchise: 0xe8934a,
  robo: 0xd98bd8,
};

function buildScene(state: GameState, scene: THREE.Scene) {
  // Clear existing meshes (except lights)
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) toRemove.push(child);
  });
  toRemove.forEach((o) => scene.remove(o));

  const width = Math.max(1, Math.floor(state.floorWidth));
  const totalFloors = Math.max(1, state.floors);
  const buildingWidth = width * SLOT_WIDTH;

  // ---- Ground ----
  const groundGeo = new THREE.BoxGeometry(24, 0.15, 16);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6b5744 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, -0.15, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Road
  const roadGeo = new THREE.BoxGeometry(24, 0.12, 5);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, -0.22, 5);
  scene.add(road);

  // ---- Floors ----
  // Distribute equipment across floors
  const floorEquip: { id: GeneratorId; slot: number }[][] = Array.from(
    { length: totalFloors },
    () => [],
  );
  let flatIdx = 0;
  for (const def of GENERATORS) {
    const owned = state.generators[def.id] ?? 0;
    for (let i = 0; i < owned; i++) {
      const f = Math.floor(flatIdx / width);
      const s = flatIdx % width;
      if (f < totalFloors) floorEquip[f].push({ id: def.id, slot: s });
      flatIdx++;
    }
  }

  // Count baristas per floor
  const baristasPerFloor: number[] = Array(totalFloors).fill(0);
  const baristaTotal = state.generators.barista ?? 0;
  for (let i = 0; i < baristaTotal; i++) {
    const f = Math.min(Math.floor(i / width), totalFloors - 1);
    baristasPerFloor[f]++;
  }

  for (let fi = 0; fi < totalFloors; fi++) {
    const y = fi * FLOOR_HEIGHT;
    const floorColor = fi % 2 === 0 ? 0x3e2a1a : 0x4a3428;

    // Floor slab
    const slabGeo = new THREE.BoxGeometry(buildingWidth + 0.6, 0.18, FLOOR_DEPTH + 0.5);
    const slabMat = new THREE.MeshStandardMaterial({ color: floorColor, metalness: 0.15, roughness: 0.8 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, y, 0);
    slab.receiveShadow = true;
    scene.add(slab);

    // Back wall
    const wallGeo = new THREE.BoxGeometry(buildingWidth + 0.4, FLOOR_HEIGHT * 0.85, 0.18);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x5c3d2e,
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, y + FLOOR_HEIGHT * 0.425, -(FLOOR_DEPTH / 2 + 0.12));
    scene.add(backWall);

    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(0.18, FLOOR_HEIGHT * 0.85, FLOOR_DEPTH + 0.3);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat.clone());
    leftWall.material.opacity = 0.7;
    leftWall.position.set(-(buildingWidth / 2 + 0.22), y + FLOOR_HEIGHT * 0.425, 0);
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat.clone());
    rightWall.material.opacity = 0.7;
    rightWall.position.set(buildingWidth / 2 + 0.22, y + FLOOR_HEIGHT * 0.425, 0);
    scene.add(rightWall);

    // Equipment blocks
    for (const eq of floorEquip[fi]) {
      const color = EQUIP_COLORS[eq.id] ?? 0xffffff;
      const eqGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
      const eqMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        metalness: 0.3,
        roughness: 0.4,
      });
      const eqMesh = new THREE.Mesh(eqGeo, eqMat);
      const xPos = (eq.slot - (width - 1) / 2) * SLOT_WIDTH;
      eqMesh.position.set(xPos, y + 0.45, 0);
      eqMesh.castShadow = true;
      eqMesh.userData = { rotate: true };
      scene.add(eqMesh);

      // Small label sphere on top
      const labelGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const labelMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffd98a, emissiveIntensity: 0.5 });
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(xPos, y + 0.82, 0);
      scene.add(label);
    }

    // Barista characters
    for (let bi = 0; bi < baristasPerFloor[fi]; bi++) {
      const charGroup = new THREE.Group();
      const hue = (bi * 47 + fi * 120) % 360;
      const bodyColor = new THREE.Color().setHSL(hue / 360, 0.6, 0.55);
      const headColor = new THREE.Color().setHSL(hue / 360, 0.4, 0.8);

      // Body capsule
      const bodyGeo = new THREE.CapsuleGeometry(0.12, 0.28, 4, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.1, roughness: 0.6 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 0.25, 0);
      charGroup.add(body);

      // Head
      const headGeo = new THREE.SphereGeometry(0.14, 8, 8);
      const headMat = new THREE.MeshStandardMaterial({ color: headColor, metalness: 0.1, roughness: 0.5 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(0, 0.65, 0);
      charGroup.add(head);

      const startX = ((bi % width) - (width - 1) / 2) * SLOT_WIDTH;
      charGroup.position.set(startX, y + 0.1, 0.4);
      charGroup.userData = {
        walkPhase: Math.random() * Math.PI * 2,
        floorY: y + 0.1,
        halfW: (buildingWidth / 2) - 0.3,
        floorIndex: fi,
      };
      scene.add(charGroup);
    }
  }

  // ---- Roof ----
  const roofY = totalFloors * FLOOR_HEIGHT;
  const roofGeo = new THREE.BoxGeometry(buildingWidth + 0.8, 0.22, FLOOR_DEPTH + 0.6);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0.3, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, roofY + 0.1, 0);
  roof.castShadow = true;
  scene.add(roof);

  // Sign (golden sphere as a beacon)
  const signGeo = new THREE.SphereGeometry(0.25, 12, 12);
  const signMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffd98a, emissiveIntensity: 0.6 });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, roofY + 0.5, FLOOR_DEPTH / 2 + 0.3);
  scene.add(sign);
}

export function CafeScene3D({ state }: { state: GameState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number>(0);
  const stateRef = useRef(state);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: Math.PI / 4, phi: Math.PI / 3.5 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || Platform.OS !== 'web') return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1e140d);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1e140d, 0.03);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    cameraRef.current = camera;

    // Lighting
    const ambient = new THREE.AmbientLight(0xfff6ec, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffd98a, 1.3);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const pinkLight = new THREE.PointLight(0xff8fb3, 0.5, 20);
    pinkLight.position.set(-4, 5, 3);
    scene.add(pinkLight);

    const tealLight = new THREE.PointLight(0x6fd3c0, 0.4, 20);
    tealLight.position.set(4, 3, -3);
    scene.add(tealLight);

    // Build initial scene
    buildScene(state, scene);

    // Position camera
    const totalFloors = Math.max(1, state.floors);
    const dist = Math.max(7, totalFloors * 1.5 + state.floorWidth * 0.9);
    const a = cameraAngle.current;
    camera.position.set(
      dist * Math.sin(a.phi) * Math.cos(a.theta),
      totalFloors * FLOOR_HEIGHT * 0.5 + dist * 0.3,
      dist * Math.sin(a.phi) * Math.sin(a.theta),
    );
    camera.lookAt(0, totalFloors * FLOOR_HEIGHT * 0.4, 0);

    // Animation loop
    let time = 0;
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      time += 0.016;

      // Rotate equipment blocks
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.rotate) {
          child.rotation.y += 0.005;
        }
        // Walk barista characters
        if (child instanceof THREE.Group && child.userData.walkPhase !== undefined) {
          const ud = child.userData;
          ud.walkPhase += 0.03;
          const newX = Math.sin(ud.walkPhase) * ud.halfW;
          child.position.x = THREE.MathUtils.lerp(child.position.x, newX, 0.05);
          child.position.y = ud.floorY + Math.abs(Math.sin(ud.walkPhase * 3)) * 0.04;
        }
      });

      // Auto-rotate camera if not dragging
      if (!isDragging.current) {
        a.theta += 0.003;
        const target = new THREE.Vector3(0, totalFloors * FLOOR_HEIGHT * 0.4, 0);
        camera.position.set(
          dist * Math.sin(a.phi) * Math.cos(a.theta),
          totalFloors * FLOOR_HEIGHT * 0.5 + dist * 0.3,
          dist * Math.sin(a.phi) * Math.sin(a.theta),
        );
        camera.lookAt(target);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mouse/touch orbit controls
    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      a.theta -= dx * 0.005;
      a.phi = Math.max(0.3, Math.min(Math.PI / 2.1, a.phi - dy * 0.005));
    };
    const onPointerUp = () => {
      isDragging.current = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Resize handler
    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // mount once

  // Rebuild scene when state changes (equipment/floors)
  useEffect(() => {
    stateRef.current = state;
    if (sceneRef.current) {
      buildScene(state, sceneRef.current);
    }
  }, [state]);

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
