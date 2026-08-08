import React from 'react';
import { Canvas } from '@react-three/fiber';
import type { GameCanvasProps } from './canvasProps';

/**
 * The 3D surface, web flavour — a real DOM `<canvas>`, no `expo-gl` involved.
 *
 * See `GameCanvas.tsx` for why this split exists. The web renderer accepts a
 * `dpr` prop directly, so the pixel-ratio cap that native has to apply through
 * `setDpr` in `onCreated` is expressed here instead; doing both would fight.
 */
export function GameCanvas({ children, ...props }: GameCanvasProps) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      dpr={[1, 2]}
      {...props}
    >
      {children}
    </Canvas>
  );
}
