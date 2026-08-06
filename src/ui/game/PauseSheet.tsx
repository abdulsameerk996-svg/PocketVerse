import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { spacing } from '../theme/tokens';
import { useSettingsStore } from '@/core/state/settingsStore';
import { ToggleRow } from '../components/ToggleRow';

export const PauseSheet = memo(function PauseSheet({
  visible,
  title,
  onResume,
  onRestart,
  onQuit,
}: {
  visible: boolean;
  title: string;
  onResume: () => void;
  onRestart?: () => void;
  onQuit: () => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const toggle = useSettingsStore((s) => s.toggle);

  return (
    <Sheet visible={visible} onClose={onResume} title="Paused" subtitle={title}>
      <View style={styles.toggles}>
        <ToggleRow
          label="Sound"
          glyph="🔊"
          value={settings.sound}
          onChange={() => toggle('sound')}
        />
        <ToggleRow
          label="Haptics"
          glyph="📳"
          value={settings.haptics}
          onChange={() => toggle('haptics')}
        />
        <ToggleRow
          label="Reduced motion"
          glyph="🌀"
          value={settings.reducedMotion}
          onChange={() => toggle('reducedMotion')}
        />
      </View>

      <Text variant="caption" muted center style={styles.note}>
        Quitting ends the run — you keep everything you have collected so far.
      </Text>

      <View style={styles.actions}>
        {onRestart ? (
          <Button label="Restart" variant="secondary" onPress={onRestart} style={{ flex: 1 }} />
        ) : null}
        <Button label="Resume" onPress={onResume} style={{ flex: 1.3 }} shine />
      </View>
      <Button label="Quit to hub" variant="ghost" onPress={onQuit} full style={styles.quit} />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  toggles: { gap: spacing.sm, marginBottom: spacing.lg },
  note: { marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
  quit: { marginTop: spacing.sm },
});
