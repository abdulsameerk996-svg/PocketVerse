import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { GameSurfaceProps } from '@/core/registry';
import { Text, palette, spacing } from '@/ui';

/**
 * Pen Fight's entry point — and its loading boundary.
 *
 * `src/games/index.ts` imports every module eagerly so the registry, the store
 * and the quest pool are complete at boot. That is right for metadata and wrong
 * for three.js: pulling the renderer, the scene and the geometry into the
 * startup graph would tax the hub for a game the player may never open.
 *
 * So the module's `Surface` is this shell. It carries no 3D imports at all —
 * `PenFightGame` and everything under `scene/` are behind a dynamic import that
 * resolves the first time somebody actually presses Start. Backing out of the
 * game unmounts the Canvas, and R3F disposes the GL resources with it.
 */

const PenFightGame = lazy(async () => {
  const mod = await import('./PenFightGame');
  return { default: mod.PenFightGame };
});

export function PenFightSurface(props: GameSurfaceProps) {
  return (
    <Suspense fallback={<DeskLoading />}>
      <PenFightGame {...props} />
    </Suspense>
  );
}

function DeskLoading() {
  return (
    <View style={styles.root}>
      <Text size={44}>🖊️</Text>
      <Text variant="heading" center style={{ marginTop: spacing.md }}>
        Clearing the desk
      </Text>
      <ActivityIndicator color={palette.sky} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0713',
  },
});
