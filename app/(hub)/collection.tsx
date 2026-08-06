import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useInventoryStore } from '@/core/state/inventoryStore';
import { usePlayerStore } from '@/core/state/playerStore';
import { catalog, getItem } from '@/content/catalog';
import { getGame } from '@/core/registry';
import { sell, useConsumable } from '@/core/services/shop';
import type { ItemDef, ItemKind } from '@/core/types';
import {
  Button,
  Card,
  EmptyState,
  ItemTile,
  PressableScale,
  Screen,
  SectionHeader,
  Sheet,
  Text,
  haptics,
  palette,
  radius,
  rarityColor,
  spacing,
  useResponsive,
} from '@/ui';

const TABS: { id: 'bag' | 'cosmetics' | 'trophies'; label: string; glyph: string }[] = [
  { id: 'bag', label: 'Bag', glyph: '🎒' },
  { id: 'cosmetics', label: 'Wardrobe', glyph: '👑' },
  { id: 'trophies', label: 'Collections', glyph: '🏅' },
];

const BAG_KINDS: ItemKind[] = ['material', 'consumable', 'seed', 'crop', 'fish', 'trophy'];

/**
 * SHARED INVENTORY
 *
 * One bag for ten games. Items carry a `source` so provenance is visible, but
 * nothing is namespaced — a fish, a crop and a scrap all live in the same store,
 * are sold through the same service, and count toward the same achievements.
 */
