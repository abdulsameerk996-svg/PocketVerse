import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';
import { Text } from './Text';
import { Button } from './Button';

export const EmptyState = memo(function EmptyState({
  glyph = '🫧',
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  glyph?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text size={48} style={styles.glyph}>
        {glyph}
      </Text>
      <Text variant="heading" center>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" muted center style={styles.sub}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel ? (
        <Button label={actionLabel} onPress={onAction} size="sm" style={styles.btn} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl },
  glyph: { marginBottom: spacing.md, opacity: 0.9 },
  sub: { marginTop: spacing.sm, maxWidth: 260 },
  btn: { marginTop: spacing.lg },
});
