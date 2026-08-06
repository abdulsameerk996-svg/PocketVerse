import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';

/** Consistent header for every modal screen. */
export const ModalHeader = memo(function ModalHeader({
  title,
  subtitle,
  right,
  onClose,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClose?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <PressableScale
        onPress={onClose ?? (() => router.back())}
        style={styles.close}
        scaleTo={0.9}
      >
        <Text size={16}>✕</Text>
      </PressableScale>
      <View style={styles.titles}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  titles: { flex: 1 },
  right: { minWidth: 38, alignItems: 'flex-end' },
});
