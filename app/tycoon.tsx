import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale, Text, palette, radius, spacing } from '@/ui';
import { useTycoon } from '@/tycoon/store';
import { useTycoonTicker } from '@/tycoon/ticker';
import { derive, prestigeGain, prestigeMultiplier } from '@/tycoon/engine';
import { formatMoney } from '@/tycoon/format';
import { playCue, syncSoundMute } from '@/tycoon/sound';
import { DonutIcon } from '@/tycoon/art/DonutIcon';
import { CafeScene3D } from '@/tycoon/art/CafeScene3D';
import { ShopPanel, UpgradesPanel, StatsPanel } from '@/tycoon/ui/panels';
import { OfflineSheet, PrestigeSheet, SettingsSheet } from '@/tycoon/ui/sheets';
import { CountUp } from '@/ui/components/CountUp';

type Tab = 'shop' | 'upgrades' | 'stats';

const TABS: { id: Tab; label: string }[] = [
  { id: 'shop', label: 'EQUIP' },
  { id: 'upgrades', label: 'UPGRADES' },
  { id: 'stats', label: 'STATS' },
];

export default function DonutTycoon() {
  useTycoonTicker();
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const state = useTycoon((s) => s.state);
  const settings = useTycoon((s) => s.settings);
  const offlineGain = useTycoon((s) => s.offlineGain);
  const offlineSeconds = useTycoon((s) => s.offlineSeconds);
  const hydrated = useTycoon((s) => s.hydrated);

  const [tab, setTab] = useState<Tab>('shop');
  const [showSettings, setShowSettings] = useState(false);
  const [showPrestige, setShowPrestige] = useState(false);
  const [offlineSeen, setOfflineSeen] = useState(false);

  const d = useMemo(() => derive(state), [state]);

  const onTap = useCallback(() => {
    useTycoon.getState().tap();
    playCue('tap');
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2A160D', '#160F0B', '#0F0906']} style={StyleSheet.absoluteFill} />

      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => router.back()} scaleTo={0.9} style={styles.back}>
          <Text size={16}>←</Text>
        </PressableScale>
        <View style={styles.brand}>
          <DonutIcon size={24} />
          <Text variant="title" style={{ letterSpacing: 1 }}>
            CAFÉ TYCOON
          </Text>
        </View>
        <PressableScale onPress={() => setShowSettings(true)} scaleTo={0.9} style={styles.gear}>
          <Text size={18}>⚙️</Text>
        </PressableScale>
      </View>

      {/* cash + income */}
      <View style={styles.cashWrap}>
        <CountUp value={state.cash} formatter={formatMoney} variant="display" style={{ fontSize: 40 }} />
        <View style={styles.cashMeta}>
          <Text variant="caption" muted>
            {formatMoney(d.cps)} / sec
          </Text>
          {d.prestigeMult > 1 ? (
            <View style={styles.bonusChip}>
              <Text variant="micro" color={palette.gold}>
                +{Math.round((d.prestigeMult - 1) * 100)}% BONUS
              </Text>
            </View>
          ) : null}
          <Text variant="micro" color={palette.textFaint}>
            floor {state.floors} · {state.floorWidth} wide
          </Text>
        </View>
      </View>

      {/* 3D Café Building — the hero visual */}
      <View style={styles.scene3d}>
        <CafeScene3D state={state} />
        {/* Tap overlay — transparent, sits on top of the 3D canvas */}
        <PressableScale onPress={onTap} scaleTo={0.97} haptic="collect" style={styles.tapOverlay}>
          <Text variant="micro" color={palette.gold} style={styles.tapLabel}>
            TAP TO EARN
          </Text>
        </PressableScale>
      </View>

      {/* tabs + panel */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <PressableScale
                key={t.id}
                onPress={() => setTab(t.id)}
                scaleTo={0.94}
                haptic="select"
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text variant="label" color={active ? palette.gold : palette.textMuted}>
                  {t.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.panel}>
          {tab === 'shop' && (
            <ShopPanel
              state={state}
              onBuy={(id) => {
                if (useTycoon.getState().buyGenerator(id)) playCue('buy');
              }}
              onBuyFloor={() => {
                if (useTycoon.getState().buyFloor()) playCue('buy');
              }}
              onBuyRoom={() => {
                if (useTycoon.getState().buyRoom()) playCue('buy');
              }}
            />
          )}
          {tab === 'upgrades' && (
            <UpgradesPanel
              state={state}
              onBuy={(id) => {
                if (useTycoon.getState().buyUpgrade(id)) playCue('upgrade');
              }}
            />
          )}
          {tab === 'stats' && (
            <StatsPanel
              state={state}
              onPrestige={() => setShowPrestige(true)}
              onClaimMilestone={(id) => {
                if (useTycoon.getState().claimMilestone(id)) playCue('milestone');
              }}
            />
          )}
        </View>
      </View>

      {/* sheets */}
      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSetting={(k, v) => {
          useTycoon.getState().setSetting(k, v);
          syncSoundMute();
        }}
        onReset={() => void useTycoon.getState().reset()}
      />

      <PrestigeSheet
        visible={showPrestige}
        onClose={() => setShowPrestige(false)}
        tokens={prestigeGain(state)}
        currentBonusPct={Math.round((prestigeMultiplier(state.prestigeTokens) - 1) * 100)}
        newBonusPct={Math.round((prestigeMultiplier(state.prestigeTokens + prestigeGain(state)) - 1) * 100)}
        onConfirm={() => {
          useTycoon.getState().prestige();
          playCue('prestige');
          setShowPrestige(false);
        }}
      />

      <OfflineSheet
        visible={hydrated && offlineGain > 0 && !offlineSeen}
        onClose={() => {
          setOfflineSeen(true);
          useTycoon.getState().collectOffline();
        }}
        earned={offlineGain}
        seconds={offlineSeconds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,236,214,0.07)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, justifyContent: 'center' },
  gear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,236,214,0.07)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  cashWrap: { alignItems: 'center', gap: 2, paddingVertical: spacing.xs },
  cashMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  bonusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,217,138,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,138,0.3)',
  },
  scene3d: {
    flex: 1,
    minHeight: 200,
    position: 'relative',
  },
  tapOverlay: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,217,138,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,138,0.3)',
  },
  tapLabel: { letterSpacing: 1 },
  bottom: { maxHeight: '42%', paddingHorizontal: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255,236,214,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  tabActive: { backgroundColor: 'rgba(255,217,138,0.12)', borderColor: 'rgba(255,217,138,0.4)' },
  panel: { flex: 1, overflow: 'hidden', borderRadius: radius.lg },
});
