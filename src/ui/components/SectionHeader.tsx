import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { palette, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';

export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  action,
  onAction,
  right,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {action ? (
        <PressableScale onPress={onAction} style={styles.action} scaleTo={0.93}>
          <Text variant="label" color={palette.violet}>
            {action}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  left: { flex: 1 },
  action: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
});
