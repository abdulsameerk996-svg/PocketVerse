import type { ReactNode } from 'react';
import type { RootState } from '@react-three/fiber';

/**
 * The subset of R3F Canvas props Pen Fight actually uses, and which both the
 * native and the web renderer accept identically. Keeping this narrow is what
 * lets the two `GameCanvas` implementations stay interchangeable — anything
 * added here has to exist on both sides.
 */
export type GameCanvasProps = {
  children?: ReactNode;
  shadows?: boolean;
  frameloop?: 'always' | 'demand' | 'never';
  camera?: {
    position?: [number, number, number];
    fov?: number;
    near?: number;
    far?: number;
  };
  gl?: { antialias?: boolean; powerPreference?: WebGLPowerPreference };
  onCreated?: (state: RootState) => void;
};
