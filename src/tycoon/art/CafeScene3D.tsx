import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import type { GameState, GeneratorId } from '../types';
import { GENERATORS } from '../data';

/**
 * 3D Café Tycoon — vanilla Three.js, performance-optimized.
 *
 * Key architecture:
 * - Scene is built ONCE on mount. State changes only update positions/visibility.
 * - No scene traverse in the animation loop — mesh refs stored in arrays.
 * - No shadow maps (too expensive for a web idle game).
 * - Object pooling for floating money text.
 */

const FLOOR_HEIGHT = 2.0;
const SLOT_WIDTH = 1.6;
const FLOOR_DEPTH = 3.5;
const MAX_MESHES = 300;

const EQUIP_COLORS: Record<string, number> = {
  barista: 0x4ecdc4,
  fryer: 0xff6b9d,
  display: 0xffd93d,
  drive: 0x6bcb77,
  roaster: 0xc9860a,
  van: 0x4ecdc4,
  franchise: 0xff8c42,
  robo: 0xc084fc,
};

const EQUIP_EMISSIVE: Record<string, number> = {
  barista: 0x2a9d8f,
  fryer: 0xc44569,
  display: 0xe0a800,
  drive: 0x4a9e5e,
  roaster: 0x8b5e0a,
  van: 0x2a9d8f,
  franchise: 0xc9600a,
  robo: 0x7c3aed,
};

// ─── Mesh Pool ────────────────────────────────────────────────────

interface MeshPool {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  mesh: THREE.Mesh;
  active: boolean;
}

function createMeshPool(scene: THREE.Scene, count: number): MeshPool[] {
  const pools: MeshPool[] = [];
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pools.push({ geometry: geo, material: mat, mesh, active: false });
  }
  return pools;
}

function activatePool(pool: MeshPool): MeshPool {
  pool.active = true;
  pool.mesh.visible = true;
  return pool;
}

function deactivatePool(pool: MeshPool) {
  pool.active = false;
  pool.mesh.visible = false;
}

// ─── Sky Dome ─────────────────────────────────────────────────────

function createSky(scene: THREE.Scene) {
  // Gradient sky using a large inverted sphere
  const skyGeo = new THREE.SphereGeometry(80, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x1a0533) },
      midColor: { value: new THREE.Color(0x2d1b69) },
      bottomColor: { value: new THREE.Color(0x0d0d2b) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color;
        if (h > 0.0) {
          color = mix(midColor, topColor, min(h * 2.0, 1.0));
        } else {
          color = mix(midColor, bottomColor, min(-h * 3.0, 1.0));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}

// ─── Stars ────────────────────────────────────────────────────────

function createStars(scene: THREE.Scene) {
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.4;
    const r = 60 + Math.random() * 15;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 });
  scene.add(new THREE.Points(geo, mat));
}

// ─── Ground + Street ──────────────────────────────────────────────

function createGround(scene: THREE.Scene) {
  // Grass plane
  const grassGeo = new THREE.PlaneGeometry(40, 40);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x2d5a3d,
    roughness: 0.9,
    metalness: 0.0,
  });
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.01;
  scene.add(grass);

  // Sidewalk
  const sidewalkGeo = new THREE.BoxGeometry(12, 0.08, 4);
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.85 });
  const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  sidewalk.position.set(0, 0.04, 2.2);
  scene.add(sidewalk);

  // Road
  const roadGeo = new THREE.BoxGeometry(40, 0.06, 5);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.9 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, 0.03, 5);
  scene.add(road);

  // Road center line (dashed yellow)
  for (let x = -18; x < 18; x += 3) {
    const lineGeo = new THREE.BoxGeometry(1.8, 0.01, 0.12);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.3 });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(x, 0.07, 5);
    scene.add(line);
  }

  // Street lamp posts
  const lampPositions = [-5, 5];
  for (const lx of lampPositions) {
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.6 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(lx, 1.5, 3);
    scene.add(pole);

    // Lamp head
    const headGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: 0xfff3d4,
      emissiveIntensity: 1.0,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(lx, 3.1, 3);
    scene.add(head);

    // Point light from lamp
    const lampLight = new THREE.PointLight(0xfff3d4, 0.6, 10);
    lampLight.position.set(lx, 3.0, 3);
    scene.add(lampLight);
  }
}

// ─── Decorations ──────────────────────────────────────────────────

