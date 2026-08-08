import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';

import { installGames } from '@/games';
import { installSound } from '@/ui/hooks/soundBackend';
import { bootstrap } from '@/core/services/boot';
import { flush } from '@/core/save/saveService';
import { CelebrationOverlay, MAX_FRAME_WIDTH, Toaster, palette } from '@/ui';
import { BootScreen } from '@/ui/components/BootScreen';

// Games must be registered before anything reads the registry (catalog, saves).
installGames();
// Registers the sound sink. Both platforms synthesise every cue at runtime
// (web: WebAudio, native: expo-audio WAV synthesis) — see docs/ASSETS.md.
installSound();

/*
 * Native-only, and guarded for two reasons: neither API means anything in a
 * browser (the web shell paints its own background from `+html.tsx`), and with
 * `web.output: "static"` this module is evaluated in Node at build time, where
 * touching a native module is a build failure rather than a no-op.
 */
if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
  void SystemUI.setBackgroundColorAsync(palette.void);
}

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
        if (Platform.OS !== 'web') void SplashScreen.hideAsync();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to start');
        if (Platform.OS !== 'web') void SplashScreen.hideAsync();
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
        {/*
          On web the app is a centred column no wider than a large phone.
          Without it, a desktop browser stretches a portrait game across 1900px
          and `useResponsive` scales every glyph and control to match. The
          overlays live inside the frame too, so a toast lines up with the UI
          it belongs to rather than with the browser window.

          On native `frame` is just `flex: 1` — the clamp never binds.
        */}
        <View style={styles.frame}>
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
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void, alignItems: 'stretch' },
  frame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: palette.void,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: MAX_FRAME_WIDTH,
          // A hairline edge so the column reads as a device on a wide screen.
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderColor: palette.hairline,
        }
      : null),
  },
});
