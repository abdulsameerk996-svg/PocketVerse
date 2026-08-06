import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { getItem } from '@/content/catalog';
import { purchase, sell } from '@/core/services/shop';
import { formatDuration } from '@/core/utils/time';
import {
  Button,
  Card,
  ItemTile,
  PressableScale,
  ProgressBar,
  SectionHeader,
  Sheet,
  Text,
  Burst,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { CROPS, MAX_PLOTS, PLOT_COST, formatMinutes } from './content';
import { emptyPlot, growthOf, type FarmSave, type Plot } from './types';

/**
 * FARMING
 *
 * Ambient module. Growth is derived from `plantedAt` rather than ticked, so a
 * crop planted before the app is killed is exactly as grown when it reopens —
 * no timers, no background tasks, no clock drift.
 *
 * Seeds and produce are ordinary shared-inventory items, which means harvested
 * corn can be sold in the store, fed to the pet, or spent as a quest objective
 * without the farm knowing any of those systems exist.
 */
export function FarmSurface({ save, setSave, track, grant, modifiers }: GameSurfaceProps) {
  const farm = save as FarmSave;
  const insets = useSafeAreaInsets();
  const { width, s: sc } = useResponsive();
  const level = usePlayerStore((s) => s.player.level);
  const inventory = useInventoryStore();

  const [now, setNow] = useState(Date.now());
  const [seedPickerFor, setSeedPickerFor] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);

  // 1 Hz clock: enough for progress bars, cheap enough to ignore.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cols = width < 380 ? 3 : 4;
  const plotSize = (width - spacing.lg * 2 - (cols - 1) * spacing.sm) / cols;

  const readyCount = useMemo(
    () =>
      farm.plots.filter((p, i) => {
        if (i >= farm.plotCount || !p.cropId) return false;
        const crop = CROPS.find((c) => c.id === p.cropId);
        return crop ? growthOf(p, crop.minutes, now) >= 1 : false;
      }).length,
    [farm.plots, farm.plotCount, now],
  );

  /* ---------------------------------------------------------- actions */

  const plant = useCallback(
    (plotIndex: number, cropId: string) => {
      const crop = CROPS.find((c) => c.id === cropId)!;
      if (!inventory.has(crop.seedId, 1)) {
        haptics.warn();
        return;
      }
      inventory.remove(crop.seedId, 1);
      setSave((prev: FarmSave) => {
        const plots = prev.plots.slice();
        plots[plotIndex] = { cropId, plantedAt: Date.now(), watered: false };
        return { ...prev, plots, planted: prev.planted + 1 };
      });
      track({ crops_planted: 1 });
      haptics.press();
      play('game.collect');
      setSeedPickerFor(null);
    },
    [inventory, setSave, track],
  );

  const water = useCallback(
    (plotIndex: number) => {
      setSave((prev: FarmSave) => {
        const plots = prev.plots.slice();
        if (!plots[plotIndex].cropId || plots[plotIndex].watered) return prev;
        plots[plotIndex] = { ...plots[plotIndex], watered: true };
        return { ...prev, plots };
      });
      haptics.tap();
      play('game.splash');
    },
    [setSave],
  );

  const harvest = useCallback(
    (plotIndex: number) => {
      const plot = farm.plots[plotIndex];
      const crop = CROPS.find((c) => c.id === plot.cropId);
      if (!crop || growthOf(plot, crop.minutes, Date.now()) < 1) return;

      // Luck can double a harvest — the same `luck` stat the runner uses.
      const bonus = Math.random() < modifiers.luck ? 2 : 1;

      setSave((prev: FarmSave) => {
        const plots = prev.plots.slice();
        plots[plotIndex] = emptyPlot();
        return { ...prev, plots, harvested: prev.harvested + bonus };
      });

      track({ crops_harvested: bonus });
      setBurst((b) => b + 1);
      haptics.success();
      play('game.harvest');
      grant(
        { items: { [crop.id]: bonus }, xp: crop.xp * bonus, coins: Math.round(crop.sellValue * 0.15) },
        `Harvested ${crop.name}${bonus > 1 ? ' ×2' : ''}`,
      );
    },
    [farm.plots, grant, modifiers.luck, setSave, track],
  );

  const harvestAll = useCallback(() => {
    farm.plots.forEach((p, i) => {
      if (i >= farm.plotCount || !p.cropId) return;
      const crop = CROPS.find((c) => c.id === p.cropId);
      if (crop && growthOf(p, crop.minutes, Date.now()) >= 1) harvest(i);
    });
  }, [farm.plotCount, farm.plots, harvest]);

  const buyPlot = useCallback(() => {
    if (farm.plotCount >= MAX_PLOTS) return;
    const cost = PLOT_COST(farm.plotCount);
    if (!usePlayerStore.getState().spendCoins(cost)) {
      haptics.warn();
      return;
    }
    setSave((prev: FarmSave) => ({ ...prev, plotCount: prev.plotCount + 1 }));
    haptics.success();
  }, [farm.plotCount, setSave]);

  /* -------------------------------------------------------- rendering */

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="gradient" gradient={['#1C2A0E', '#0D1206']} padding={spacing.lg}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text variant="micro" color={palette.lime}>
                HOMESTEAD
              </Text>
              <Text variant="title">
                {readyCount > 0 ? `${readyCount} ready to harvest` : 'Everything is growing'}
              </Text>
              <Text variant="caption" muted style={{ marginTop: 2 }}>
                {farm.harvested} harvested · {farm.plotCount}/{MAX_PLOTS} plots
              </Text>
            </View>
            <Text size={42}>🌾</Text>
          </View>
          {readyCount > 0 ? (
            <Button
              label={`Harvest all (${readyCount})`}
              icon="🧺"
              gradient={['#A3E635', '#22C55E']}
              onPress={harvestAll}
              full
              shine
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>

        <View style={styles.plots}>
          <Burst trigger={burst} radius={120} count={16} colors={[palette.lime, palette.gold, '#fff']} />
          {Array.from({ length: MAX_PLOTS }, (_, i) => {
            const owned = i < farm.plotCount;
            const plot = farm.plots[i] ?? emptyPlot();
            const crop = plot.cropId ? CROPS.find((c) => c.id === plot.cropId) : null;
            const growth = crop ? growthOf(plot, crop.minutes, now) : 0;
            const ready = growth >= 1;
            const remaining = crop
              ? Math.max(0, crop.minutes * 60_000 * (plot.watered ? 0.85 : 1) - (now - plot.plantedAt))
              : 0;

            if (!owned) {
              const isNext = i === farm.plotCount;
              return (
                <PressableScale
                  key={i}
                  onPress={isNext ? buyPlot : undefined}
                  style={[styles.plot, styles.plotLocked, { width: plotSize, height: plotSize }]}
                  scaleTo={0.94}
                >
                  <Text size={20}>{isNext ? '➕' : '🔒'}</Text>
                  {isNext ? (
                    <Text variant="micro" color={palette.coin}>
                      {PLOT_COST(farm.plotCount)} 🪙
                    </Text>
                  ) : null}
                </PressableScale>
              );
            }

            return (
              <PressableScale
                key={i}
                onPress={() =>
                  !crop ? setSeedPickerFor(i) : ready ? harvest(i) : water(i)
                }
                style={[
                  styles.plot,
                  {
                    width: plotSize,
                    height: plotSize,
                    borderColor: ready ? palette.lime : palette.hairline,
                    backgroundColor: ready ? 'rgba(163,230,53,0.16)' : 'rgba(120,90,50,0.16)',
                  },
                ]}
                scaleTo={0.93}
              >
                {crop ? (
                  <Animated.View entering={ZoomIn.duration(200)} style={styles.plotInner}>
                    <Text size={plotSize * 0.36}>
                      {ready ? crop.glyph : growth > 0.45 ? crop.sprout : '🌱'}
                    </Text>
                    {ready ? (
                      <Text variant="micro" color={palette.lime}>
                        READY
                      </Text>
                    ) : (
                      <>
                        <ProgressBar
                          value={growth}
                          height={4}
                          gradient={[palette.lime, palette.mint]}
                          style={{ width: '78%', marginTop: 4 }}
                          glow={false}
                        />
                        <Text variant="micro" faint>
                          {formatDuration(remaining)}
                          {plot.watered ? ' 💧' : ''}
                        </Text>
                      </>
                    )}
                  </Animated.View>
                ) : (
                  <Text size={20} style={{ opacity: 0.35 }}>
                    ➕
                  </Text>
                )}
              </PressableScale>
            );
          })}
        </View>

        <SectionHeader
          title="Seed store"
          subtitle="Buy seeds · higher tiers unlock with your account level"
          action="Sell produce"
          onAction={() => setShopOpen(true)}
        />
        <View style={styles.seedRow}>
          {CROPS.map((c) => {
            const seed = getItem(c.seedId);
            const locked = level < c.minLevel;
            return (
              <View key={c.id} style={styles.seedCard}>
                <ItemTile
                  item={seed}
                  qty={inventory.count(c.seedId)}
                  size={64}
                  locked={locked}
                  showName={false}
                  onPress={() => {
                    if (locked) {
                      haptics.warn();
                      return;
                    }
                    purchase(seed, 1);
                  }}
                />
                <Text variant="caption" numberOfLines={1} center>
                  {c.name}
                </Text>
                <Text variant="micro" color={locked ? palette.textFaint : palette.coin}>
                  {locked ? `Lv ${c.minLevel}` : `${c.seedPrice} 🪙`}
                </Text>
                <Text variant="micro" faint>
                  {formatMinutes(c.minutes)}
                </Text>
              </View>
            );
          })}
        </View>

        <Text variant="caption" faint center style={{ marginTop: spacing.lg }}>
          Crops keep growing while the app is closed. Tap a growing plot to water it
          once — it finishes 15% sooner.
        </Text>
      </ScrollView>

      {/* ------------------------------------------------ seed picker --- */}
      <Sheet
        visible={seedPickerFor != null}
        onClose={() => setSeedPickerFor(null)}
        title="Plant something"
        subtitle="Uses one seed from your shared inventory"
      >
        <View style={styles.pickerGrid}>
          {CROPS.map((c) => {
            const count = inventory.count(c.seedId);
            const locked = level < c.minLevel || count <= 0;
            return (
              <PressableScale
                key={c.id}
                onPress={() => (locked ? haptics.warn() : plant(seedPickerFor!, c.id))}
                style={[styles.pickerItem, locked && { opacity: 0.45 }]}
                scaleTo={0.94}
              >
                <Text size={28}>{c.glyph}</Text>
                <Text variant="caption">{c.name}</Text>
                <Text variant="micro" muted>
                  ×{count} · {formatMinutes(c.minutes)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </Sheet>

      {/* --------------------------------------------------- sell shop --- */}
      <Sheet
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        title="Sell produce"
        subtitle="Produce is worth the same everywhere in PocketVerse"
      >
        <View style={styles.pickerGrid}>
          {CROPS.map((c) => {
            const count = inventory.count(c.id);
            return (
              <PressableScale
                key={c.id}
                onPress={() => (count > 0 ? sell(getItem(c.id), count) : haptics.warn())}
                style={[styles.pickerItem, count === 0 && { opacity: 0.4 }]}
                scaleTo={0.94}
              >
                <Text size={28}>{c.glyph}</Text>
                <Text variant="caption">×{count}</Text>
                <Text variant="micro" color={palette.coin}>
                  {c.sellValue} 🪙 ea
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <Button label="Done" onPress={() => setShopOpen(false)} full style={{ marginTop: spacing.lg }} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  plots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  plot: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  plotInner: { alignItems: 'center', width: '100%' },
  plotLocked: { backgroundColor: 'rgba(255,255,255,0.03)', borderStyle: 'dashed' },
  seedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  seedCard: { width: 72, alignItems: 'center', gap: 1 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  pickerItem: {
    width: 92,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});