function createDecorations(scene: THREE.Scene) {
  // Trees
  const treePositions = [[-7, 3.2], [7, 3.2], [-7, -2], [7, -2]];
  for (const [tx, tz] of treePositions) {
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 0.6, tz);
    scene.add(trunk);

    // Foliage (stacked spheres)
    const foliageColors = [0x2d8a4e, 0x3a9e5e, 0x48b868];
    for (let fi = 0; fi < 3; fi++) {
      const r = 0.6 - fi * 0.12;
      const fGeo = new THREE.SphereGeometry(r, 8, 6);
      const fMat = new THREE.MeshStandardMaterial({
        color: foliageColors[fi],
        roughness: 0.8,
      });
      const f = new THREE.Mesh(fGeo, fMat);
      f.position.set(tx, 1.4 + fi * 0.45, tz);
      scene.add(f);
    }
  }

  // Bench near entrance
  const benchGeo = new THREE.BoxGeometry(0.8, 0.08, 0.3);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
  const bench = new THREE.Mesh(benchGeo, benchMat);
  bench.position.set(1.2, 0.35, 2.0);
  scene.add(bench);

  // Bench legs
  for (const bx of [1.0, 1.4]) {
    const legGeo = new THREE.BoxGeometry(0.06, 0.3, 0.06);
    const leg = new THREE.Mesh(legGeo, benchMat);
    leg.position.set(bx, 0.19, 2.0);
    scene.add(leg);
  }

  // Trash can
  const trashGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.35, 8);
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, metalness: 0.4 });
  const trash = new THREE.Mesh(trashGeo, trashMat);
  trash.position.set(-1.5, 0.175, 2.1);
  scene.add(trash);
}

// ─── Character Mesh ───────────────────────────────────────────────

interface CharMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  hat: THREE.Mesh;
  walkPhase: number;
  floorY: number;
  halfW: number;
  floorIndex: number;
  targetX: number;
  color: THREE.Color;
}

function createCharMesh(
  parent: THREE.Object3D,
  hue: number,
  floorY: number,
  startX: number,
  halfW: number,
  floorIndex: number,
): CharMesh {
  const group = new THREE.Group();

  const bodyColor = new THREE.Color().setHSL(hue / 360, 0.65, 0.5);
  const headColor = new THREE.Color().setHSL(hue / 360, 0.35, 0.85);

  // Body (rounded box style via capsule)
  const bodyGeo = new THREE.CapsuleGeometry(0.14, 0.3, 6, 10);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.5,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.3, 0);
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const headMat = new THREE.MeshStandardMaterial({
    color: headColor,
    roughness: 0.4,
    metalness: 0.0,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.72, 0);
  group.add(head);

  // Eyes (two tiny black spheres)
  for (const ex of [-0.06, 0.06]) {
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.74, 0.13);
    group.add(eye);
  }

  // Chef hat (small white cylinder on top)
  const hatGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.15, 8);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 });
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.set(0, 0.92, 0);
  group.add(hat);

  group.position.set(startX, floorY, 0.3);

  parent.add(group);

  return {
    group,
    body,
    head,
    hat,
    walkPhase: Math.random() * Math.PI * 2,
    floorY,
    halfW,
    floorIndex,
    targetX: startX,
    color: bodyColor,
  };
}

// ─── Build Scene (called once) ────────────────────────────────────

interface SceneRefs {
  equipMeshes: MeshPool[];
  equipCount: number;
  baristaMeshes: CharMesh[];
  floorSlabs: THREE.Mesh[];
  backWalls: THREE.Mesh[];
  leftWalls: THREE.Mesh[];
  rightWalls: THREE.Mesh[];
  roof: THREE.Mesh;
  sign: THREE.Mesh;
  signGlow: THREE.PointLight;
  buildingGroup: THREE.Group;
  totalFloors: number;
  floorWidth: number;
}

function buildScene(scene: THREE.Scene): SceneRefs {
  // Sky
  createSky(scene);
  createStars(scene);

  // Ground + street
  createGround(scene);

  // Decorations
  createDecorations(scene);

  // Building group (everything inside here gets rebuilt on state change)
  const buildingGroup = new THREE.Group();
  scene.add(buildingGroup);

  // Pre-allocate pools for equipment and characters
  const equipMeshes = createMeshPool(scene, 60);
  const baristaMeshes: CharMesh[] = [];
  const floorSlabs: THREE.Mesh[] = [];
  const backWalls: THREE.Mesh[] = [];
  const leftWalls: THREE.Mesh[] = [];
  const rightWalls: THREE.Mesh[] = [];

  // Roof
  const roofGeo = new THREE.BoxGeometry(4, 0.3, FLOOR_DEPTH + 0.8);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xc0392b,
    roughness: 0.4,
    metalness: 0.2,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.visible = false;
  scene.add(roof);

  // Sign
  const signGeo = new THREE.BoxGeometry(2.0, 0.5, 0.15);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xffd93d,
    emissive: 0xffd93d,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.3,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.visible = false;
  scene.add(sign);

  // Sign glow light
  const signGlow = new THREE.PointLight(0xffd93d, 0.8, 8);
  signGlow.visible = false;
  scene.add(signGlow);

  return {
    equipMeshes,
    equipCount: 0,
    baristaMeshes,
    floorSlabs,
    backWalls,
    leftWalls,
    rightWalls,
    roof,
    sign,
    signGlow,
    buildingGroup,
    totalFloors: 0,
    floorWidth: 1,
  };
}

