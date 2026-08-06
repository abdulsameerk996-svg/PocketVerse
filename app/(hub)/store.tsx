import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { storeItems } from '@/content/catalog';
import { canPurchase, purchase } from '@/core/services/shop';
import { getGame } from '@/core/registry';
import type { ItemDef, ItemKind } from '@/core/types';
import {
  Button,
  Card,
  ItemTile,
  PressableScale,
  Screen,
  SectionHeader,
  Sheet,
  StatChip,
  Text,
  haptics,
  palette,
  radius,
  rarityColor,
  spacing,
  useResponsive,
} from '@/ui';

const CATEGORIES: { id: string; label: string; glyph: string; kinds?: ItemKind[]; slots?: string[] }[] = [
  { id: 'featured', label: 'Featured', glyph: '✨' },
  { id: 'wear', label: 'Wearables', glyph: '👕', slots: ['hat', 'shirt', 'shoes', 'aura', 'trail'] },
  { id: 'world', label: 'World', glyph: '🖼️', slots: ['background'], kinds: ['decoration'] },
  { id: 'gear', label: 'Gear', glyph: '🏎️', kinds: ['vehicle', 'weapon'] },
  { id: 'supplies', label: 'Supplies', glyph: '🧪', kinds: ['consumable', 'seed'] },
];

/**
 * THE STORE
 *
 * A single shop for the whole world. Its stock is `catalog()` filtered to items
 * with a price — so a module that ships new cosmetics puts them on sale here
 * without touching this file.
 */
export default function StoreScreen() {
  const { width } = useResponsive();
  const player = usePlayerStore((s) => s.player);
  const unlocks = useInventoryStore((s) => s.unlocks);
  const [category, setCategory] = useState('featured');
  const [selected, setSelected] = useState<ItemDef | null>(null);

  const all = useMemo(() => storeItems(), []);

  const visible = useMemo(() => {
    if (category === 'featured') {
      // Rotate a small featured set by day so the store never feels static.
      const day = Math.floor(Date.now() / 86400000);
      return [...all]
        .sort((a, b) => hash(a.id + day) - hash(b.id + day))
        .slice(0, 8);
    }
    const cat = CATEGORIES.find((c) => c.id === category)!;
    return all.filter(
      (i) =>
        (cat.slots && i.slot && cat.slots.includes(i.slot)) ||
        (cat.kinds && cat.kinds.includes(i.kind)),
    );
  }, [all, category]);

  const tileSize = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

  return (
    <Screen tabBarPadding>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="display">Store</Text>
            <Text variant="caption" muted>
              Everything here works in every game
            </Text>
          </View>
        </View>

        <View style={styles.balances}>
          <StatChip glyph="🪙" value={player.coins} color={palette.coin} />
          <StatChip glyph="💎" value={player.gems} color={palette.gem} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          {CATEGORIES.map((c) => (
            <PressableScale
              key={c.id}
              onPress={() => setCategory(c.id)}
              scaleTo={0.93}
              haptic="select"
              style={[styles.cat, category === c.id && styles.catActive]}
            >
              <Text size={14}>{c.glyph}</Text>
              <Text variant="caption" color={category === c.id ? palette.white : palette.textMuted}>
                {c.label}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>

        {category === 'featured' ? (
          <Card variant="gradient" gradient={['#3B1E6E', '#170C2E']} padding={spacing.lg}>
            <Text variant="micro" color={palette.gold}>
              TODAY’S PICKS
            </Text>
            <Text variant="heading">Rotates every midnight</Text>
            <Text variant="caption" muted style={{ marginTop: 2 }}>
              The full catalogue is always available under the other tabs.
            </Text>
          </Card>
        ) : null}

        <View style={styles.grid}>
          {visible.map((item) => {
            const ownedNonStack = !item.stackable && !!unlocks[item.id];
            const check = canPurchase(item);
            return (
              <View key={item.id} style={{ width: tileSize }}>
                <ItemTile
                  item={item}
                  size={tileSize}
                  locked={ownedNonStack}
                  onPress={() => setSelected(item)}
                  showName
                />
                <Text
                  variant="micro"
                  center
                  color={
                    ownedNonStack
                      ? palette.mint
                      : check.ok
                        ? item.price!.currency === 'coins'
                          ? palette.coin
                          : palette.gem
                        : palette.textFaint
                  }
                >
                  {ownedNonStack
                    ? 'OWNED'
                    : check.ok === false && check.reason === 'level'
                      ? `LV ${item.minLevel}`
                      : `${item.price!.amount} ${item.price!.currency === 'coins' ? '🪙' : '💎'}`}
                </Text>
              </View>
            );
          })}
        </View>

        <SectionHeader title="Where does the money come from?" />
        <Card variant="glass" padding={spacing.lg}>
          <Text variant="caption" muted>
            Coins come from every game — driving distance, harvested crops, zombie
            waves, rhythm combos. Gems are rarer: daily rewards, perfect runs,
            achievement tiers and legendary catches. Nothing here needs a connection,
            an account, or a purchase.
          </Text>
        </Card>
      </ScrollView>

      <PurchaseSheet item={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function PurchaseSheet({ item, onClose }: { item: ItemDef | null; onClose: () => void }) {
  const owned = useInventoryStore((s) => (item ? !!s.unlocks[item.id] : false));
  const [qty, setQty] = useState(1);

  React.useEffect(() => setQty(1), [item?.id]);

  if (!item) return null;
  const check = canPurchase(item);
  const color = rarityColor[item.rarity];
  const game = item.source ? getGame(item.source) : undefined;
  const total = (item.price?.amount ?? 0) * qty;

  return (
    <Sheet visible onClose={onClose} title={item.name} subtitle={item.rarity.toUpperCase()}>
      <View style={styles.sheetHead}>
        <View style={[styles.sheetGlyph, { borderColor: color, backgroundColor: `${color}22` }]}>
          <Text size={44}>{item.glyph}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body" muted>
            {item.description}
          </Text>
          {game ? (
            <Text variant="caption" color={game.meta.accent}>
              Designed for {game.meta.title} · usable everywhere
            </Text>
          ) : null}
        </View>
      </View>

      {item.stackable ? (
        <View style={styles.qtyRow}>
          {[1, 5, 10].map((n) => (
            <PressableScale
              key={n}
              onPress={() => setQty(n)}
              scaleTo={0.92}
              style={[styles.qtyChip, qty === n && styles.qtyChipActive]}
            >
              <Text variant="label" color={qty === n ? palette.white : palette.textMuted}>
                ×{n}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <Button
        label={
          owned && !item.stackable
            ? 'Already owned'
            : check.ok
              ? `Buy for ${total} ${item.price!.currency === 'coins' ? '🪙' : '💎'}`
              : check.reason === 'level'
                ? `Requires level ${item.minLevel}`
                : check.reason === 'funds'
                  ? 'Not enough currency'
                  : 'Unavailable'
        }
        disabled={!check.ok}
        shine={check.ok}
        full
        style={{ marginTop: spacing.xl }}
        onPress={() => {
          const res = purchase(item, qty);
          if (res.ok) onClose();
          else haptics.warn();
        }}
      />
    </Sheet>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center' },
  balances: { flexDirection: 'row', gap: spacing.sm },
  cats: { gap: spacing.sm, paddingRight: spacing.lg },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  catActive: { backgroundColor: palette.violet, borderColor: palette.violet },
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
  qtyRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  qtyChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  qtyChipActive: { backgroundColor: palette.violet, borderColor: palette.violet },
});
