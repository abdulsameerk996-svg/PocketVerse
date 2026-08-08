import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { AvatarConfig } from '@/core/types';
import { getItem } from '@/content/catalog';
import { palette, radius, shadow } from '../theme/tokens';
import { Text } from './Text';
import { useSettingsStore } from '@/core/state/settingsStore';
import { SpriteView, spriteForFace, spriteForItem } from '../assets';

export type AvatarViewProps = {
  avatar: AvatarConfig;
  size?: number;
  /** Level ring around the portrait. */
  level?: number;
  /** Idle bob — on in the hub, off in dense lists. */
  animated?: boolean;
  showPet?: boolean;
  showAura?: boolean;
  style?: StyleProp<ViewStyle>;
};

const FACES: Record<string, string> = {
  face_calm: '•ᴗ•',
  face_grin: '◕‿◕',
  face_cool: '⌐■_■',
  face_wink: '•‿-',
  face_focus: '◉_◉',
  face_sleepy: '－_－',
};

export const FACE_IDS = Object.keys(FACES);

/**
 * The player's avatar, used identically on the hub, in the store, on results
 * screens and inside games. Cosmetics are resolved from the shared catalog so
 * equipping a hat in the wardrobe changes it everywhere at once.
 *
 * Player-supplied photos are rendered from a local file URI only — nothing is
 * uploaded, and no remote images are ever fetched.
 */
export const AvatarView = memo(function AvatarView({
  avatar,
  size = 84,
  level,
  animated = false,
  showPet = true,
  showAura = true,
  style,
}: AvatarViewProps) {
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!animated || reduced) return;
    bob.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [animated, bob, reduced]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bob.value * 4 }],
  }));

  const hat = avatar.equipped.hat ? getItem(avatar.equipped.hat) : null;
  const shirt = avatar.equipped.shirt ? getItem(avatar.equipped.shirt) : null;
  const aura = avatar.equipped.aura ? getItem(avatar.equipped.aura) : null;
  const pet = avatar.equipped.pet ? getItem(avatar.equipped.pet) : null;
  const bg = avatar.equipped.background ? getItem(avatar.equipped.background) : null;

  const auraColor = aura?.tint;
  const ringWidth = Math.max(2, size * 0.03);

  return (
    <Animated.View style={[{ width: size, height: size }, animated ? bobStyle : null, style]}>
      {/* aura bloom */}
      {showAura && auraColor ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size,
              transform: [{ scale: 1.14 }],
              backgroundColor: `${auraColor}22`,
              ...shadow.glow(auraColor, 0.8),
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      {/* level ring */}
      <LinearGradient
        colors={
          level && level >= 20
            ? [palette.gold, palette.coral]
            : level && level >= 10
              ? [palette.violet, palette.cyan]
              : [palette.hairlineStrong, palette.hairline]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ ...StyleSheet.absoluteFillObject, borderRadius: size }}
      />

      {/* portrait */}
      <View
        style={[
          styles.portrait,
          {
            margin: ringWidth,
            borderRadius: size,
            backgroundColor: bg?.tint ?? palette.abyss,
          },
        ]}
      >
        {avatar.photoUri ? (
          <Image
            source={{ uri: avatar.photoUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
          />
        ) : (
          <ProceduralFace avatar={avatar} size={size} shirtTint={shirt?.tint} />
        )}
      </View>

      {/* hat */}
      {hat && hat.id !== 'hat_none' ? (
        <SpriteView
          sprite={spriteForItem(hat)}
          size={size * 0.52}
          label={hat.name}
          style={[styles.hat, { top: -size * 0.15, transform: [{ rotate: '-8deg' }] }]}
        />
      ) : null}

      {/* pet companion */}
      {showPet && pet ? (
        <View style={[styles.pet, { width: size * 0.34, height: size * 0.34, borderRadius: size }]}>
          <SpriteView sprite={spriteForItem(pet)} size={size * 0.26} label={pet.name} />
        </View>
      ) : null}

      {/* level badge */}
      {level != null ? (
        <View style={[styles.levelBadge, { minWidth: size * 0.34, height: size * 0.26 }]}>
          <Text size={Math.max(9, size * 0.15)} weight="900" color={palette.void}>
            {level}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const ProceduralFace = memo(function ProceduralFace({
  avatar,
  size,
  shirtTint,
}: {
  avatar: AvatarConfig;
  size: number;
  shirtTint?: string;
}) {
  return (
    <View style={styles.fill}>
      {/* shoulders */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: size * 0.95,
          height: size * 0.34,
          borderTopLeftRadius: size * 0.4,
          borderTopRightRadius: size * 0.4,
          backgroundColor: shirtTint ?? avatar.bodyColor,
          opacity: 0.95,
        }}
      />
      {/* head */}
      <View
        style={{
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: size * 0.26,
          backgroundColor: avatar.skinTone,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: size * 0.12,
        }}
      >
        <SpriteView
          sprite={spriteForFace(avatar.faceId, avatar.skinTone)}
          size={size * 0.6}
          label={FACES[avatar.faceId] ?? FACES.face_calm}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  portrait: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end' },
  hat: { position: 'absolute', alignSelf: 'center' },
  pet: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    backgroundColor: palette.elevated,
    borderWidth: 1.5,
    borderColor: palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    left: -4,
    bottom: -4,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