// ─── Update Scene (called on state change — no recreation) ────────

function updateBuilding(refs: SceneRefs, state: GameState) {
  const width = Math.max(1, Math.floor(state.floorWidth));
  const totalFloors = Math.max(1, state.floors);
  const buildingWidth = width * SLOT_WIDTH;

  // Deactivate all pools, then re-activate as needed
  for (const pool of refs.equipMeshes) deactivatePool(pool);
  refs.equipCount = 0;

  // Remove old barista meshes
  for (const bm of refs.baristaMeshes) {
    refs.buildingGroup.remove(bm.group);
  }
  refs.baristaMeshes.length = 0;

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

  // Remove old building meshes from buildingGroup
  const oldChildren = [...refs.buildingGroup.children];
  for (const child of oldChildren) refs.buildingGroup.remove(child);

  // Clear old arrays
  refs.floorSlabs.length = 0;
  refs.backWalls.length = 0;
  refs.leftWalls.length = 0;
  refs.rightWalls.length = 0;

  // ---- Build floors ----
  for (let fi = 0; fi < totalFloors; fi++) {
    const y = fi * FLOOR_HEIGHT;

    // Floor slab — warm wood tones
    const floorColor = fi % 3 === 0 ? 0x8b6c4a : fi % 3 === 1 ? 0x9e7b5a : 0x7a5c3a;
    const slabGeo = new THREE.BoxGeometry(buildingWidth + 0.8, 0.15, FLOOR_DEPTH + 0.5);
    const slabMat = new THREE.MeshStandardMaterial({
      color: floorColor,
      roughness: 0.7,
      metalness: 0.05,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, y, 0);
    refs.buildingGroup.add(slab);
    refs.floorSlabs.push(slab);

    // Back wall — warm cream color
    const wallGeo = new THREE.BoxGeometry(buildingWidth + 0.6, FLOOR_HEIGHT * 0.82, 0.15);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf5e6d3,
      roughness: 0.85,
      metalness: 0.0,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, y + FLOOR_HEIGHT * 0.41, -(FLOOR_DEPTH / 2 + 0.1));
    refs.buildingGroup.add(backWall);
    refs.backWalls.push(backWall);

    // Side walls — slightly translucent warm
    const sideWallGeo = new THREE.BoxGeometry(0.12, FLOOR_HEIGHT * 0.82, FLOOR_DEPTH + 0.3);
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xe8d5c0,
      roughness: 0.8,
      transparent: true,
      opacity: 0.65,
    });
    const leftWall = new THREE.Mesh(sideWallGeo, sideMat);
    leftWall.position.set(-(buildingWidth / 2 + 0.2), y + FLOOR_HEIGHT * 0.41, 0);
    refs.buildingGroup.add(leftWall);
    refs.leftWalls.push(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, sideMat.clone());
    rightWall.position.set(buildingWidth / 2 + 0.2, y + FLOOR_HEIGHT * 0.41, 0);
    refs.buildingGroup.add(rightWall);
    refs.rightWalls.push(rightWall);

    // Windows on back wall (two per floor if wide enough)
    if (width >= 2) {
      const winPositions = width >= 4 ? [-1.5, 0, 1.5] : [-0.8, 0.8];
      for (const wx of winPositions) {
        const winGeo = new THREE.BoxGeometry(0.6, 0.55, 0.05);
        const winMat = new THREE.MeshStandardMaterial({
          color: 0x87ceeb,
          emissive: 0x87ceeb,
          emissiveIntensity: 0.15,
          transparent: true,
          opacity: 0.5,
          roughness: 0.1,
          metalness: 0.3,
        });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(wx, y + FLOOR_HEIGHT * 0.45, -(FLOOR_DEPTH / 2 + 0.02));
        refs.buildingGroup.add(win);
      }
    }

    // Door on ground floor
    if (fi === 0) {
      const doorGeo = new THREE.BoxGeometry(0.5, 0.85, 0.08);
      const doorMat = new THREE.MeshStandardMaterial({
        color: 0x6b3a1f,
        roughness: 0.5,
        metalness: 0.1,
      });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(0, y + 0.425, FLOOR_DEPTH / 2 + 0.04);
      refs.buildingGroup.add(door);

      // Door handle
      const handleGeo = new THREE.SphereGeometry(0.03, 6, 6);
      const handleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8 });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0.18, y + 0.42, FLOOR_DEPTH / 2 + 0.09);
      refs.buildingGroup.add(handle);

      // Awning above door
      const awningGeo = new THREE.BoxGeometry(1.2, 0.06, 0.5);
      const awningMat = new THREE.MeshStandardMaterial({
        color: 0xc0392b,
        roughness: 0.6,
      });
      const awning = new THREE.Mesh(awningGeo, awningMat);
      awning.position.set(0, y + 0.92, FLOOR_DEPTH / 2 + 0.2);
      refs.buildingGroup.add(awning);
    }

    // Equipment blocks
    for (const eq of floorEquip[fi]) {
      if (refs.equipCount >= refs.equipMeshes.length) break;
      const pool = activatePool(refs.equipMeshes[refs.equipCount]);
      const color = EQUIP_COLORS[eq.id] ?? 0xffffff;
      const emissive = EQUIP_EMISSIVE[eq.id] ?? 0x333333;

      pool.material.color.setHex(color);
      pool.material.emissive.setHex(emissive);
      pool.material.emissiveIntensity = 0.35;
      pool.material.metalness = 0.25;
      pool.material.roughness = 0.35;

      pool.mesh.scale.set(0.6, 0.6, 0.6);
      const xPos = (eq.slot - (width - 1) / 2) * SLOT_WIDTH;
      pool.mesh.position.set(xPos, y + 0.45, 0);
      pool.mesh.rotation.set(0, 0, 0);
      pool.mesh.userData = { rotate: true };

      refs.equipCount++;
    }

    // Barista characters
    for (let bi = 0; bi < baristasPerFloor[fi]; bi++) {
      const hue = (bi * 47 + fi * 120) % 360;
      const startX = ((bi % width) - (width - 1) / 2) * SLOT_WIDTH;
      const halfW = buildingWidth / 2 - 0.4;
      const charMesh = createCharMesh(
        refs.buildingGroup,
        hue,
        y + 0.1,
        startX,
        halfW,
        fi,
      );
      refs.baristaMeshes.push(charMesh);
    }
  }

  // Roof
  const roofY = totalFloors * FLOOR_HEIGHT;
  refs.roof.visible = true;
  refs.roof.scale.set(
    (buildingWidth + 1.0) / 4,
    1,
    (FLOOR_DEPTH + 0.8) / (FLOOR_DEPTH + 0.8),
  );
  refs.roof.position.set(0, roofY + 0.15, 0);

  // Sign
  refs.sign.visible = true;
  refs.sign.position.set(0, roofY + 0.55, FLOOR_DEPTH / 2 + 0.2);
  refs.signGlow.visible = true;
  refs.signGlow.position.set(0, roofY + 0.55, FLOOR_DEPTH / 2 + 0.5);

  refs.totalFloors = totalFloors;
  refs.floorWidth = width;
}