export default function CollectionScreen() {
  const router = useRouter();
  const { width } = useResponsive();
  const entries = useInventoryStore((s) => s.entries);
  const unlocks = useInventoryStore((s) => s.unlocks);
  const markAllSeen = useInventoryStore((s) => s.markAllSeen);
  const player = usePlayerStore((s) => s.player);

  const [tab, setTab] = useState<'bag' | 'cosmetics' | 'trophies'>('bag');
  const [selected, setSelected] = useState<ItemDef | null>(null);

  useEffect(() => {
    const t = setTimeout(markAllSeen, 900);
    return () => clearTimeout(t);
  }, [markAllSeen, tab]);

  const owned = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => e.qty > 0)
        .map((e) => ({ entry: e, def: getItem(e.itemId) }))
        .filter(({ def }) => BAG_KINDS.includes(def.kind))
        .sort((a, b) => b.def.value - a.def.value),
    [entries],
  );

  const cosmetics = useMemo(
    () => catalog().itemList.filter((i) => !!i.slot),
    [],
  );

  const tileSize = (width - spacing.lg * 2 - spacing.sm * 3) / 4;

  const totalValue = owned.reduce((sum, o) => sum + o.def.value * o.entry.qty, 0);

  return (
    <Screen tabBarPadding>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="display">Items</Text>
            <Text variant="caption" muted>
              {owned.length} stacks · worth {totalValue.toLocaleString()} 🪙
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <PressableScale
              key={t.id}
              onPress={() => setTab(t.id)}
              scaleTo={0.94}
              haptic="select"
              style={[styles.tab, tab === t.id && styles.tabActive]}
            >
              <Text size={15}>{t.glyph}</Text>
              <Text variant="caption" color={tab === t.id ? palette.text : palette.textMuted}>
                {t.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {tab === 'bag' ? (
          owned.length ? (
            <View style={styles.grid}>
              {owned.map(({ entry, def }) => (
                <ItemTile
                  key={def.id}
                  item={def}
                  qty={entry.qty}
                  size={tileSize}
                  isNew={!entry.seen}
                  onPress={() => setSelected(def)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              glyph="🎒"
              title="Your bag is empty"
              subtitle="Play anything — every game drops something."
              actionLabel="Find a game"
              onAction={() => router.push('/(hub)/play')}
            />
          )
        ) : null}

        {tab === 'cosmetics' ? (
          <>
            <SectionHeader
              title="Wardrobe"
              subtitle="Equipped cosmetics apply in every game"
              action="Edit avatar"
              onAction={() => router.push('/modal/avatar')}
            />
            <View style={styles.grid}>
              {cosmetics.map((item) => {
                const isOwned = !!unlocks[item.id];
                const equipped = Object.values(player.avatar.equipped).includes(item.id);
                return (
                  <ItemTile
                    key={item.id}
                    item={item}
                    size={tileSize}
                    locked={!isOwned}
                    equipped={equipped}
                    onPress={() => setSelected(item)}
                  />
                );
              })}
            </View>
          </>
        ) : null}

        {tab === 'trophies' ? <CollectionsTab tileSize={tileSize} /> : null}
      </ScrollView>

      <ItemSheet item={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

/* --------------------------------------------------------- collections */

function CollectionsTab({ tileSize }: { tileSize: number }) {
  const entries = useInventoryStore((s) => s.entries);
  const groups = useMemo(() => {
    const bySource = new Map<string, ItemDef[]>();
    for (const item of catalog().itemList) {
      if (!item.source || item.source === 'store') continue;
      const list = bySource.get(item.source) ?? [];
      list.push(item);
      bySource.set(item.source, list);
    }
    return [...bySource.entries()];
  }, []);

  return (
    <>
      {groups.map(([source, items]) => {
        const game = getGame(source);
        const found = items.filter((i) => (entries[i.id]?.qty ?? 0) > 0).length;
        return (
          <View key={source} style={{ marginBottom: spacing.xl }}>
            <SectionHeader
              title={game ? `${game.meta.glyph} ${game.meta.title}` : source}
              subtitle={`${found}/${items.length} discovered`}
            />
            <View style={styles.grid}>
              {items.map((item) => (
                <ItemTile
                  key={item.id}
                  item={item}
                  size={tileSize}
                  qty={entries[item.id]?.qty}
                  locked={(entries[item.id]?.qty ?? 0) === 0}
                  showName={false}
                />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------- item sheet */

function ItemSheet({ item, onClose }: { item: ItemDef | null; onClose: () => void }) {
  const qty = useInventoryStore((s) => (item ? (s.entries[item.id]?.qty ?? 0) : 0));
  const unlocked = useInventoryStore((s) => (item ? !!s.unlocks[item.id] : false));
  const equip = usePlayerStore((s) => s.equip);
  const equipped = usePlayerStore((s) =>
    item?.slot ? s.player.avatar.equipped[item.slot] === item.id : false,
  );

  if (!item) return null;
  const color = rarityColor[item.rarity];
  const game = item.source ? getGame(item.source) : undefined;

  return (
    <Sheet visible onClose={onClose} title={item.name} subtitle={item.rarity.toUpperCase()}>
      <View style={styles.sheetHead}>
        <View style={[styles.sheetGlyph, { borderColor: color, backgroundColor: `${color}22` }]}>
          <Text size={44}>{item.glyph}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body" muted>
            {item.description || 'No description.'}
          </Text>
          {game ? (
            <Text variant="caption" color={game.meta.accent}>
              From {game.meta.title}
            </Text>
          ) : null}
          {item.modifiers ? (
            <View style={styles.mods}>
              {Object.entries(item.modifiers).map(([k, v]) => (
                <View key={k} style={styles.modChip}>
                  <Text variant="micro" color={palette.mint}>
                    {formatModifier(k, v as number)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.lg }}>
        <View style={styles.statRow}>
          <Text variant="caption" muted>
            Owned
          </Text>
          <Text variant="label" numeric>
            {item.stackable ? qty : unlocked ? 'yes' : 'no'}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text variant="caption" muted>
            Value
          </Text>
          <Text variant="label" numeric color={palette.coin}>
            {item.value} 🪙
          </Text>
        </View>
      </Card>

      <View style={styles.sheetActions}>
        {item.slot && unlocked ? (
          <Button
            label={equipped ? 'Equipped' : 'Equip'}
            disabled={equipped}
            onPress={() => {
              equip(item.slot!, item.id);
              haptics.success();
              onClose();
            }}
            style={{ flex: 1 }}
          />
        ) : null}
        {item.kind === 'consumable' && qty > 0 ? (
          <Button
            label="Use"
            variant="success"
            onPress={() => {
              useConsumable(item);
              onClose();
            }}
            style={{ flex: 1 }}
          />
        ) : null}
        {item.stackable && qty > 0 && item.value > 0 ? (
          <Button
            label={`Sell 1 · ${item.value}🪙`}
            variant="secondary"
            onPress={() => sell(item, 1)}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

function formatModifier(key: string, value: number) {
  const label: Record<string, string> = {
    coinBonus: 'coins',
    xpBonus: 'XP',
    speed: 'speed',
    armor: 'armour',
    energyRegen: 'energy regen',
    luck: 'luck',
  };
  if (key === 'armor') return `+${value} ${label[key]}`;
  return `+${Math.round(value * 100)}% ${label[key] ?? key}`;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  tabActive: { backgroundColor: 'rgba(124,92,255,0.2)', borderColor: palette.violet },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetHead: { flexDirection: 'row', gap: spacing.lg },
  sheetGlyph: {
    width: 92,
    height: 92,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  modChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(52,226,168,0.12)',
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
