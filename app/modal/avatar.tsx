import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { persistPickedPhoto } from '@/core/services/photoStore';

import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { itemsBySlot } from '@/content/catalog';
import type { CosmeticSlot } from '@/core/types';
import { uid } from '@/core/utils/format';
import {
  AvatarView,
  Button,
  Card,
  ItemTile,
  ModalHeader,
  PressableScale,
  Screen,
  SectionHeader,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
} from '@/ui';
import { FACE_IDS } from '@/ui/components/AvatarView';

const SLOTS: { id: CosmeticSlot; label: string; glyph: string }[] = [
  { id: 'hat', label: 'Hats', glyph: '🎩' },
  { id: 'shirt', label: 'Tops', glyph: '👕' },
  { id: 'shoes', label: 'Shoes', glyph: '👟' },
  { id: 'aura', label: 'Auras', glyph: '💫' },
  { id: 'pet', label: 'Companion', glyph: '🐾' },
  { id: 'trail', label: 'Trails', glyph: '✨' },
  { id: 'background', label: 'Backdrop', glyph: '🖼️' },
];

const SKIN_TONES = ['#F2D2B4', '#E8B48B', '#C68863', '#8D5524', '#5C3317', '#3A2A22'];
const BODY_COLORS = ['#7C5CFF', '#22D3EE', '#34E2A8', '#FFB443', '#FF6B6B', '#FF4D8D', '#A3E635'];

/**
 * AVATAR STUDIO
 *
 * The avatar is the thread that ties the app together — it appears on the hub,
 * on results screens, in the store, in the pre-run loadout and (as tint and
 * trail) inside the games themselves. Editing it here changes it everywhere,
 * because every surface reads the same `player.avatar`.
 *
 * PHOTOS: the picker returns a local URI, which is copied into the app's own
 * document directory and referenced from there. Nothing is uploaded, no network
 * permission is used, and the image never leaves the device.
 */
