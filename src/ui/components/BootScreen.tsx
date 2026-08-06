import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { gradients, palette, spacing } from '../theme/tokens';
import { Text } from './Text';

/** Shown while the database migrates and stores hydrate. Usually <300 ms. */
export function BootScreen({ error }: { error?: string | null }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);

  const orb = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + t.value * 0.2 }, { rotate: `${t.value * 90}deg` }],
    opacity: 0.6 + t.value * 0.4,
  }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.hub} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.orb, orb]}>
        <LinearGradient colors={gradients.violet} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Text variant="display" style={{ marginTop: spacing.xxl }}>
        PocketVerse
      </Text>
      <Text variant="caption" muted>
        {error ? 'Something went wrong' : 'waking up your world…'}
      </Text>
      {error ? (
        <Text variant="caption" color={palette.coral} center style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.void },
  orb: { width: 88, height: 88, borderRadius: 28, overflow: 'hidden' },
  error: { marginTop: spacing.lg, paddingHorizontal: spacing.xxl },
});
