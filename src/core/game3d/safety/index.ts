/**
 * ============================================================================
 *  POCKETVERSE 3D SAFETY LAYER
 * ============================================================================
 *
 * The last line before pixels. Simulations are fuzz-tested for finiteness,
 * but the presentation layer must NEVER trust that: one NaN in a camera
 * position, rotation, or instanced matrix wipes the whole scene on mobile GPUs.
 *
 * This module is intentionally pure (no three.js, no React) except for
 * optional helpers that accept THREE objects. Zero allocation on the hot path
 * where possible — all functions are tiny and side-effect free.
 *
 * Usage:
 *   const [x,y,z] = safePosition(raw.x, raw.z)
 *   const scale = safeScale(raw.scale)
 *   const color = safeColor(raw.color)
 *
 * Fallbacks are always valid, non-degenerate values so the scene keeps
 * rendering even if the sim misbehaves.
 */

export function finiteOr(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Clamp into [lo,hi], tolerating poisoned input. */
export function clampFinite(v: number, lo: number, hi: number): number {
  const c = finiteOr(v, lo);
  if (c < lo) return lo;
  if (c > hi) return hi;
  return c;
}

// ----------------------------------------------------------------------------
// Vector guards

export type Vec3Tuple = readonly [number, number, number];
export type Vec2Tuple = readonly [number, number];

/** Ensure three finite numbers; replace any NaN/Infinity with fallback components. */
export function finiteVector3(
  v: Vec3Tuple | { x: number; y: number; z: number } | [number, number, number] | undefined,
  fallback: Vec3Tuple = [0, 0, 0],
): [number, number, number] {
  if (!v) return [fallback[0], fallback[1], fallback[2]];
  if (Array.isArray(v)) {
    return [finiteOr(v[0], fallback[0]), finiteOr(v[1], fallback[1]), finiteOr(v[2], fallback[2])];
  }
  // object form {x,y,z}
  const obj = v as { x?: number; y?: number; z?: number };
  return [finiteOr(obj.x ?? fallback[0], fallback[0]), finiteOr(obj.y ?? fallback[1], fallback[1]), finiteOr(obj.z ?? fallback[2], fallback[2])];
}

export function finiteVector2(
  v: Vec2Tuple | { x: number; y: number } | undefined,
  fallback: Vec2Tuple = [0, 0],
): [number, number] {
  if (!v) return [fallback[0], fallback[1]];
  if (Array.isArray(v)) return [finiteOr(v[0], fallback[0]), finiteOr(v[1], fallback[1])];
  const obj = v as { x?: number; y?: number };
  return [finiteOr(obj.x ?? fallback[0], fallback[0]), finiteOr(obj.y ?? fallback[1], fallback[1])];
}

// ----------------------------------------------------------------------------
// Position / Rotation / Scale

export function safePosition(
  x: number | { x?: number; y?: number; z?: number } | Vec3Tuple,
  y?: number,
  z?: number,
  fallback: Vec3Tuple = [0, 0, 0],
): [number, number, number] {
  if (typeof x === 'object') {
    return finiteVector3(x as any, fallback);
  }
  // x,y,z numbers
  return [finiteOr(x as number, fallback[0]), finiteOr(y as number, fallback[1]), finiteOr(z as number, fallback[2])];
}

export function safeRotation(
  x: number | { x?: number; y?: number; z?: number } | Vec3Tuple,
  y?: number,
  z?: number,
): [number, number, number] {
  if (typeof x === 'object') return finiteVector3(x as any, [0, 0, 0]);
  return [finiteOr(x as number, 0), finiteOr(y as number, 0), finiteOr(z as number, 0)];
}

export function safeScale(
  v: number | Vec3Tuple | { x?: number; y?: number; z?: number },
  fallback = 1,
  min = 0.001,
  max = 1000,
): [number, number, number] {
  if (typeof v === 'number') {
    const s = clampFinite(v, min, max);
    return [s, s, s];
  }
  if (typeof v === 'object') {
    const tup = finiteVector3(v as any, [fallback, fallback, fallback]);
    return [clampFinite(tup[0], min, max), clampFinite(tup[1], min, max), clampFinite(tup[2], min, max)];
  }
  return [fallback, fallback, fallback];
}

// ----------------------------------------------------------------------------
// Camera, Color, Geometry, Material, Entity

/** Safe camera direction — zero or NaN falls back to up-and-forward default. */
export function safeCameraDir(
  dir: Vec3Tuple,
  fallback: Vec3Tuple = [0, 13.5, 11],
): [number, number, number] {
  const x = finiteOr(dir[0]);
  const y = finiteOr(dir[1], 1);
  const z = finiteOr(dir[2], 0.8);
  if (Math.hypot(x, y, z) < 1e-6) return [fallback[0], fallback[1], fallback[2]];
  return [x, y, z];
}

export function safeCamera(
  position: Vec3Tuple | { x: number; y: number; z: number },
  lookAt: Vec3Tuple | { x: number; y: number; z: number } = [0, 0, 0],
): { position: [number, number, number]; lookAt: [number, number, number] } {
  return {
    position: finiteVector3(position as any, [0, 13.5, 11]),
    lookAt: finiteVector3(lookAt as any, [0, 0, 0]),
  };
}

/** Validate a color string; fallback if invalid. Allows hex, rgb, named. */
export function safeColor(color: unknown, fallback = '#FFFFFF'): string {
  if (typeof color !== 'string') return fallback;
  const c = color.trim();
  if (!c) return fallback;
  // quick hex check
  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?([0-9A-Fa-f]{2})?$/.test(c)) return c;
  // rgb / rgba / hsl
  if (/^(rgb|hsl)a?\(/i.test(c)) {
    // must not contain NaN
    if (/NaN|Infinity/i.test(c)) return fallback;
    return c;
  }
  // named colors — only allow alphabetic (no NaN injection)
  if (/^[a-zA-Z]+$/.test(c) && c.length <= 20) return c;
  // fallback
  // also accept palette tokens that are already hex
  return fallback;
}

/** Guard numeric geometry args (width, height, depth, radius, etc.). */
export function safeGeometry<T extends Record<string, number>>(args: T, mins?: Partial<Record<keyof T, number>>, fallbacks?: Partial<T>): T {
  const out = { ...args };
  for (const k in args) {
    const v = args[k] as unknown as number;
    const fb = (fallbacks?.[k] as unknown as number) ?? (typeof v === 'number' ? v : 1);
    const min = (mins?.[k] as unknown as number) ?? 0.001;
    (out as any)[k] = clampFinite(v as number, min, 10000) || fb;
  }
  return out as T;
}

export function safeMaterial(
  opts: { color?: unknown; emissive?: unknown; roughness?: unknown; metalness?: unknown; opacity?: unknown },
  fallbackColor = '#FFFFFF',
) {
  return {
    color: safeColor(opts.color, fallbackColor),
    emissive: opts.emissive != null ? safeColor(opts.emissive, fallbackColor) : undefined,
    roughness: opts.roughness != null ? clampFinite(opts.roughness as number, 0, 1) : undefined,
    metalness: opts.metalness != null ? clampFinite(opts.metalness as number, 0, 1) : undefined,
    opacity: opts.opacity != null ? clampFinite(opts.opacity as number, 0, 1) : undefined,
  };
}

/** Entity-level guard — any invalid render state falls back safely. */
export type SafeEntityInput = {
  x?: number;
  y?: number;
  z?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  visible?: boolean;
};

export type SafeEntityOutput = {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  visible: boolean;
  valid: boolean;
};

export function safeEntity(input: SafeEntityInput): SafeEntityOutput {
  const x = finiteOr(input.x, 0);
  const y = finiteOr(input.y, 0);
  const z = finiteOr(input.z, 0);
  const rotX = finiteOr(input.rotX, 0);
  const rotY = finiteOr(input.rotY, 0);
  const rotZ = finiteOr(input.rotZ, 0);
  const baseScale = input.scale != null ? clampFinite(input.scale, 0.001, 1000) : 1;
  const sx = input.scaleX != null ? clampFinite(input.scaleX, 0.001, 1000) : baseScale;
  const sy = input.scaleY != null ? clampFinite(input.scaleY, 0.001, 1000) : baseScale;
  const sz = input.scaleZ != null ? clampFinite(input.scaleZ, 0.001, 1000) : baseScale;
  const valid = [x, y, z, rotX, rotY, rotZ, sx, sy, sz].every(Number.isFinite) && sx > 0 && sy > 0 && sz > 0;
  return {
    x: valid ? x : 0,
    y: valid ? y : 0,
    z: valid ? z : 0,
    rotX: valid ? rotX : 0,
    rotY: valid ? rotY : 0,
    rotZ: valid ? rotZ : 0,
    scaleX: valid ? sx : 1,
    scaleY: valid ? sy : 1,
    scaleZ: valid ? sz : 1,
    visible: input.visible !== false && valid,
    valid,
  };
}

// ----------------------------------------------------------------------------
// Instanced & frame-level helpers

/** Returns true if every number in array is finite — quick reject for pools. */
export function allFinite(values: number[]): boolean {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
}

/** Guard for R3F instanced matrix write — skips write if any component invalid. */
export function safeMatrixWrite(
  dst: { setMatrixAt: (i: number, m: any) => void; instanceMatrix: { needsUpdate: boolean } },
  index: number,
  matrix: { elements: number[] } | any,
): boolean {
  // quick NaN check on matrix elements if available
  if (matrix?.elements) {
    const e = matrix.elements as number[];
    for (let i = 0; i < e.length; i++) if (!Number.isFinite(e[i])) return false;
  }
  try {
    dst.setMatrixAt(index, matrix);
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Dev diagnostics model

export type RenderDiag = {
  world: boolean;
  camera: boolean;
  player: boolean;
  entities: boolean;
  render: boolean;
  details: {
    world?: string;
    camera?: string;
    player?: string;
    entities?: string;
    render?: string;
  };
};

export function makeRenderDiag(params: {
  worldOk: boolean;
  cameraOk: boolean;
  playerOk: boolean;
  entitiesOk: boolean;
  renderOk: boolean;
  worldDetail?: string;
  cameraDetail?: string;
  playerDetail?: string;
  entitiesDetail?: string;
  renderDetail?: string;
}): RenderDiag {
  return {
    world: params.worldOk,
    camera: params.cameraOk,
    player: params.playerOk,
    entities: params.entitiesOk,
    render: params.renderOk,
    details: {
      world: params.worldDetail,
      camera: params.cameraDetail,
      player: params.playerDetail,
      entities: params.entitiesDetail,
      render: params.renderDetail,
    },
  };
}
