import React, { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { Character, Sparks, Stage, type SparksHandle } from '@/core/game3d';
import { BIOMES, BOSSES, ENEMIES, HALF_W } from './content';
import { decorations, type Decoration } from './world';
import {
  clamp,
  ENEMY_POOL,
  FIXED_DT,
  PICKUP_POOL,
  PROJ_POOL,
  TELE_POOL,
  step,
} from './sim';
import type {
  BiomeId,
  EnemyKind,
  FrontierInput,
  PickupKind,
  World,
} from './types';

/**
 * ============================================================================
 *  FRONTIER — R3F PRESENTATION
 * ============================================================================
 *
 * The sim (`sim.ts`) is pure TS; this file is the only place three.js is
 * involved. It steps the sim at a fixed 60 Hz inside `useFrame`, then writes
 * the result into instanced pools — zero per-frame React state, zero
 * allocation, the same pattern the arena games use.
 *
 * Visual feedback (death pops, hurt flashes, dash puffs, Nova rings) is
 * detected as *edges* in sim state, so the presentation never needs a
 * separate event channel.
 */

type SceneProps = {
  world: React.RefObject<World | null>;
  input: React.RefObject<FrontierInput>;
  paused: boolean;
  seed: number;
  /** Fired once when the run transitions to `over`. */
  onOver: () => void;
  /** Dev-only: live camera position for the renderer diagnostic. */
  camDiag?: React.RefObject<CamDiag>;
};

/** A live snapshot of the camera, for the development renderer readout. */
export type CamDiag = { x: number; y: number; z: number };

const PICKUP_COLORS: Record<PickupKind, string> = {
  gem: '#4ADE80',
  hp: '#FF6B8A',
  buff: '#FFD166',
  rare: '#C05CFF',
};

const PROJ_COLORS = { player: '#34E2A8', enemy: '#FF6B6B' } as const;

/* ------------------------------------------------- floating damage readout -- */

/** Pool of floating damage numbers. Drawn as canvas-texture sprites on web;
 *  native has no DOM canvas, so it keeps the hit-flash/death-pop feedback the
 *  sim already drives and simply skips the readout. */
const DMG_POOL = 16;
const CAN_DRAW_TEXT =
  typeof document !== 'undefined' && typeof document.createElement === 'function';

type DmgEntry = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  ttl: number;
  value: number;
  crit: boolean;
};

const FOG: Record<BiomeId, { bg: string; fog: [number, number] }> = {
  meadow: { bg: '#0D1B14', fog: [16, 44] },
  forest: { bg: '#07170F', fog: [15, 40] },
  ruins: { bg: '#120F1E', fog: [15, 42] },
  danger: { bg: '#180A14', fog: [15, 40] },
};

export function FrontierScene({ world, input, paused, seed, onOver, camDiag }: SceneProps) {
  const playerRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const sparks = useRef<SparksHandle | null>(null);

  return (
    <Stage
      fit={{ halfWidth: 30, halfDepth: 30, height: 3, margin: 0.9 }}
      cameraDir={[0, 16, 14]}
      fov={55}
      background={FOG.meadow.bg}
      paused={paused}
      ambient={0.62}
      keyLight={{ position: [8, 22, 6], intensity: 1.6 }}
    >
      <Sim
        world={world}
        input={input}
        paused={paused}
        seed={seed}
        onOver={onOver}
        playerRef={playerRef}
        auraRef={auraRef}
        sparks={sparks}
        camDiag={camDiag}
      />
      <Sparks handle={sparks} count={96} />
    </Stage>
  );
}

/* ===================================================================== Sim == */

