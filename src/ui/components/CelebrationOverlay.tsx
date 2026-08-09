import React, { memo, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { create } from 'zustand';
import { gradients, palette, radius, shadow, spacing } from '../theme/tokens';
import { Text } from './Text';
import { Button } from './Button';
import { Confetti } from '../fx/Confetti';
import { Burst } from '../fx/Particles';
import { haptics } from '../hooks/useHaptics';

export type Celebration = {
  kind: 'achievement' | 'milestone' | 'prestige';
  title: string;
  subtitle?: string;
  glyph?: string;
};

type CelebrationState = {
  queue: Celebration[];
  pushCelebration: (c: Celebration) => void;
  popCelebration: () => void;
};

/** Celebration queue — several can land back-to-back; they present one at a time. */
export const useCelebrationStore = create<CelebrationState>((set) => ({
  queue: [],
  pushCelebration: (c) => set((s) => ({ queue: [...s.queue, c] })),
  popCelebration: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

export const CelebrationOverlay = memo(function CelebrationOverlay() {
  const current = useCelebrationStore((s) => s.queue[0]);
  const pop = useCelebrationStore((s) => s.popCelebration);
  const [burstKey, setBurstKey] = useState(0);
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!current || seen.current === current) return;
    seen.current = current;
    setBurstKey((k) => k + 1);
    haptics.success();
  }, [current]);

  if (!current) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={pop}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={pop}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.scrim} />
        </Pressable>

        <Confetti trigger={burstKey} />

        <Animated.View
          entering={ZoomIn.springify().damping(14).stiffness(160)}
          exiting={ZoomOut.duration(180)}
          style={[styles.card, shadow.hard]}
        >
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.glyphWrap}>
            <Burst trigger={burstKey} radius={90} count={18} />
            <Text size={64}>{current.glyph ?? '🍩'}</Text>
          </View>

          <Text variant="display" center>
            {current.title}
          </Text>
          {current.subtitle ? (
            <Text variant="body" center color="rgba(255,255,255,0.9)" style={styles.sub}>
              {current.subtitle}
            </Text>
          ) : null}

          <Button label="Nice!" onPress={pop} variant="secondary" full style={styles.btn} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,6,4,0.6)' },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  glyphWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sub: { marginTop: spacing.xs },
  btn: { marginTop: spacing.xl },
});
