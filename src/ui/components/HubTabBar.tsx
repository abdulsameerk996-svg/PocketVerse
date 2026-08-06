import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { motion, palette, radius, shadow, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { useProgressStore } from '@/core/state/progressStore';

const ICONS: Record<string, { on: string; off: string; label: string }> = {
  home: { on: '🏠', off: '🏠', label: 'Home' },
  play: { on: '🎮', off: '🎮', label: 'Play' },
  quests: { on: '📜', off: '📜', label: 'Quests' },
  collection: { on: '🎒', off: '🎒', label: 'Items' },
  store: { on: '🛒', off: '🛒', label: 'Store' },
};

/**
 * Floating glass tab bar.
 *
 * Badges are driven directly from the shared stores, so finishing a quest in a
 * game lights up the Quests tab without any screen coordinating it.
 */
export const HubTabBar = memo(function HubTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Selectors return primitives/stable refs only. Deriving a fresh array inside
  // a zustand selector would hand React a new snapshot on every call.
  const entries = useInventoryStore((s) => s.entries);
  const questProgress = useProgressStore((s) => s.quests);

  const newItems = React.useMemo(
    () => Object.values(entries).filter((e) => !e.seen && e.qty > 0).length,
    [entries],
  );
  const claimable = React.useMemo(
    () =>
      useProgressStore
        .getState()
        .activeQuests()
        .filter((q) => q.progress.completed && !q.progress.claimed).length,
    [questProgress],
  );

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
      <View style={[styles.bar, shadow.hard]}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.barTint} />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const icon = ICONS[route.name] ?? { on: '•', off: '•', label: route.name };
          const badge =
            route.name === 'quests' ? claimable : route.name === 'collection' ? newItems : 0;

          return (
            <TabButton
              key={route.key}
              focused={focused}
              glyph={focused ? icon.on : icon.off}
              label={icon.label}
              badge={badge}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            />
          );
        })}
      </View>
    </View>
  );
});

const TabButton = memo(function TabButton({
  focused,
  glyph,
  label,
  badge,
  onPress,
}: {
  focused: boolean;
  glyph: string;
  label: string;
  badge: number;
  onPress: () => void;
}) {
  const t = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    t.value = withSpring(focused ? 1 : 0, motion.spring);
  }, [focused, t]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.14 }, { translateY: -t.value * 2 }],
    opacity: 0.55 + t.value * 0.45,
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scaleX: 0.4 + t.value * 0.6 }],
  }));

  return (
    <PressableScale onPress={onPress} style={styles.tab} scaleTo={0.9} haptic="select">
      <Animated.View style={iconStyle}>
        <Text size={20}>{glyph}</Text>
      </Animated.View>
      <Text variant="micro" color={focused ? palette.text : palette.textFaint} style={styles.label}>
        {label.toUpperCase()}
      </Text>
      <Animated.View style={[styles.pill, pillStyle]} />
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text variant="micro" color={palette.void}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bar: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    paddingVertical: spacing.sm,
  },
  barTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,14,26,0.72)' },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  label: { marginTop: 1 },
  pill: {
    position: 'absolute',
    bottom: -4,
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.violet,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: '26%',
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: palette.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
