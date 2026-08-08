import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ItemDef } from '@/core/types';
import { palette, radius, rarityColor, shadow, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { Shimmer } from '../fx/Shimmer';
import { SpriteView, spriteForItem, spriteForLock } from '../assets';

export type ItemTileProps = {
  item: ItemDef;
  qty?: number;
  size?: number;
  onPress?: () => void;
  selected?: boolean;
  locked?: boolean;
  isNew?: boolean;
  equipped?: boolean;
  style?: StyleProp<ViewStyle>;
  showName?: boolean;
};

/**
 * Rarity-aware item tile — the atom of the inventory, store, wardrobe and every
 * game's own collection screens. One component, so a legendary fish and a
 * legendary hat glow in exactly the same way.
 */
export const ItemTile = memo(function ItemTile({
  item,
  qty,
  size = 84,
  onPress,
  selected,
  locked,
  isNew,
  equipped,
  style,
  showName = true,
}: ItemTileProps) {
  const color = rarityColor[item.rarity];
  const legendary = item.rarity === 'legendary' || item.rarity === 'mythic';

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.93}
      style={[{ width: size }, style]}
      disabled={!onPress}
    >
      <View
        style={[
          styles.tile,
          {
            height: size,
            borderRadius: radius.md,
            borderColor: selected ? color : `${color}55`,
            borderWidth: selected ? 2 : 1,
          },
          selected || legendary ? shadow.glow(color, selected ? 0.6 : 0.3) : null,
        ]}
      >
        <LinearGradient
          colors={[`${color}2E`, 'rgba(255,255,255,0.02)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {legendary && !locked ? <Shimmer width={size} duration={2800} /> : null}

        {locked ? (
          <SpriteView sprite={spriteForLock(`${item.name} locked`)} size={size * 0.34} />
        ) : (
          <SpriteView
            sprite={spriteForItem(item)}
            size={size * 0.56}
            label={item.name}
          />
        )}

        {qty != null && qty > 1 ? (
          <View style={styles.qty}>
            <Text variant="micro" color={palette.text}>
              ×{qty}
            </Text>
          </View>
        ) : null}

        {isNew ? (
          <View style={[styles.badge, { backgroundColor: palette.rose }]}>
            <Text variant="micro" color={palette.white}>
              NEW
            </Text>
          </View>
        ) : null}

        {equipped ? (
          <View style={[styles.badge, { backgroundColor: palette.mint }]}>
            <Text variant="micro" color={palette.void}>
              ON
            </Text>
          </View>
        ) : null}
      </View>

      {showName ? (
        <Text variant="caption" numberOfLines={1} center muted style={styles.name}>
          {item.name}
        </Text>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
  locked: { opacity: 0.5 },
  qty: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badge: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  name: { marginTop: spacing.xs },
});
