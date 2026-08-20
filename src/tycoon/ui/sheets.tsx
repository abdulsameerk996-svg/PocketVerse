import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, Text, ToggleRow, palette, spacing } from '@/ui';
import { formatDuration, formatMoney } from '../format';
import type { TycoonSettings } from '../store';

/* ------------------------------------------------------ SETTINGS ---- */

export const SettingsSheet = memo(function SettingsSheet({
  visible,
  onClose,
  settings,
  onSetting,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  settings: TycoonSettings;
  onSetting: (k: keyof TycoonSettings, v: boolean) => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Sheet visible={visible} onClose={onClose} title="Settings" subtitle="Café Tycoon">
      <View style={styles.stack}>
        <ToggleRow
          label="Sound effects"
          description="Synthesised cues on tap, buys and milestones"
          glyph="🔔"
          value={settings.sound}
          onChange={(v) => onSetting('sound', v)}
        />
        <ToggleRow
          label="Haptics"
          description="Vibration feedback on your taps"
          glyph="📳"
          value={settings.haptics}
          onChange={(v) => onSetting('haptics', v)}
        />

        <View style={styles.spacer} />

        {confirming ? (
          <View style={styles.confirmBox}>
            <Text variant="body" center>
              Wipe your entire café and start over?
            </Text>
            <View style={styles.confirmRow}>
              <Button label="Cancel" variant="secondary" size="sm" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
              <Button
                label="Yes, reset"
                variant="danger"
                size="sm"
                onPress={() => {
                  setConfirming(false);
                  onReset();
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button label="Reset progress" variant="danger" size="sm" onPress={() => setConfirming(true)} />
        )}
      </View>
    </Sheet>
  );
});

/* --------------------------------------------------- PRESTIGE ---- */

export const PrestigeSheet = memo(function PrestigeSheet({
  visible,
  onClose,
  tokens,
  currentBonusPct,
  newBonusPct,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  tokens: number;
  currentBonusPct: number;
  newBonusPct: number;
  onConfirm: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Open a Second Café" subtitle={`+${tokens} Cream Token${tokens > 1 ? 's' : ''}`}>
      <Text variant="body" muted>
        Starting a new café resets your shop and cash, but every Cream Token
        gives you a permanent{' '}
        <Text variant="body" color={palette.gold}>
          +10% income
        </Text>{' '}
        forever. Tokens never reset.
      </Text>

      <View style={styles.tokenRow}>
        <View>
          <Text variant="caption" muted>
            Income bonus now
          </Text>
          <Text variant="heading" numeric>
            +{currentBonusPct}%
          </Text>
        </View>
        <Text variant="title" color={palette.gold}>
          →
        </Text>
        <View>
          <Text variant="caption" muted>
            After opening
          </Text>
          <Text variant="heading" numeric color={palette.gold}>
            +{newBonusPct}%
          </Text>
        </View>
      </View>

      <Text variant="caption" faint style={{ marginTop: spacing.sm }}>
        Resets: cash · generators · this run's earnings. Keeps: upgrades, milestones, tokens.
      </Text>

      <Button
        label="Open the new café"
        gradient={['#FFD98A', '#E8934A']}
        full
        style={{ marginTop: spacing.lg }}
        onPress={onConfirm}
      />
    </Sheet>
  );
});

/* ------------------------------------------------ OFFLINE ---- */

export const OfflineSheet = memo(function OfflineSheet({
  visible,
  onClose,
  earned,
  seconds,
}: {
  visible: boolean;
  onClose: () => void;
  earned: number;
  seconds: number;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Welcome back!" subtitle={`Away for ${formatDuration(seconds)}`} dismissable={false}>
      <Text variant="body" muted center style={{ marginTop: spacing.sm }}>
        Your team kept the shop running while you were gone:
      </Text>
      <View style={styles.offlineEarned}>
        <Text variant="display" color={palette.gold} numeric center>
          {formatMoney(earned)}
        </Text>
        <Text variant="caption" muted center>
          collected while you were away
        </Text>
      </View>
      <Button label="Collect" gradient={['#FFD98A', '#E8934A']} full onPress={onClose} />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  spacer: { height: spacing.sm },
  confirmBox: { gap: spacing.md },
  confirmRow: { flexDirection: 'row', gap: spacing.md },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: 'rgba(255,217,138,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,138,0.2)',
  },
  offlineEarned: { gap: spacing.xs, marginVertical: spacing.lg },
});
