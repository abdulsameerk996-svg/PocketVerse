import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';
import { Text } from './Text';
import { Button } from './Button';
import { SpriteView, type Sprite } from '../assets';

export const EmptyState = memo(function EmptyState({
  glyph = '🫧',
  sprite,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  glyph?: string;
  /** Vector sprite — takes precedence over `glyph` when provided. */
  sprite?: Sprite;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      {sprite ? (
        <SpriteView sprite={sprite} size={48} style={styles.glyph} label={title} />
      ) : (
        <Text size={48} style={styles.glyph}>
          {glyph}
        </Text>
      )}
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
