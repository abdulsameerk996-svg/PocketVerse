import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import type { GameCanvasProps } from './canvasProps';

/**
 * The 3D surface, native flavour.
 *
 * R3F ships two renderers behind one package: the native one draws into an
 * `expo-gl` GLView, the web one into a DOM `<canvas>`. Their `Canvas` props
 * differ in small, awkward ways — native has no `dpr` and takes a `ViewStyle`,
 * web takes `CSSProperties` — so rather than sprinkle `Platform.OS` through the
 * arena, the difference is absorbed here and in `GameCanvas.web.tsx`.
 *
 * Everything above this file sees one component with one prop type.
 */
export function GameCanvas({ children, ...props }: GameCanvasProps) {
  return (
    <Canvas style={StyleSheet.absoluteFillObject} {...props}>
      {children}
    </Canvas>
  );
}
