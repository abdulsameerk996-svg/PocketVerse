import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';

import { installGames } from '@/games';
import { bootstrap } from '@/core/services/boot';
import { flush } from '@/core/save/saveService';
import { CelebrationOverlay, Toaster, palette } from '@/ui';
import { BootScreen } from '@/ui/components/BootScreen';

// Games must be registered before anything reads the registry (catalog, saves).
installGames();

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(palette.void);

/**
 * Root layout.
 *
 * Responsibilities, in order:
 *   1. register game modules (module scope, above — must precede hydration)
 *   2. run the boot sequence (DB → migrations → hydrate → offline sim)
 *   3. mount the global overlays every screen relies on
 *
 * No screen renders until boot resolves, so no screen ever has to handle a
 * half-hydrated store.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        void SplashScreen.hideAsync();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to start');
        void SplashScreen.hideAsync();
      });
    return () => {
      cancelled = true;
      void flush();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {ready ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.void },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(hub)" />
            <Stack.Screen name="game/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="modal"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        ) : (
          <BootScreen error={error} />
        )}
        <Toaster />
        <CelebrationOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
});
