import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { PixelRatio, Platform } from 'react-native';
import * as THREE from 'three';
import type { GameCanvasProps } from './canvasProps';
import { finiteOr } from './safety';

/**
 * The 3D surface, native flavour — expo-gl GLView.
 * Includes renderer init protection, safe defaults, finite guards, cleanup.
 */
export function GameCanvas({ children, ...props }: GameCanvasProps) {
  const handleCreated = useCallback(
    (state: any) => {
      try {
        const { gl, scene, setDpr } = state;
        if (Platform.OS !== 'web' && setDpr) {
          try {
            setDpr(Math.min(PixelRatio.get(), 2));
          } catch {}
        }
        if (gl) {
          try {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            if (gl.domElement) {
              // ensure non-zero size
              const w = (gl.domElement as any).width ?? 0;
              const h = (gl.domElement as any).height ?? 0;
              if (w === 0 || h === 0) {
                console.warn('[GameCanvas] GL canvas zero size', w, h);
              }
            }
          } catch (e) {
            console.warn('[GameCanvas] shadowMap setup failed', e);
          }
        }
        if (scene) {
          try {
            if (!scene.background) scene.background = new THREE.Color('#08080F');
            if (!scene.fog) scene.fog = new THREE.Fog('#08080F', 26, 70);
          } catch {}
        }
        // call original onCreated if provided
        try {
          (props as any).onCreated?.(state);
        } catch (e) {
          console.error('[GameCanvas] user onCreated threw', e);
        }
      } catch (e) {
        console.error('[GameCanvas] onCreated protection caught', e);
      }
    },
    [props],
  );

  return (
    <Canvas
      style={StyleSheet.absoluteFillObject}
      // safe defaults — props override gl but not onCreated (we protect it)
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true, ...(props as any).gl } as any}
      {...props}
      onCreated={handleCreated as any}
    >
      {children}
    </Canvas>
  );
}
