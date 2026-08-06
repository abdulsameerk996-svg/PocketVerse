import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { GameSurfaceProps } from '@/core/registry';
import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { getItem } from '@/content/catalog';
import {
  Button,
  Card,
  ProgressBar,
  PressableScale,
  SectionHeader,
  Text,
  Burst,
  haptics,
  motion,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { clamp } from '@/core/utils/format';
import { dayKey } from '@/core/utils/time';
import { PET_STAT_KEYS, moodFor, wellbeing, type PetSave, type PetStatKey } from './types';
import { TOYS, FOODS } from './content';

const STAT_META: Record<PetStatKey, { label: string; glyph: string; color: string }> = {
  hunger: { label: 'Fed', glyph: '🍖', color: palette.amber },
  happiness: { label: 'Happy', glyph: '💜', color: palette.rose },
  energy: { label: 'Rested', glyph: '💤', color: palette.sky },
  hygiene: { label: 'Clean', glyph: '🫧', color: palette.cyan },
};

/**
 * Virtual Pet — an *ambient* module.
 *
 * There is no run to win: the pet's state decays on wall-clock time (simulated
 * on boot via `simulateOffline`) and care actions restore it. Rewards are
 * granted per action through the shared `grant` channel, so caring for the pet
 * levels the same account that the runner and the fishing spot do.
 */
export function PetSurface({ save, setSave, track, grant, modifiers }: GameSurfaceProps) {
  const s = save as PetSave;
  const { s: sc, height } = useResponsive();
  const insets = useSafeAreaInsets();
  const petSkinId = usePlayerStore((st) => st.player.avatar.equipped.pet) ?? 'pet_blob';
  const skin = getItem(petSkinId);
  const inventory = useInventoryStore();

  const [burst, setBurst] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);

  const score = wellbeing(s);
  const mood = moodFor(score);

  /* -------------------------------------------------- idle animation --- */
  const bob = useSharedValue(0);
  const squash = useSharedValue(0);
  const tilt = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: s.sleeping ? 3200 : 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [bob, s.sleeping]);

  const petStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -bob.value * (s.sleeping ? 3 : 9) },
      { scaleX: 1 + squash.value * 0.16 },
      { scaleY: 1 - squash.value * 0.16 },
      { rotate: `${tilt.value * 8}deg` },
    ],
  }));

  const react = useCallback(
    (glyph: string) => {
      setBurst((b) => b + 1);
      setReaction(glyph);
      squash.value = withSequence(
        withSpring(1, motion.springPop),
        withSpring(0, motion.springSoft),
      );
      tilt.value = withSequence(withSpring(1, motion.springPop), withSpring(0, motion.spring));
      setTimeout(() => setReaction(null), 900);
    },
    [squash, tilt],
  );

  /* ----------------------------------------------------- care actions --- */

  const applyCare = useCallback(
    (patch: Partial<Record<PetStatKey, number>>, opts: { metric: any; glyph: string; bondXp: number }) => {
      const today = dayKey();
      setSave((prev: PetSave) => {
        const next: PetSave = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          next[k as PetStatKey] = clamp((prev[k as PetStatKey] ?? 0) + (v ?? 0), 0, 100);
        }
        next.careToday = prev.careDay === today ? prev.careToday + 1 : 1;
        next.careDay = today;
        next.bondXp = prev.bondXp + opts.bondXp;
        while (next.bondXp >= bondXpFor(next.bond)) {
          next.bondXp -= bondXpFor(next.bond);
          next.bond += 1;
        }
        next.lastTick = Date.now();
        return next;
      });
      track({ [opts.metric]: 1, pet_care_actions: 1 });
      react(opts.glyph);
      haptics.collect();
    },
    [react, setSave, track],
  );

  const feed = useCallback(
    (foodId: string) => {
      const food = FOODS.find((f) => f.id === foodId)!;
      if (food.cost > 0 && !usePlayerStore.getState().spendCoins(food.cost)) {
        haptics.warn();
        return;
      }
      play('pet.eat');
      applyCare(
        { hunger: food.hunger, happiness: food.happiness, energy: food.energy ?? 0 },
        { metric: 'pet_fed', glyph: food.glyph, bondXp: 12 },
      );
      grant({ xp: 8 + Math.round(food.hunger / 4) }, 'Fed your pet');
    },
    [applyCare, grant],
  );

  const clean = useCallback(() => {
    play('game.splash');
    applyCare({ hygiene: 45, happiness: 6 }, { metric: 'pet_cleaned', glyph: '🫧', bondXp: 10 });
    grant({ xp: 12, coins: 15 }, 'Cleaned your pet');
  }, [applyCare, grant]);

  const playWith = useCallback(
    (toyId: string) => {
      const toy = TOYS.find((t) => t.id === toyId)!;
      if (!inventory.isUnlocked(toy.id) && toy.price > 0) {
        haptics.warn();
        return;
      }
      play('pet.happy');
      applyCare(
        { happiness: toy.happiness, energy: -toy.energyCost, hunger: -4 },
        { metric: 'pet_played', glyph: toy.glyph, bondXp: 16 },
      );
      grant(
        { xp: 14, coins: Math.round(10 * (1 + modifiers.coinBonus)) },
        `Played with ${toy.name}`,
      );
    },
    [applyCare, grant, inventory, modifiers.coinBonus],
  );

  const toggleSleep = useCallback(() => {
    setSave((prev: PetSave) => ({ ...prev, sleeping: !prev.sleeping, lastTick: Date.now() }));
    if (!s.sleeping) {
      track({ pet_slept: 1 });
      grant({ xp: 6 }, 'Tucked in');
    }
    haptics.press();
    react(s.sleeping ? '☀️' : '🌙');
  }, [grant, react, s.sleeping, setSave, track]);

  const petSize = Math.min(sc(180), height * 0.24);

  const affordableFoods = useMemo(
    () => FOODS.filter((f) => f.minBond <= s.bond),
    [s.bond],
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ------------------------------------------------ pet stage --- */}
      <Card variant="gradient" gradient={['#1B1030', '#0C0C17']} style={styles.stage} padding={spacing.xl}>
        <View style={styles.moodRow}>
          <View>
            <Text variant="micro" color={mood.color}>
              {mood.label.toUpperCase()}
            </Text>
            <Text variant="title">{s.name}</Text>
          </View>
          <View style={styles.bondBox}>
            <Text variant="micro" muted>
              BOND
            </Text>
            <Text variant="numeric" color={palette.gold}>
              {s.bond}
            </Text>
          </View>
        </View>

        <View style={[styles.petStage, { height: petSize * 1.25 }]}>
          <LinearGradient
            colors={[`${mood.color}22`, 'transparent']}
            style={[styles.petGlow, { width: petSize * 1.5, height: petSize * 1.5, borderRadius: petSize }]}
          />
          <Burst
            trigger={burst}
            radius={petSize * 0.75}
            count={12}
            colors={[mood.color, palette.white, palette.gold]}
          />
          <Animated.View style={petStyle}>
            <Text size={petSize * 0.62}>{skin.glyph}</Text>
          </Animated.View>
          <Text variant="heading" color={mood.color} style={styles.face}>
            {s.sleeping ? '－_－' : mood.face}
          </Text>
          {reaction ? (
            <Animated.Text style={styles.reaction}>{reaction}</Animated.Text>
          ) : null}
          {s.sleeping ? <Text style={styles.zzz}>💤</Text> : null}
        </View>

        <ProgressBar
          value={s.bondXp / bondXpFor(s.bond)}
          height={6}
          gradient={[palette.gold, palette.amber]}
        />
        <Text variant="caption" muted center style={{ marginTop: spacing.xs }}>
          {Math.round(s.bondXp)} / {bondXpFor(s.bond)} to bond {s.bond + 1}
        </Text>
      </Card>

      {/* ---------------------------------------------------- stats --- */}
      <View style={styles.stats}>
        {PET_STAT_KEYS.map((key) => {
          const meta = STAT_META[key];
          const v = s[key];
          return (
            <Card key={key} variant="glass" padding={spacing.md} style={styles.statCard}>
              <View style={styles.statHead}>
                <Text size={14}>{meta.glyph}</Text>
                <Text variant="caption" muted>
                  {meta.label}
                </Text>
                <Text variant="caption" numeric color={v < 25 ? palette.coral : palette.text}>
                  {Math.round(v)}
                </Text>
              </View>
              <ProgressBar
                value={v / 100}
                height={7}
                gradient={[meta.color, `${meta.color}88`]}
                glow={false}
              />
            </Card>
          );
        })}
      </View>

      {/* ---------------------------------------------------- feed --- */}
      <SectionHeader title="Feed" subtitle="Restores hunger and a little joy" />
      <View style={styles.row}>
        {affordableFoods.map((f) => (
          <PressableScale key={f.id} onPress={() => feed(f.id)} style={styles.actionTile} scaleTo={0.93}>
            <Text size={26}>{f.glyph}</Text>
            <Text variant="caption" numberOfLines={1}>
              {f.name}
            </Text>
            <Text variant="micro" color={palette.coin}>
              {f.cost > 0 ? `${f.cost} 🪙` : 'FREE'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {/* ---------------------------------------------------- toys --- */}
      <SectionHeader
        title="Toys"
        subtitle="Costs energy, pays back happiness"
        right={
          <Text variant="caption" muted>
            {s.toys.length}/{TOYS.length} owned
          </Text>
        }
      />
      <View style={styles.row}>
        {TOYS.map((t) => {
          const owned = t.price === 0 || inventory.isUnlocked(t.id);
          return (
            <PressableScale
              key={t.id}
              onPress={() => (owned ? playWith(t.id) : buyToy(t.id, t.price, setSave))}
              style={[styles.actionTile, !owned && styles.lockedTile]}
              scaleTo={0.93}
            >
              <Text size={26}>{owned ? t.glyph : '🔒'}</Text>
              <Text variant="caption" numberOfLines={1}>
                {t.name}
              </Text>
              <Text variant="micro" color={owned ? palette.mint : palette.coin}>
                {owned ? `+${t.happiness} 💜` : `${t.price} 🪙`}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {/* --------------------------------------------------- care --- */}
      <View style={styles.careRow}>
        <Button
          label="Clean"
          icon="🫧"
          variant="secondary"
          onPress={clean}
          style={{ flex: 1 }}
          disabled={s.hygiene > 96}
        />
        <Button
          label={s.sleeping ? 'Wake up' : 'Sleep'}
          icon={s.sleeping ? '☀️' : '🌙'}
          onPress={toggleSleep}
          gradient={s.sleeping ? undefined : ['#3B3FA8', '#1D1F5C']}
          style={{ flex: 1 }}
        />
      </View>

      <Text variant="caption" faint center style={styles.footnote}>
        Your pet keeps living while the app is closed — stats decay on real time and
        are simulated the moment you return.
      </Text>
    </ScrollView>
  );
}

function bondXpFor(bond: number) {
  return 60 + bond * 45;
}

function buyToy(id: string, price: number, setSave: GameSurfaceProps['setSave']) {
  const player = usePlayerStore.getState();
  if (!player.spendCoins(price)) {
    haptics.warn();
    return;
  }
  useInventoryStore.getState().unlock(id);
  setSave((prev: PetSave) => ({ ...prev, toys: [...new Set([...prev.toys, id])] }));
  haptics.success();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  stage: { overflow: 'hidden' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bondBox: { alignItems: 'flex-end' },
  petStage: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.md },
  petGlow: { position: 'absolute' },
  face: { position: 'absolute', bottom: 8 },
  reaction: { position: 'absolute', top: 4, right: 24, fontSize: 30 },
  zzz: { position: 'absolute', top: 10, left: 30, fontSize: 22, opacity: 0.8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '48%', flexGrow: 1 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionTile: {
    width: 84,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  lockedTile: { opacity: 0.7 },
  careRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  footnote: { marginTop: spacing.md, paddingHorizontal: spacing.lg },
});