export default function AvatarModal() {
  const { s: sc, width } = useResponsive();
  const player = usePlayerStore((s) => s.player);
  const setAvatar = usePlayerStore((s) => s.setAvatar);
  const setName = usePlayerStore((s) => s.setName);
  const equip = usePlayerStore((s) => s.equip);
  const unlocks = useInventoryStore((s) => s.unlocks);

  const [slot, setSlot] = useState<CosmeticSlot>('hat');
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => itemsBySlot(slot), [slot]);
  const tileSize = (width - spacing.lg * 2 - spacing.sm * 3) / 4;

  const pickPhoto = useCallback(async () => {
    try {
      setBusy(true);
      // Browsers grant access through the file dialog itself; there is no
      // permission to request and asking returns an unhelpful denial.
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Photo access needed',
            'PocketVerse needs permission to read the image you choose. It is stored only on this device.',
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.length) return;

      // Native copies into the app's own document directory; web inlines it as
      // a data URL, because a browser has neither. Either way the result is a
      // URI that survives a restart, and nothing leaves the device.
      const stored = await persistPickedPhoto(result.assets[0].uri);
      setAvatar({ photoUri: stored });
      haptics.success();
    } catch {
      Alert.alert('Could not use that image', 'Try another photo.');
    } finally {
      setBusy(false);
    }
  }, [setAvatar]);

  const clearPhoto = useCallback(() => {
    setAvatar({ photoUri: null });
    haptics.tap();
  }, [setAvatar]);

  return (
    <Screen ambient={false} edges={{ top: false }}>
      <ModalHeader title="Avatar studio" subtitle="Applies across every game" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* --------------------------------------------- preview --- */}
        <Card variant="gradient" gradient={['#2A1552', '#0C0A18']} style={styles.preview}>
          <AvatarView avatar={player.avatar} size={sc(140)} level={player.level} animated />
          <Text variant="title" style={{ marginTop: spacing.lg }}>
            {player.name}
          </Text>
          <View style={styles.nameRow}>
            {['Nova', 'Kite', 'Pixel', 'Ash', 'Volt', 'Echo'].map((n) => (
              <PressableScale
                key={n}
                onPress={() => {
                  setName(n);
                  haptics.select();
                }}
                scaleTo={0.92}
                style={[styles.nameChip, player.name === n && styles.nameChipActive]}
              >
                <Text variant="caption" color={player.name === n ? palette.white : palette.textMuted}>
                  {n}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Card>

        {/* ----------------------------------------------- photo --- */}
        <SectionHeader title="Your own picture" subtitle="Stays on this device — never uploaded" />
        <View style={styles.photoRow}>
          <Button
            label={player.avatar.photoUri ? 'Choose another' : 'Choose from library'}
            icon="🖼️"
            onPress={pickPhoto}
            loading={busy}
            style={{ flex: 1 }}
          />
          {player.avatar.photoUri ? (
            <Button label="Remove" variant="secondary" onPress={clearPhoto} />
          ) : null}
        </View>
        <Text variant="caption" faint>
          Use only images you own or have the right to use. PocketVerse works fully
          offline and has no way to share your picture.
        </Text>

        {/* ------------------------------------------ procedural --- */}
        {!player.avatar.photoUri ? (
          <>
            <SectionHeader title="Or build one" subtitle="Face, skin and body colour" />
            <Text variant="label" muted style={styles.subLabel}>
              Expression
            </Text>
            <View style={styles.chipRow}>
              {FACE_IDS.map((f) => (
                <PressableScale
                  key={f}
                  onPress={() => {
                    setAvatar({ faceId: f });
                    haptics.select();
                  }}
                  scaleTo={0.92}
                  style={[styles.faceChip, player.avatar.faceId === f && styles.faceChipActive]}
                >
                  <AvatarView
                    avatar={{ ...player.avatar, faceId: f, equipped: {} }}
                    size={44}
                    showPet={false}
                    showAura={false}
                  />
                </PressableScale>
              ))}
            </View>

            <Text variant="label" muted style={styles.subLabel}>
              Skin
            </Text>
            <View style={styles.chipRow}>
              {SKIN_TONES.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  active={player.avatar.skinTone === c}
                  onPress={() => setAvatar({ skinTone: c })}
                />
              ))}
            </View>

            <Text variant="label" muted style={styles.subLabel}>
              Body
            </Text>
            <View style={styles.chipRow}>
              {BODY_COLORS.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  active={player.avatar.bodyColor === c}
                  onPress={() => setAvatar({ bodyColor: c })}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* -------------------------------------------- wardrobe --- */}
        <SectionHeader title="Wardrobe" subtitle="Bonuses apply in every game" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotRow}>
          {SLOTS.map((s) => (
            <PressableScale
              key={s.id}
              onPress={() => setSlot(s.id)}
              scaleTo={0.93}
              haptic="select"
              style={[styles.slotChip, slot === s.id && styles.slotChipActive]}
            >
              <Text size={14}>{s.glyph}</Text>
              <Text variant="caption" color={slot === s.id ? palette.white : palette.textMuted}>
                {s.label}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>

        <View style={styles.grid}>
          {options.map((item) => {
            const owned = !!unlocks[item.id];
            const isEquipped = player.avatar.equipped[slot] === item.id;
            return (
              <ItemTile
                key={item.id}
                item={item}
                size={tileSize}
                locked={!owned}
                selected={isEquipped}
                equipped={isEquipped}
                onPress={() => {
                  if (!owned) {
                    haptics.warn();
                    return;
                  }
                  equip(slot, item.id);
                  haptics.success();
                }}
              />
            );
          })}
        </View>

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.md }}>
          <Text variant="caption" muted>
            Locked pieces come from the store, quest rewards and achievement tiers.
            Anything you equip changes how you look on the hub, in the results screen,
            and inside the games that render your character.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Swatch({ color, active, onPress }: { color: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => {
        onPress();
        haptics.select();
      }}
      scaleTo={0.88}
      style={[
        styles.swatch,
        { backgroundColor: color, borderColor: active ? palette.white : 'transparent' },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md },
  preview: { alignItems: 'center', paddingVertical: spacing.xxl },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md, justifyContent: 'center' },
  nameChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  nameChipActive: { backgroundColor: palette.violet },
  photoRow: { flexDirection: 'row', gap: spacing.sm },
  subLabel: { marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  faceChip: { padding: 4, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  faceChipActive: { borderColor: palette.violet, backgroundColor: 'rgba(124,92,255,0.14)' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  slotRow: { gap: spacing.sm, paddingRight: spacing.lg },
  slotChip: {
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
  slotChipActive: { backgroundColor: palette.violet, borderColor: palette.violet },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
