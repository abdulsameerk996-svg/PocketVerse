import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';

import { MAX_FRAME_WIDTH, palette } from '@/ui';
import { Toaster } from '@/ui/components/Toaster';
import { CelebrationOverlay } from '@/ui/components/CelebrationOverlay';

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

export default function RootLayout() {
  useEffect(() => {
    // The game is ready the moment it mounts — drop the splash immediately.
    if (Platform.OS !== 'web') void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.frame}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.void },
              animation: 'fade',
            }}
          />
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
