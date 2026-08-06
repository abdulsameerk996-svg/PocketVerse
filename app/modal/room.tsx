import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { catalog, getItem } from '@/content/catalog';
import type { RoomPlacement } from '@/core/types';
import { uid, clamp } from '@/core/utils/format';
import {
  AvatarView,
  Button,
  Card,
  ItemTile,
  ModalHeader,
  PressableScale,
  Screen,
  SectionHeader,
  Sheet,
  Text,
  haptics,
  motion,
  palette,
  radius,
  spacing,
  useResponsive,
} from '@/ui';

/**
 * ROOM CUSTOMISATION
 *
 * A free-placement canvas rather than a grid: decorations are stored as
 * normalised 0..1 coordinates so a room laid out on a small phone looks right on
 * a tablet. Dragging runs entirely on the UI thread and commits to the store
 * once, on release.
 */
export default function RoomModal() {
  const { width, s: sc } = useResponsive();
  const player = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const setRoom = usePlayerStore((s) => s.setRoom);
  const unlocks = useInventoryStore((s) => s.unlocks);
  const entries = useInventoryStore((s) => s.entries);

  const [picker, setPicker] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const roomW = width - spacing.lg * 2;
  const roomH = Math.min(sc(340), roomW * 1.05);

  const wallpapers = useMemo(
    () => catalog().itemList.filter((i) => i.slot === 'background'),
    [],
  );
  const ownedDecor = useMemo(
    () =>
      catalog()
        .itemList.filter((i) => i.kind === 'decoration' && (entries[i.id]?.qty ?? 0) > 0)
        .map((i) => ({ def: i, qty: entries[i.id]?.qty ?? 0 })),
    [entries],
  );

  const wallpaper = getItem(room.wallpaperId);

  const place = useCallback(
    (itemId: string) => {
      const placement: RoomPlacement = {
        id: uid('pl_'),
        itemId,
        x: 0.25 + Math.random() * 0.5,
        y: 0.35 + Math.random() * 0.4,
        scale: 1,
        flipped: false,
      };
      setRoom({ placements: [...room.placements, placement] });
      setPicker(false);
      haptics.success();
    },
    [room.placements, setRoom],
  );

  const move = useCallback(
    (id: string, x: number, y: number) => {
      setRoom({
        placements: room.placements.map((p) =>
          p.id === id ? { ...p, x: clamp(x, 0.05, 0.95), y: clamp(y, 0.08, 0.94) } : p,
        ),
      });
    },
    [room.placements, setRoom],
  );

  const update = useCallback(
    (id: string, patch: Partial<RoomPlacement>) => {
      setRoom({ placements: room.placements.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
      haptics.tap();
    },
    [room.placements, setRoom],
  );

  const remove = useCallback(
    (id: string) => {
      setRoom({ placements: room.placements.filter((p) => p.id !== id) });
      setSelectedId(null);
      haptics.tap();
    },
    [room.placements, setRoom],
  );

  const selected = room.placements.find((p) => p.id === selectedId) ?? null;

  return (
    <Screen ambient={false} edges={{ top: false }}>
      <ModalHeader
        title="Your room"
        subtitle={`${room.placements.length} pieces placed`}
        right={
          <PressableScale onPress={() => setPicker(true)} style={styles.addBtn} scaleTo={0.9}>
            <Text size={16}>＋</Text>
          </PressableScale>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ------------------------------------------------ canvas --- */}
        <View style={[styles.room, { width: roomW, height: roomH }]}>
          <LinearGradient
            colors={[wallpaper.tint ?? '#1B0F33', '#08080F']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.floor} />

          {room.placements.map((p) => (
            <Placement
              key={p.id}
              placement={p}
              roomW={roomW}
              roomH={roomH}
              selected={selectedId === p.id}
              onSelect={() => setSelectedId(selectedId === p.id ? null : p.id)}
              onMove={move}
            />
          ))}

          {/* the player stands in their own room */}
          <View style={styles.roomAvatar} pointerEvents="none">
            <AvatarView avatar={player.avatar} size={sc(64)} animated showPet />
          </View>

          {room.placements.length === 0 ? (
            <View style={styles.emptyHint} pointerEvents="none">
              <Text variant="caption" muted center>
                Tap ＋ to place decorations you own.{'\n'}Drag to move, tap to adjust.
              </Text>
            </View>
          ) : null}
        </View>

        {selected ? (
          <Card variant="glass" padding={spacing.md}>
            <View style={styles.editRow}>
              <Text size={22}>{getItem(selected.itemId).glyph}</Text>
              <Text variant="label" style={{ flex: 1 }}>
                {getItem(selected.itemId).name}
              </Text>
              <Button
                label="−"
                size="sm"
                variant="secondary"
                onPress={() => update(selected.id, { scale: clamp(selected.scale - 0.15, 0.6, 2) })}
              />
              <Button
                label="＋"
                size="sm"
                variant="secondary"
                onPress={() => update(selected.id, { scale: clamp(selected.scale + 0.15, 0.6, 2) })}
              />
              <Button
                label="⇋"
                size="sm"
                variant="secondary"
                onPress={() => update(selected.id, { flipped: !selected.flipped })}
              />
              <Button label="Remove" size="sm" variant="danger" onPress={() => remove(selected.id)} />
            </View>
          </Card>
        ) : null}

        {/* --------------------------------------------- wallpaper --- */}
        <SectionHeader title="Backdrop" subtitle="Unlocked backdrops also frame your avatar" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wallRow}>
          {wallpapers.map((w) => {
            const owned = !!unlocks[w.id];
            return (
              <PressableScale
                key={w.id}
                onPress={() => {
                  if (!owned) {
                    haptics.warn();
                    return;
                  }
                  setRoom({ wallpaperId: w.id });
                  usePlayerStore.getState().equip('background', w.id);
                  haptics.select();
                }}
                scaleTo={0.93}
                style={[
                  styles.wallCard,
                  room.wallpaperId === w.id && { borderColor: palette.violet },
                  !owned && { opacity: 0.45 },
                ]}
              >
                <LinearGradient colors={[w.tint ?? '#222', '#0A0A14']} style={StyleSheet.absoluteFill} />
                <Text size={22}>{owned ? w.glyph : '🔒'}</Text>
                <Text variant="micro" numberOfLines={1}>
                  {w.name}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* ------------------------------------------------- picker --- */}
      <Sheet
        visible={picker}
        onClose={() => setPicker(false)}
        title="Place a decoration"
        subtitle="Bought in the store, dropped by achievements"
      >
        {ownedDecor.length ? (
          <View style={styles.pickerGrid}>
            {ownedDecor.map(({ def, qty }) => (
              <ItemTile key={def.id} item={def} qty={qty} size={72} onPress={() => place(def.id)} />
            ))}
          </View>
        ) : (
          <Text variant="body" muted center style={{ paddingVertical: spacing.xl }}>
            You do not own any decorations yet. The store has plenty.
          </Text>
        )}
      </Sheet>
    </Screen>
  );
}

function Placement({
  placement,
  roomW,
  roomH,
  selected,
  onSelect,
  onMove,
}: {
  placement: RoomPlacement;
  roomW: number;
  roomH: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const x = useSharedValue(placement.x * roomW);
  const y = useSharedValue(placement.y * roomH);
  const lift = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      lift.value = withSpring(1, motion.springPop);
    })
    .onChange((e) => {
      'worklet';
      x.value = Math.max(roomW * 0.05, Math.min(roomW * 0.95, x.value + e.changeX));
      y.value = Math.max(roomH * 0.08, Math.min(roomH * 0.94, y.value + e.changeY));
    })
    .onEnd(() => {
      'worklet';
      lift.value = withSpring(0, motion.spring);
      runOnJS(onMove)(placement.id, x.value / roomW, y.value / roomH);
    });

  const tap = Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(onSelect)();
  });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - 24 },
      { translateY: y.value - 24 },
      { scale: placement.scale * (1 + lift.value * 0.12) },
      { scaleX: placement.flipped ? -1 : 1 },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View style={[styles.placement, selected && styles.placementSelected, style]}>
        <Text size={34}>{getItem(placement.itemId).glyph}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md },
  room: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  placement: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  placementSelected: {
    borderWidth: 2,
    borderColor: palette.violet,
    backgroundColor: 'rgba(124,92,255,0.16)',
  },
  roomAvatar: { position: 'absolute', bottom: '8%', alignSelf: 'center' },
  emptyHint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  wallRow: { gap: spacing.sm, paddingRight: spacing.lg },
  wallCard: {
    width: 92,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: palette.hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.violet,
  },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
