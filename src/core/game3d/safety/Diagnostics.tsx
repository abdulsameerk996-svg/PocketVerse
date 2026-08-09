import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, palette, spacing } from '@/ui';
import type { RenderDiag } from './index';

type Props = {
  getDiag: () => RenderDiag;
  refreshMs?: number;
};

export function SafetyDiagnostics({ getDiag, refreshMs = 250 }: Props) {
  const [diag, setDiag] = useState<RenderDiag>(() =>
    getDiag(),
  );

  useEffect(() => {
    const id = setInterval(() => setDiag(getDiag()), refreshMs);
    return () => clearInterval(id);
  }, [getDiag, refreshMs]);

  if (!__DEV__) return null;

  const chip = (label: keyof RenderDiag, ok: boolean, detail?: string) => (
    <View
      key={label as string}
      style={[
        styles.chip,
        { borderColor: ok ? 'rgba(52,226,168,0.5)' : 'rgba(255,107,107,0.6)' },
      ]}
    >
      <Text variant="micro" color={ok ? palette.mint : palette.coral}>
        {String(label).toUpperCase()} {ok ? '✓' : '✗'}
      </Text>
      {detail ? (
        <Text variant="micro" color={palette.textMuted} numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View pointerEvents="none" style={styles.root}>
      {chip('world', diag.world, diag.details.world)}
      {chip('camera', diag.camera, diag.details.camera)}
      {chip('player', diag.player, diag.details.player)}
      {chip('entities', diag.entities, diag.details.entities)}
      {chip('render', diag.render, diag.details.render)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: spacing.huge + spacing.md,
    left: spacing.md,
    gap: 4,
    maxWidth: '64%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(8,8,15,0.72)',
    borderWidth: 1,
  },
  detail: { maxWidth: 140 },
});
