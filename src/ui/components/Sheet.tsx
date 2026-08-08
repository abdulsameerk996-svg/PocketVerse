import React, { memo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { palette, radius, spacing } from '../theme/tokens';
import { MAX_FRAME_WIDTH } from '../theme/responsive';
import { Text } from './Text';
import { PressableScale } from './PressableScale';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Prevent dismissing by tapping the scrim (e.g. mandatory results). */
  dismissable?: boolean;
  maxHeight?: `${number}%` | number;
};

/**
 * Bottom sheet used for every modal interaction: item detail, pause menu,
 * results, purchase confirmation. Native `Modal` keeps it above the router's
 * stack; Reanimated layout animations handle the motion.
 */
export const Sheet = memo(function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  dismissable = true,
  maxHeight = '86%',
}: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View style={styles.root}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFill}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined}>
              <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.scrim} />
            </Pressable>
          </Animated.View>

          <Animated.View
            entering={SlideInDown.springify().damping(20).stiffness(180)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, maxHeight: maxHeight as any }]}
          >
            <View style={styles.grabber} />
            {title ? (
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text variant="title">{title}</Text>
                  {subtitle ? (
                    <Text variant="caption" muted style={{ marginTop: 3 }}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {dismissable ? (
                  <PressableScale onPress={onClose} style={styles.close} scaleTo={0.9}>
                    <Text size={16} muted>
                      ✕
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
            ) : null}
            {children}
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
});

const styles = StyleSheet.create({
  // `alignItems: center` + the sheet's own maxWidth keep bottom sheets aligned
  // with the centred app column on desktop web. A native `Modal` renders at the
  // document root, outside the frame in `_layout.tsx`, so it has to be told the
  // width itself rather than inheriting it.
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,4,10,0.55)' },
  sheet: {
    width: '100%',
    maxWidth: MAX_FRAME_WIDTH,
    backgroundColor: palette.abyss,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: palette.hairlineStrong,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.hairlineStrong,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
});