// ─── Camera Controller ────────────────────────────────────────────

class CameraController {
  theta = Math.PI / 4;
  phi = Math.PI / 3.2;
  targetTheta = Math.PI / 4;
  targetPhi = Math.PI / 3.2;
  distance = 10;
  lookAt = new THREE.Vector3(0, 2, 0);
  isDragging = false;
  lastX = 0;
  lastY = 0;
  autoRotate = true;
  velocity = { x: 0, y: 0 };

  update(camera: THREE.PerspectiveCamera) {
    // Smooth follow
    this.theta += (this.targetTheta - this.theta) * 0.12;
    this.phi += (this.targetPhi - this.phi) * 0.12;

    // Apply damping to velocity
    this.velocity.x *= 0.92;
    this.velocity.y *= 0.92;
    this.targetTheta += this.velocity.x;
    this.targetPhi += this.velocity.y;

    // Clamp phi
    this.targetPhi = Math.max(0.3, Math.min(Math.PI / 2.1, this.targetPhi));

    // Auto-rotate when idle
    if (this.autoRotate && !this.isDragging) {
      this.targetTheta += 0.002;
    }

    camera.position.set(
      this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.lookAt.y + this.distance * 0.45,
      this.distance * Math.sin(this.phi) * Math.sin(this.theta),
    );
    camera.lookAt(this.lookAt);
  }

  onPointerDown(x: number, y: number) {
    this.isDragging = true;
    this.lastX = x;
    this.lastY = y;
    this.autoRotate = false;
  }

