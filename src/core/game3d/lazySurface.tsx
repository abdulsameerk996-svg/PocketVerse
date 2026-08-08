import React, { Suspense, lazy, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { GameSurfaceProps } from '@/core/registry';
import { Text, palette, spacing } from '@/ui';

/**
 * Wrap a 3D game in a loading boundary.
 *
 * `src/games/index.ts` imports every module eagerly so the registry, store and
 * quest pool are complete at boot. That is right for metadata and wrong for
 * three.js — the renderer, the scene and the geometry would be evaluated at
 * startup for every game the player never opens.
 *
 * So each module's `Surface` is a shell created here, carrying no 3D imports at
 * all, and the real game sits behind a dynamic import that resolves the first
 * time somebody presses Start. On web this genuinely code-splits: Metro emits
 * the game as its own chunk. Backing out unmounts the Canvas and R3F disposes
 * the GL resources with it.
 */
export function createLazySurface(
  loader: () => Promise<{ default: ComponentType<GameSurfaceProps> }>,
  glyph: string,
  message = 'Setting up',
) {
  const Game = lazy(loader);

  return function LazyGameSurface(props: GameSurfaceProps) {
    return (
      <Suspense fallback={<Loading glyph={glyph} message={message} />}>
        <Game {...props} />
      </Suspense>
    );
  };
}

function Loading({ glyph, message }: { glyph: string; message: string }) {
  return (
    <View style={styles.root}>
      <Text size={46}>{glyph}</Text>
      <Text variant="heading" center style={{ marginTop: spacing.md }}>
        {message}
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
