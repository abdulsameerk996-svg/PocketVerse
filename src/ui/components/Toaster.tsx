import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useUiStore, type Toast } from '@/core/state/uiStore';
import { palette, radius, shadow, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';

const TONE: Record<Toast['tone'], string> = {
  default: palette.violet,
  success: palette.mint,
  warn: palette.amber,
  reward: palette.gold,
};

/** Global toast host — mounted once in the root layout, above everything. */
export const Toaster = memo(function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();

  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeInUp.springify().damping(18)}
          exiting={FadeOutUp.duration(200)}
          layout={Layout.springify()}
        >
          <PressableScale
            onPress={() => dismiss(t.id)}
            haptic={false}
            sound={false}
            style={[styles.toast, { borderColor: `${TONE[t.tone]}66` }, shadow.hard]}
          >
            <View style={[styles.glyphBox, { backgroundColor: `${TONE[t.tone]}22` }]}>
              <Text size={18}>{t.glyph ?? '✨'}</Text>
            </View>
            <View style={styles.body}>
              <Text variant="label" numberOfLines={1}>
                {t.title}
              </Text>
              {t.subtitle ? (
                <Text variant="caption" muted numberOfLines={1}>
                  {t.subtitle}
                </Text>
              ) : null}
            </View>
          </PressableScale>
        </Animated.View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 900,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(20,20,34,0.96)',
    borderWidth: 1,
  },
  glyphBox: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
});