function Sim({
  world,
  input,
  paused,
  seed,
  onOver,
  playerRef,
  auraRef,
  sparks,
  camDiag,
}: {
  world: React.RefObject<World | null>;
  input: React.RefObject<FrontierInput>;
  paused: boolean;
  seed: number;
  onOver: () => void;
  playerRef: React.RefObject<THREE.Group | null>;
  auraRef: React.RefObject<THREE.Mesh | null>;
  sparks: React.RefObject<SparksHandle | null>;
  camDiag?: React.RefObject<CamDiag>;
}) {
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const acc = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  const enemyMesh = useRef<THREE.InstancedMesh>(null);
  const pickupMesh = useRef<THREE.InstancedMesh>(null);
  const projMesh = useRef<THREE.InstancedMesh>(null);
  const teleRingMesh = useRef<THREE.InstancedMesh>(null);
  const teleFlashMesh = useRef<THREE.InstancedMesh>(null);

  const groundMat = useRef<THREE.MeshStandardMaterial>(null);
  const rimMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  const bossRef = useRef<THREE.Group>(null);
  const bossMat = useRef<THREE.MeshStandardMaterial>(null);
  const bossRingMat = useRef<THREE.MeshBasicMaterial>(null);

  /* damage-number pool — entries are JS refs, sprites are created once */
  const dmg = useRef<DmgEntry[]>(Array.from({ length: DMG_POOL }, () => ({
    active: false, x: 0, y: 0, z: 0, vy: 0, ttl: 0, value: 0, crit: false,
  })));
  const dmgSprites = useMemo(() => {
    if (!CAN_DRAW_TEXT) return [];
    return Array.from({ length: DMG_POOL }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 56;
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.5, 0.88, 1);
      sprite.visible = false;
      return { canvas, tex, sprite };
    });
  }, []);

  const spawnDmg = useCallback((x: number, z: number, value: number, crit: boolean) => {
    const idx = dmg.current.findIndex((d) => !d.active);
    if (idx < 0) return;
    const entry = dmg.current[idx];
    entry.active = true;
    entry.x = x;
    entry.z = z;
    entry.y = 1.15;
    entry.vy = 1.7;
    entry.ttl = 0.9;
    entry.value = Math.round(value);
    entry.crit = crit;
    const slot = dmgSprites[idx];
    if (!slot) return;
    const ctx = slot.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 96, 56);
      ctx.font = `bold ${crit ? 34 : 28}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(8,8,15,0.92)';
      ctx.lineWidth = 5;
      ctx.strokeText(`${entry.value}`, 48, 28);
      ctx.fillStyle = crit ? '#FFD166' : '#FFFFFF';
      ctx.fillText(`${entry.value}`, 48, 28);
    }
    slot.tex.needsUpdate = true;
    slot.sprite.visible = true;
  }, [dmg, dmgSprites]);
  const eventRef = useRef<THREE.Group>(null);
  const eventRingMat = useRef<THREE.MeshBasicMaterial>(null);
  const eventColMat = useRef<THREE.MeshBasicMaterial>(null);
  const objectiveRef = useRef<THREE.Group>(null);
  const objectiveBeamMat = useRef<THREE.MeshBasicMaterial>(null);

  // static decoration pools
  const treeTrunks = useRef<THREE.InstancedMesh>(null);
  const treeCanopies = useRef<THREE.InstancedMesh>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const pillars = useRef<THREE.InstancedMesh>(null);
  const crystals = useRef<THREE.InstancedMesh>(null);

  // landmark statics — built once from the world's landmark list

  const prev = useRef({
    over: false,
    biome: 'meadow' as BiomeId,
    level: 1,
    dashT: 0,
    hurtFlash: 0,
    abilityCd: 2,
    bossActive: false,
    bossDead: false,
    bossHp: 0,
    // Array.from, not Array.fill: fill would hand every slot the SAME object,
    // so one enemy's state would read as every enemy's state and the death-pop
    // edge detection would burst sparks at wrong positions all over the field.
    enemies: Array.from({ length: ENEMY_POOL }, () => ({
      on: false,
      x: 0,
      z: 0,
      kind: 'walker' as EnemyKind,
      hp: 0,
    })),
  });

  /* ------------------------------------------------ static scenery (once) */

  const decos = useMemo(() => decorations(seed), [seed]);

  useLayoutEffect(() => {
    const place = (mesh: THREE.InstancedMesh | null, items: Decoration[], scaleY = 1) => {
      if (!mesh) return;
      items.forEach((d, i) => {
        dummy.position.set(d.x, 0.5 * d.scale * scaleY, d.z);
        dummy.rotation.set(0, d.scale, 0);
        dummy.scale.setScalar(d.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = items.length;
    };

    const trees = decos.filter((d) => d.kind === 'tree');
    const rockList = decos.filter((d) => d.kind === 'rock');
    const pillarList = decos.filter((d) => d.kind === 'pillar');
    const crystalList = decos.filter((d) => d.kind === 'crystal');

    place(treeTrunks.current, trees, 0.45);
    place(treeCanopies.current, trees, 1.35);
    place(rocks.current, rockList, 0.4);
    place(pillars.current, pillarList, 1.2);
    place(crystals.current, crystalList, 0.8);
  }, [decos, dummy]);

  /* --------------------------------------------------------- per frame ---- */

  useFrame((_state, delta) => {
    const w = world.current;
    if (!w) return;
    const dt = Math.min(delta, 0.05);

    // ---- step the simulation ----------------------------------------------
    if (!paused && !w.over) {
      acc.current += dt;
      let guard = 0;
      while (acc.current >= FIXED_DT && guard < 6) {
        step(w, input.current, FIXED_DT);
        acc.current -= FIXED_DT;
        guard += 1;
      }
      if (guard === 6) acc.current = 0;
      // edge-triggered buttons are consumed by the loop; holding melee keeps swinging
      input.current.dash = false;
      input.current.ability = false;
    }

    if (w.over && !prev.current.over) {
      prev.current.over = true;
      onOverRef.current?.();
    }

    /* ------------------------------- biome atmosphere (changes rarely) */
    if (w.biome !== prev.current.biome) {
      prev.current.biome = w.biome;
      const f = FOG[w.biome];
      scene.background = new THREE.Color(f.bg);
      scene.fog = new THREE.Fog(f.bg, f.fog[0], f.fog[1]);
      const accent = BIOMES[w.biome].accent;
      for (const m of rimMats.current) {
        if (!m) continue;
        m.color.set(accent);
        m.emissive.set(accent);
      }
      if (groundMat.current) groundMat.current.color.set(BIOMES[w.biome].ground);
    }

    /* ---------------------------------------------- player + camera ------ */
    const p = w.player;
    // Defensive: a poisoned sim value must never reach the render transform or
    // the camera frame. The sim is fuzz-tested for finiteness, but the scene is
    // the last line before pixels — clamp to a safe value instead of NaN.
    const px = Number.isFinite(p.x) ? p.x : 0;
    const pz = Number.isFinite(p.z) ? p.z : 0;
    const facing = Number.isFinite(p.facing) ? p.facing : 0;
    if (playerRef.current) {
      playerRef.current.position.set(px, 0, pz);
      playerRef.current.rotation.y = Math.PI / 2 - facing;
    }
    if (auraRef.current) {
      auraRef.current.position.set(px, 0.02, pz);
      const m = auraRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 + (p.invuln > 0 ? Math.sin(w.time * 40) * 0.2 + 0.2 : 0);
    }

    // follow camera with a touch of screen shake
    const k = 1 - Math.exp(-3.4 * dt);
    camera.position.x += (px - camera.position.x) * k;
    camera.position.y += (25 - camera.position.y) * k;
    camera.position.z += (pz + 14 - camera.position.z) * k;
    if (w.shake > 0.01) {
      const s = w.shake * 0.55;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s * 0.4;
    }
    camera.lookAt(look.set(px, 1, pz));
    if (camDiag?.current) {
      camDiag.current.x = camera.position.x;
      camDiag.current.y = camera.position.y;
      camDiag.current.z = camera.position.z;
    }

    /* ------------------------------------------------ enemies (pooled) --- */
    const em = enemyMesh.current;
    if (em) {
      w.enemies.forEach((e, i) => {
        const pv = prev.current.enemies[i];
        // death pop — detected as an active→inactive edge at the last position
        if (pv.on && !e.active) {
          sparks.current?.burst(pv.x, 0.6, pv.z, ENEMIES[pv.kind].color, 6, 2.6);
        }
        // damage readout — a falling hp is a hit; a rising hp is a spawn
        if (e.active && e.hp < pv.hp) {
          const dealt = pv.hp - e.hp;
          spawnDmg(e.x, e.z, dealt, dealt >= 28);
        }
        pv.hp = e.hp;
        pv.on = e.active;
        if (e.active) {
          pv.x = e.x;
          pv.z = e.z;
          pv.kind = e.kind;
          const pop = 1 - (e.spawnT > 0 ? e.spawnT / 0.35 : 0);
          const flash = e.hitFlash > 0;
          dummy.position.set(e.x, 0.5 * e.r, e.z);
          dummy.rotation.set(0, w.time * 0.6 + i, 0);
          dummy.scale.setScalar(Math.max(0.05, e.r * 1.55 * clamp(pop, 0.15, 1)));
          dummy.updateMatrix();
          em.setMatrixAt(i, dummy.matrix);
          em.setColorAt(i, tmpColor.set(flash ? '#FFFFFF' : ENEMIES[e.kind].color));
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          em.setMatrixAt(i, dummy.matrix);
        }
      });
      em.instanceMatrix.needsUpdate = true;
      if (em.instanceColor) em.instanceColor.needsUpdate = true;
    }

    /* ------------------------------------------------ pickups (pooled) --- */
    const pm = pickupMesh.current;
    if (pm) {
      w.pickups.forEach((pu, i) => {
        if (pu.active) {
          dummy.position.set(pu.x, 0.45 + Math.sin(pu.bob) * 0.12, pu.z);
          dummy.rotation.set(pu.bob, pu.bob * 0.7, 0);
          const s = pu.kind === 'rare' ? 0.26 : pu.kind === 'gem' ? 0.16 : 0.2;
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          pm.setMatrixAt(i, dummy.matrix);
          pm.setColorAt(i, tmpColor.set(PICKUP_COLORS[pu.kind]));
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          pm.setMatrixAt(i, dummy.matrix);
        }
      });
      pm.instanceMatrix.needsUpdate = true;
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    }

    /* ---------------------------------------------- projectiles (pooled) -- */
    const prm = projMesh.current;
    if (prm) {
      w.projectiles.forEach((pr, i) => {
        if (pr.active) {
          dummy.position.set(pr.x, 0.42, pr.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(pr.r * 2.1);
          dummy.updateMatrix();
          prm.setMatrixAt(i, dummy.matrix);
          prm.setColorAt(i, tmpColor.set(PROJ_COLORS[pr.kind]));
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          prm.setMatrixAt(i, dummy.matrix);
        }
      });
      prm.instanceMatrix.needsUpdate = true;
      if (prm.instanceColor) prm.instanceColor.needsUpdate = true;
    }

    /* ------------------------------------------- telegraphs (rings/flash) - */
    const trm = teleRingMesh.current;
    const tfm = teleFlashMesh.current;
    if (trm && tfm) {
      w.teles.forEach((t, i) => {
        if (t.active) {
          const life = t.ttl / 1.2; // 1.2s nominal lifetime
          dummy.position.set(t.x, 0.06, t.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(t.r * (0.5 + 0.5 * life));
          dummy.updateMatrix();
          trm.setMatrixAt(i, dummy.matrix);
          trm.setColorAt(i, tmpColor.set(t.color));

          if (t.phase === 1) {
            dummy.position.set(t.x, 0.05, t.z);
            dummy.scale.setScalar(t.r);
            dummy.updateMatrix();
            tfm.setMatrixAt(i, dummy.matrix);
            tfm.setColorAt(i, tmpColor.set(t.color));
          } else {
            dummy.position.set(0, -999, 0);
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            tfm.setMatrixAt(i, dummy.matrix);
          }
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          trm.setMatrixAt(i, dummy.matrix);
          tfm.setMatrixAt(i, dummy.matrix);
        }
      });
      trm.instanceMatrix.needsUpdate = true;
      tfm.instanceMatrix.needsUpdate = true;
      if (trm.instanceColor) trm.instanceColor.needsUpdate = true;
      if (tfm.instanceColor) tfm.instanceColor.needsUpdate = true;
    }

    /* --------------------------------------------------------- boss ------ */
    const b = w.boss;
    const bossVisible = !!b && b.active;
    if (bossRef.current) {
      bossRef.current.visible = bossVisible;
      if (b) {
        bossRef.current.position.set(b.x, 0, b.z);
        const def = BOSSES[b.id];
        const shrink = b.dead ? Math.max(0.001, 1 - b.deadT / 1.6) : 1;
        const scale = def.r * 1.5 * shrink;
        bossRef.current.scale.setScalar(scale);
        const pulse = 1 + Math.sin(w.time * 3) * 0.04;
        if (bossMat.current) {
          const color = b.hitFlash > 0 ? '#FFFFFF' : def.color;
          bossMat.current.color.set(color);
          bossMat.current.emissive.set(color);
          bossMat.current.emissiveIntensity = b.telegraph > 0 ? 1.1 : 0.45 * pulse;
        }
        if (bossRingMat.current) {
          bossRingMat.current.color.set(b.telegraph > 0 ? '#FF4D4D' : def.accent);
          bossRingMat.current.opacity = b.telegraph > 0 ? 0.95 : 0.5;
          const ringScale = b.telegraph > 0 ? 1.6 : 1.1 + Math.sin(w.time * 2.2) * 0.06;
          const ring = bossRef.current.children[1];
          if (ring) ring.scale.setScalar(ringScale);
        }
      }
    }

    // boss phase-colour shift handled via emissive above; phases show in HUD

    /* -------------------------------------------------- active event zone - */
    const ev = w.event;
    if (eventRef.current) {
      const active = ev.kind !== 'none';
      eventRef.current.visible = active;
      if (active) {
        eventRef.current.position.set(ev.x, 0, ev.z);
        const color =
          ev.kind === 'healzone' ? '#34E2A8'
            : ev.kind === 'treasure' ? '#FFD166'
              : ev.kind === 'meteor' ? '#FF8A3D'
                : ev.kind === 'elite' ? '#FF4D4D'
                  : '#7C5CFF';
        if (eventRingMat.current) {
          eventRingMat.current.color.set(color);
          eventRingMat.current.opacity = 0.5 + Math.sin(w.time * 5) * 0.15;
        }
        if (eventColMat.current) {
          eventColMat.current.color.set(color);
          eventColMat.current.opacity = 0.16;
        }
        const ring = eventRef.current.children[0];
        if (ring) ring.scale.setScalar(ev.r);
      }
    }

    /* --------------------------------------------------- objective marker - */
    if (objectiveRef.current && !w.over) {
      const o = w.objective;
      objectiveRef.current.position.set(o.x, 0, o.z);
      const spin = objectiveRef.current.children[0];
      if (spin) {
        spin.rotation.y = w.time * 2.4;
        spin.position.y = 2.2 + Math.sin(w.time * 2) * 0.25;
      }
      if (objectiveBeamMat.current) {
        objectiveBeamMat.current.opacity = 0.12 + Math.sin(w.time * 3) * 0.06;
      }
    }

    /* ------------------------------------------------ feedback edges ------ */
    const pr = prev.current;
    if (p.level !== pr.level) {
      pr.level = p.level;
      sparks.current?.burst(p.x, 0.8, p.z, '#FFD166', 14, 4);
    }
    if (p.dashT > 0 && pr.dashT <= 0) {
      sparks.current?.burst(p.x, 0.5, p.z, '#A9E7FF', 8, 3.4);
    }
    pr.dashT = p.dashT;
    if (p.abilityCd > pr.abilityCd + 2) {
      sparks.current?.burst(p.x, 1, p.z, '#C05CFF', 26, 6);
    }
    pr.abilityCd = p.abilityCd;
    if (w.hurtFlash > 0 && pr.hurtFlash <= 0) {
      sparks.current?.burst(p.x, 1, p.z, '#FF5C6E', 14, 4.4);
    }
    pr.hurtFlash = w.hurtFlash;

    if (b) {
      if (b.active !== pr.bossActive) {
        pr.bossActive = b.active;
        if (b.active) sparks.current?.burst(b.x, 1.4, b.z, BOSSES[b.id].color, 30, 5.4);
      }
      if (!pr.bossDead && b.dead) {
        pr.bossDead = true;
        sparks.current?.burst(b.x, 1.6, b.z, BOSSES[b.id].accent, 40, 6.5);
      }
      if (b.active && !b.dead && b.hp < pr.bossHp) {
        spawnDmg(b.x, b.z, pr.bossHp - b.hp, true);
      }
      pr.bossHp = b.hp;
    } else if (pr.bossActive) {
      pr.bossActive = false;
      pr.bossDead = false;
      pr.bossHp = 0;
    }

    /* ----------------------------------- damage numbers (rise + fade) ---- */
    const dl = dmg.current;
    for (let i = 0; i < dl.length; i++) {
      const de = dl[i];
      const slot = dmgSprites[i];
      if (!de.active) {
        if (slot) slot.sprite.visible = false;
        continue;
      }
      de.y += de.vy * dt;
      de.ttl -= dt;
      if (de.ttl <= 0) {
        de.active = false;
        if (slot) slot.sprite.visible = false;
        continue;
      }
      if (slot) {
        slot.sprite.position.set(de.x, de.y, de.z);
        slot.sprite.visible = true;
        (slot.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, de.ttl / 0.35);
      }
    }
  });

  return (
    <group>
      {/* ------------------------------------------------------------ world */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2 + 20, HALF_W * 2 + 20]} />
        <meshStandardMaterial color="#07070F" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, HALF_W * 2]} />
        <meshStandardMaterial ref={groundMat} color={BIOMES.meadow.ground} roughness={0.96} />
      </mesh>

      {/* boundary rim — 4 glowing bars in the biome accent */}
      <mesh position={[0, 0.09, -HALF_W + 0.1]}>
        <boxGeometry args={[HALF_W * 2, 0.18, 0.2]} />
        <meshStandardMaterial ref={(m) => void (rimMats.current[0] = m)} color={BIOMES.meadow.accent} emissive={BIOMES.meadow.accent} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.09, HALF_W - 0.1]}>
        <boxGeometry args={[HALF_W * 2, 0.18, 0.2]} />
        <meshStandardMaterial ref={(m) => void (rimMats.current[1] = m)} color={BIOMES.meadow.accent} emissive={BIOMES.meadow.accent} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-HALF_W + 0.1, 0.09, 0]}>
        <boxGeometry args={[0.2, 0.18, HALF_W * 2]} />
        <meshStandardMaterial ref={(m) => void (rimMats.current[2] = m)} color={BIOMES.meadow.accent} emissive={BIOMES.meadow.accent} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[HALF_W - 0.1, 0.09, 0]}>
        <boxGeometry args={[0.2, 0.18, HALF_W * 2]} />
        <meshStandardMaterial ref={(m) => void (rimMats.current[3] = m)} color={BIOMES.meadow.accent} emissive={BIOMES.meadow.accent} emissiveIntensity={0.5} />
      </mesh>

      {/* -------------------------------------------------------- scenery */}
      <instancedMesh ref={treeTrunks} args={[undefined, undefined, 220]} frustumCulled={false}>
        <cylinderGeometry args={[0.16, 0.22, 1.2, 6]} />
        <meshStandardMaterial color="#3B2A1E" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={treeCanopies} args={[undefined, undefined, 220]} frustumCulled={false}>
        <coneGeometry args={[1, 1.7, 7]} />
        <meshStandardMaterial color="#1E5B3C" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, 220]} frustumCulled={false}>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#4A4458" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={pillars} args={[undefined, undefined, 220]} frustumCulled={false}>
        <boxGeometry args={[0.9, 2.8, 0.9]} />
        <meshStandardMaterial color="#3A3250" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crystals} args={[undefined, undefined, 220]} frustumCulled={false}>
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#C05CFF" emissive="#C05CFF" emissiveIntensity={0.45} roughness={0.4} />
      </instancedMesh>

      {/* ------------------------------------------------ player ----------- */}
      <Character
        groupRef={playerRef}
        style={{ body: '#4EA8FF', accent: '#A9E7FF', shape: 'round' }}
        radius={0.5}
      />
      <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.62, 0.8, 32]} />
        <meshBasicMaterial color="#A9E7FF" transparent opacity={0.3} />
      </mesh>

      {/* ---------------------------------------------- pooled entities ---- */}
      <instancedMesh ref={enemyMesh} args={[undefined, undefined, ENEMY_POOL]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={pickupMesh} args={[undefined, undefined, PICKUP_POOL]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial emissive="#FFFFFF" emissiveIntensity={0.35} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={projMesh} args={[undefined, undefined, PROJ_POOL]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial emissive="#FFFFFF" emissiveIntensity={0.5} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={teleRingMesh} args={[undefined, undefined, TELE_POOL]} frustumCulled={false}>
        <torusGeometry args={[1, 0.09, 8, 28]} />
        <meshStandardMaterial emissive="#FFFFFF" emissiveIntensity={0.8} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={teleFlashMesh} args={[undefined, undefined, TELE_POOL]} frustumCulled={false}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial transparent opacity={0.85} side={THREE.DoubleSide} />
      </instancedMesh>

      {/* --------------------------------------------------------- boss ---- */}
      <group ref={bossRef} visible={false}>
        <mesh castShadow>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial ref={bossMat} color="#4EA8FF" emissive="#4EA8FF" emissiveIntensity={0.5} roughness={0.35} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[1.15, 1.45, 32]} />
          <meshBasicMaterial ref={bossRingMat} color="#A9E7FF" transparent opacity={0.5} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.45, 0.6, 0.85]}>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshStandardMaterial color="#0B0A12" roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* --------------------------------------------------- event zone ---- */}
      <group ref={eventRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.96, 1.06, 40]} />
          <meshBasicMaterial ref={eventRingMat} color="#34E2A8" transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 6, 12]} />
          <meshBasicMaterial ref={eventColMat} color="#34E2A8" transparent opacity={0.14} />
        </mesh>
      </group>

      {/* ------------------------------------------------ landmarks -------- */}
      <LandmarkMarkers world={world} />

      {/* ----------------------------------------- damage number sprites --- */}
      {dmgSprites.map((slot, i) => (
        <primitive key={i} object={slot.sprite} />
      ))}

      {/* ----------------------------------------------- objective marker --- */}
      <group ref={objectiveRef}>
        <mesh position={[0, 2.4, 0]}>
          <octahedronGeometry args={[0.34, 0]} />
          <meshBasicMaterial color="#FFD166" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.4, 6]} />
          <meshBasicMaterial ref={objectiveBeamMat} color="#FFD166" transparent opacity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------ landmark markers -- */

/**
 * Static per-landmark markers. Boss arenas get a pulsing obelisk in the boss
 * accent (dim until discovered); sight landmarks get a small mint monolith.
 * Rendered once from the world's landmark list — the sim owns the data.
 */
function LandmarkMarkers({ world }: { world: React.RefObject<World | null> }) {
  const w = world.current;
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame(() => {
    const ww = world.current;
    if (!ww) return;
    ww.landmarks.forEach((lm, i) => {
      const m = mats.current[i];
      if (!m) return;
      const target = lm.discovered ? 0.55 : 0.12 + Math.sin(ww.time * 2.4 + i) * 0.05;
      m.emissiveIntensity += (target - m.emissiveIntensity) * 0.08;
    });
  });

  if (!w) return null;
  return (
    <group>
      {w.landmarks.map((lm, i) => {
        const boss = lm.boss ? BOSSES[lm.boss] : null;
        const color = boss ? boss.color : '#34E2A8';
        return (
          <group key={lm.id} position={[lm.x, 0, lm.z]}>
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.18, 0.28, 2.2, 6]} />
              <meshStandardMaterial ref={(m) => void (mats.current[i] = m)} color={color} emissive={color} emissiveIntensity={0.2} />
            </mesh>
            <mesh position={[0, 2.6, 0]} castShadow>
              {boss ? (
                <coneGeometry args={[0.5, 0.9, 5]} />
              ) : (
                <octahedronGeometry args={[0.34, 0]} />
              )}
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default memo(FrontierScene);
