import React from 'react';
import { Tabs } from 'expo-router';
import { HubTabBar } from '@/ui/components/HubTabBar';
import { palette } from '@/ui/theme/tokens';

/**
 * The hub. Five destinations, one persistent world.
 *
 * The tab bar is custom (`HubTabBar`) rather than the platform default so it can
 * float over game-adjacent screens, carry badges from the shared stores, and use
 * the same press physics as everything else in the app.
 */
export default function HubLayout() {
  return (
    <Tabs
      tabBar={(props) => <HubTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.void },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="play" options={{ title: 'Play' }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests' }} />
      <Tabs.Screen name="collection" options={{ title: 'Items' }} />
      <Tabs.Screen name="store" options={{ title: 'Store' }} />
    </Tabs>
  );
}
