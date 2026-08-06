import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import { useSettingsStore } from '@/core/state/settingsStore';
import { usePlayerStore } from '@/core/state/playerStore';
import { useProgressStore } from '@/core/state/progressStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { hardReset } from '@/core/services/boot';
import { flush } from '@/core/save/saveService';
import { allGames } from '@/core/registry';
import { catalog } from '@/content/catalog';
import {
  Button,
  Card,
  ModalHeader,
  Screen,
  SectionHeader,
  Text,
  ToggleRow,
  haptics,
  palette,
  spacing,
} from '@/ui';

/**
 * SETTINGS
 *
 * Also doubles as the "what is this app" screen: the stats block is a live
 * readout of the shared systems, which is the clearest possible demonstration
 * that ten games are writing into one save.
 */
export default function SettingsModal() {
  const settings = useSettingsStore((s) => s.settings);
  const toggle = useSettingsStore((s) => s.toggle);
  const player = usePlayerStore((s) => s.player);
  const metrics = useProgressStore((s) => s.metrics);
  const entries = useInventoryStore((s) => s.entries);
  const unlocks = useInventoryStore((s) => s.unlocks);
  const [busy, setBusy] = useState(false);

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Erase everything?',
      'This deletes your avatar, level, coins, items and all game progress on this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            haptics.warn();
            await hardReset();
            setBusy(false);
          },
        },
      ],
    );
  }, []);

  const stats = [
    { label: 'Account level', value: `${player.level}` },
    { label: 'Sessions played', value: `${Math.floor(metrics.sessions_played ?? 0)}` },
    { label: 'Coins earned (lifetime)', value: `${Math.floor(metrics.coins_earned ?? 0).toLocaleString()}` },
    { label: 'XP earned (lifetime)', value: `${Math.floor(metrics.xp_earned ?? 0).toLocaleString()}` },
    { label: 'Items collected', value: `${Math.floor(metrics.items_collected ?? 0).toLocaleString()}` },
    { label: 'Item stacks held', value: `${Object.values(entries).filter((e) => e.qty > 0).length}` },
    { label: 'Cosmetics unlocked', value: `${Object.keys(unlocks).length}` },
    { label: 'Games installed', value: `${allGames().length}` },
    { label: 'Catalog size', value: `${catalog().itemList.length} items` },
  ];

  return (
    <Screen ambient={false} edges={{ top: false }}>
      <ModalHeader title="Settings" subtitle="Everything is stored on this device" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Feel" />
        <ToggleRow label="Sound effects" glyph="🔊" value={settings.sound} onChange={() => toggle('sound')} description="Cue hooks are wired; audio files ship separately." />
        <ToggleRow label="Music" glyph="🎶" value={settings.music} onChange={() => toggle('music')} />
        <ToggleRow label="Haptics" glyph="📳" value={settings.haptics} onChange={() => toggle('haptics')} />

        <SectionHeader title="Accessibility" />
        <ToggleRow
          label="Reduced motion"
          glyph="🌀"
          value={settings.reducedMotion}
          onChange={() => toggle('reducedMotion')}
          description="Disables particles, parallax and idle animation everywhere."
        />
        <ToggleRow
          label="High contrast"
          glyph="🔆"
          value={settings.highContrast}
          onChange={() => toggle('highContrast')}
        />
        <ToggleRow
          label="Left-handed controls"
          glyph="🫲"
          value={settings.leftHanded}
          onChange={() => toggle('leftHanded')}
          description="Mirrors on-screen controls in the action games."
        />
        <ToggleRow
          label="Show FPS"
          glyph="📈"
          value={settings.showFps}
          onChange={() => toggle('showFps')}
          description="Overlays a frame counter on game surfaces."
        />

        <SectionHeader title="Your save" subtitle="One save file, ten games" />
        <Card variant="glass" padding={spacing.md}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.statRow, i > 0 && styles.divider]}>
              <Text variant="body" muted>
                {s.label}
              </Text>
              <Text variant="label" numeric>
                {s.value}
              </Text>
            </View>
          ))}
        </Card>

        <Button
          label="Save now"
          icon="💾"
          variant="secondary"
          full
          onPress={async () => {
            await flush();
            haptics.success();
          }}
          style={{ marginTop: spacing.md }}
        />

        <SectionHeader title="Danger zone" />
        <Card variant="outline" padding={spacing.lg}>
          <Text variant="subheading" color={palette.coral}>
            Erase all progress
          </Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Wipes the local database and starts a fresh account. There is no cloud
            backup, because there is no cloud.
          </Text>
          <Button
            label="Erase everything"
            variant="danger"
            full
            loading={busy}
            onPress={confirmReset}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <Text variant="caption" faint center style={{ marginTop: spacing.xl }}>
          PocketVerse v{Constants.expoConfig?.version ?? '1.0.0'} · offline-first ·
          no account, no network, no ads
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: palette.hairline },
});