  onPointerMove(x: number, y: number) {
    if (!this.isDragging) return;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.lastX = x;
    this.lastY = y;

    // Direct control + velocity for momentum
    this.targetTheta -= dx * 0.005;
    this.targetPhi -= dy * 0.005;
    this.velocity.x = -dx * 0.002;
    this.velocity.y = -dy * 0.002;
  }

  onPointerUp() {
    this.isDragging = false;
    // Resume auto-rotate after 3 seconds
    setTimeout(() => {
      if (!this.isDragging) this.autoRotate = true;
    }, 3000);
  }

  focusBuilding(totalFloors: number, floorWidth: number) {
    this.distance = Math.max(8, totalFloors * 1.5 + floorWidth * 1.0);
    this.lookAt.set(0, totalFloors * FLOOR_HEIGHT * 0.4, 0);
  }
}

// ─── Main Component ───────────────────────────────────────────────

export function CafeScene3D({ state }: { state: GameState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number>(0);
  const refsRef = useRef<SceneRefs | null>(null);
  const camCtrlRef = useRef(new CameraController());
  const stateRef = useRef(state);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || Platform.OS !== 'web') return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Renderer — no shadow maps for performance
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap at 1.5 for perf
    renderer.setClearColor(0x0d0d2b);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 150);
    cameraRef.current = camera;

    // Lighting — warm café tones
    const ambient = new THREE.AmbientLight(0xfff6ec, 0.6);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
    sunLight.position.set(8, 12, 5);
    scene.add(sunLight);

    const warmFill = new THREE.PointLight(0xff8c42, 0.4, 25);
    warmFill.position.set(-5, 6, 3);
    scene.add(warmFill);

    const coolRim = new THREE.PointLight(0x6ec6ff, 0.25, 25);
    coolRim.position.set(5, 4, -4);
    scene.add(coolRim);

    // Build scene ONCE
    const refs = buildScene(scene);
    refsRef.current = refs;

    // Position camera
    camCtrlRef.current.focusBuilding(state.floors, state.floorWidth);

    // Build initial building
    updateBuilding(refs, state);

    // Animation loop — NO traverse, direct refs only
    let time = 0;
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      time += 0.016;

      // Update equipment rotation (direct pool access)
      for (let i = 0; i < refs.equipCount; i++) {
        const pool = refs.equipMeshes[i];
        if (pool.active && pool.mesh.userData.rotate) {
          pool.mesh.rotation.y += 0.008;
          // Gentle bob
          pool.mesh.position.y += Math.sin(time * 2 + i) * 0.001;
        }
      }

      // Update barista walk (direct array access)
      for (const bm of refs.baristaMeshes) {
        bm.walkPhase += 0.025;
        bm.targetX = Math.sin(bm.walkPhase) * bm.halfW;
        // Smooth lerp to target
        bm.group.position.x += (bm.targetX - bm.group.position.x) * 0.06;
        // Bob while walking
        bm.group.position.y = bm.floorY + Math.abs(Math.sin(bm.walkPhase * 4)) * 0.03;
        // Slight tilt when walking
        bm.group.rotation.z = Math.sin(bm.walkPhase * 2) * 0.05;
        // Flip direction
        if (bm.targetX > bm.group.position.x + 0.01) {
          bm.group.scale.x = 1;
        } else if (bm.targetX < bm.group.position.x - 0.01) {
          bm.group.scale.x = -1;
        }
      }

      // Camera update (smooth interpolated)
      camCtrlRef.current.update(camera);

      renderer.render(scene, camera);
    };
    animate();

    // Pointer controls
    const onPointerDown = (e: PointerEvent) => {
      camCtrlRef.current.onPointerDown(e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      camCtrlRef.current.onPointerMove(e.clientX, e.clientY);
    };
    const onPointerUp = () => {
      camCtrlRef.current.onPointerUp();
    };

    // Touch controls for mobile
    let touchStartDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        camCtrlRef.current.onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        camCtrlRef.current.onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = touchStartDist / Math.max(dist, 1);
        camCtrlRef.current.distance = Math.max(5, Math.min(25, camCtrlRef.current.distance * scale));
        touchStartDist = dist;
      }
    };
    const onTouchEnd = () => {
      camCtrlRef.current.onPointerUp();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd);

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
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // mount once

  // Update building on state change — NO mesh recreation, only position/visibility updates
  useEffect(() => {
    stateRef.current = state;
    if (refsRef.current && sceneRef.current) {
      updateBuilding(refsRef.current, state);
      camCtrlRef.current.focusBuilding(state.floors, state.floorWidth);
    }
  }, [state]);

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
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
