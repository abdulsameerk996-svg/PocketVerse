import React from 'react';
import { Stack } from 'expo-router';
import { palette } from '@/ui/theme/tokens';

/** Modal stack: full-screen editors that sit above the hub. */
export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.void },
        animation: 'slide_from_bottom',
      }}
    />
  );
}
