import React, { useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameCanvasProps } from './canvasProps';

/**
 * The 3D surface, web flavour — real DOM canvas.
 * Includes renderer init protection, safe defaults, diagnostics.
 */
export function GameCanvas({ children, ...props }: GameCanvasProps) {
  const handleCreated = useCallback(
    (state: any) => {
      try {
        const { gl, scene } = state;
        if (gl) {
          try {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            const canvas = gl.domElement as HTMLCanvasElement | undefined;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) {
                console.warn('[GameCanvas.web] canvas zero size', rect.width, rect.height, ' — parent may have no dimensions');
              }
            }
          } catch (e) {
            console.warn('[GameCanvas.web] shadowMap setup failed', e);
          }
        }
        if (scene) {
          try {
            if (!scene.background) scene.background = new THREE.Color('#08080F');
            if (!scene.fog) scene.fog = new THREE.Fog('#08080F', 26, 70);
          } catch {}
        }
        try {
          (props as any).onCreated?.(state);
        } catch (e) {
          console.error('[GameCanvas.web] user onCreated threw', e);
        }
      } catch (e) {
        console.error('[GameCanvas.web] onCreated protection caught', e);
      }
    },
    [props],
  );

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, touchAction: 'none', width: '100%', height: '100%' } as any}
      dpr={[1, 2] as any}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true } as any}
      // safe camera defaults if not provided
      camera={{ position: [0, 10, 10], fov: 55, near: 0.1, far: 200, ...(props as any).camera } as any}
      {...props}
      onCreated={handleCreated as any}
    >
      {children}
    </Canvas>
  );
}
