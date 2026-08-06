import React, { memo, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useUiStore } from '@/core/state/uiStore';
import { gradients, palette, radius, shadow, spacing } from '../theme/tokens';
import { Text } from './Text';
import { Button } from './Button';
import { Confetti } from '../fx/Confetti';
import { Burst } from '../fx/Particles';
import { describeReward } from '@/core/services/rewards';
import { haptics } from '../hooks/useHaptics';
import { play } from '../hooks/useSound';

/**
 * Level-ups, achievement tiers and big reward moments.
 *
 * Queued in `uiStore` so several can land back-to-back (finishing a run can
 * complete a quest, level you up and tick an achievement) without stomping on
 * each other. They present one at a time, in order.
 */
export const CelebrationOverlay = memo(function CelebrationOverlay() {
  const current = useUiStore((s) => s.celebrations[0]);
  const pop = useUiStore((s) => s.popCelebration);
  const [burstKey, setBurstKey] = useState(0);
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!current || seen.current === current) return;
    seen.current = current;
    setBurstKey((k) => k + 1);
    haptics.success();
    play(current.kind === 'levelUp' ? 'reward.levelup' : 'reward.chest');
  }, [current]);

  if (!current) return null;

  const title =
    current.kind === 'levelUp'
      ? `Level ${current.level}`
      : current.kind === 'achievement'
        ? current.title
        : current.title;

  const subtitle =
    current.kind === 'levelUp'
      ? 'Energy refilled · new rewards unlocked'
      : current.kind === 'achievement'
        ? `Tier ${current.tier} complete`
        : undefined;

  const glyph = current.kind === 'levelUp' ? '⭐' : current.kind === 'achievement' ? current.icon : '🎁';
  const rewardText = current.reward ? describeReward(current.reward) : null;

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
          <LinearGradient
            colors={gradients.violet}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.glyphWrap}>
            <Burst trigger={burstKey} radius={90} count={18} />
            <Text size={64}>{glyph}</Text>
          </View>

          <Text variant="display" center>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" center color="rgba(255,255,255,0.82)" style={styles.sub}>
              {subtitle}
            </Text>
          ) : null}

          {rewardText ? (
            <View style={styles.rewardBox}>
              <Text variant="label" center color={palette.gold}>
                {rewardText}
              </Text>
            </View>
          ) : null}

          <Button label="Nice" onPress={pop} variant="secondary" full style={styles.btn} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,4,10,0.6)' },
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
  rewardBox: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  btn: { marginTop: spacing.xl },
});
