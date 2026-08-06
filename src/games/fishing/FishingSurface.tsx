import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { usePlayerStore } from '@/core/state/playerStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { createRng, weightedPick } from '@/core/utils/rng';
import { getItem } from '@/content/catalog';
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
  rarityColor,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { ALL_FISH, LOCATIONS, type FishDef } from './content';
import type { FishingSave } from './types';

type Phase = 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'caught' | 'lost';

/**
 * FISHING
 *
 * A cast/bite/reel loop. The reel minigame is a worklet simulation (the fish
 * drifts, the player's bar falls under gravity and rises while held) so it runs
 * at display refresh rate; everything around it is ordinary React.
 *
 * Caught fish are shared-inventory items, so the collection screen, the store,
 * quests and the room's aquarium all read the same data with no extra plumbing.
 */
export function FishingSurface({ onFinish, track, grant, save, setSave, modifiers, paused }: GameSurfaceProps) {
  const fishSave = save as FishingSave;
  const insets = useSafeAreaInsets();
  const { width, height, s: sc } = useResponsive();
  const level = usePlayerStore((s) => s.player.level);
  const inventory = useInventoryStore();

  const [locationId, setLocationId] = useState(fishSave.location);
  const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0];

  const [phase, setPhase] = useState<Phase>('idle');
  const [hooked, setHooked] = useState<FishDef | null>(null);
  const [burst, setBurst] = useState(0);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sessionCatch, setSessionCatch] = useState<{ id: string; qty: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ------------------------------------------------- reel simulation -- */
  const barY = useSharedValue(0.5); // 0..1 from top of the track
  const barV = useSharedValue(0);
  const fishY = useSharedValue(0.5);
  const fishV = useSharedValue(0);
  const catchProgress = useSharedValue(0);
  const holding = useSharedValue(0);
  const frame = useSharedValue(0);

  const trackH = Math.min(sc(300), height * 0.42);
  const barH = 0.22 + modifiers.luck * 0.05; // fraction of the track

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  /* ----------------------------------------------------------- casting */

  const cast = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('casting');
    haptics.press();
    play('game.splash');

    timers.current.push(
      setTimeout(() => {
        setPhase('waiting');
        const wait = 900 + Math.random() * 3200;
        timers.current.push(
          setTimeout(() => {
            const rng = createRng(Math.floor(Math.random() * 1e9));
            // Luck biases the roll toward rarer fish by re-rolling commons once.
            let pick = weightedPick(rng, location.fish, location.fish.map((f) => f.weight));
            if (pick.rarity === 'common' && rng() < modifiers.luck) {
              pick = weightedPick(rng, location.fish, location.fish.map((f) => f.weight));
            }
            setHooked(pick);
            setPhase('bite');
            haptics.warn();
            play('game.hit');

            // Miss window
            timers.current.push(
              setTimeout(() => {
                setPhase((p) => {
                  if (p !== 'bite') return p;
                  haptics.fail();
                  return 'lost';
                });
                timers.current.push(setTimeout(() => setPhase('idle'), 900));
              }, 1100),
            );
          }, wait),
        );
      }, 700),
    );
  }, [location.fish, modifiers.luck, phase]);

  const strike = useCallback(() => {
    if (phase !== 'bite' || !hooked) return;
    clearTimers();
    barY.value = 0.5;
    barV.value = 0;
    fishY.value = 0.5;
    fishV.value = 0;
    catchProgress.value = 0.25;
    setPhase('reeling');
    haptics.success();
  }, [barV, barY, catchProgress, fishV, fishY, hooked, phase]);

  /* --------------------------------------------------------- reel loop */

  const onCaught = useCallback(() => {
    if (!hooked) return;
    setPhase('caught');
    setBurst((b) => b + 1);
    haptics.success();
    play('reward.chest');

    setSave((prev: FishingSave) => ({
      ...prev,
      caught: prev.caught + 1,
      species: [...new Set([...prev.species, hooked.id])],
      biggest: Math.max(prev.biggest, hooked.value),
    }));
    setSessionCatch((prev) => {
      const found = prev.find((p) => p.id === hooked.id);
      return found
        ? prev.map((p) => (p.id === hooked.id ? { ...p, qty: p.qty + 1 } : p))
        : [...prev, { id: hooked.id, qty: 1 }];
    });

    track({
      fish_caught: 1,
      fishing_legendary: hooked.rarity === 'legendary' || hooked.rarity === 'mythic' ? 1 : 0,
    });
    grant({ items: { [hooked.id]: 1 }, xp: hooked.xp, coins: Math.round(hooked.value * 0.2) }, `Caught ${hooked.name}`);

    timers.current.push(
      setTimeout(() => {
        setPhase('idle');
        setHooked(null);
      }, 1400),
    );
  }, [grant, hooked, setSave, track]);

  const onEscaped = useCallback(() => {
    setPhase('lost');
    haptics.fail();
    play('rhythm.miss');
    timers.current.push(
      setTimeout(() => {
        setPhase('idle');
        setHooked(null);
      }, 1100),
    );
  }, []);

  const fight = hooked?.fight ?? 0.3;

  const reelLoop = useCallback(
    (dt: number) => {
      'worklet';
      frame.value += 1;

      // player bar — gravity down, thrust up while held
      barV.value += (holding.value > 0 ? -1.9 : 1.5) * dt;
      barV.value *= 0.94;
      barY.value += barV.value * dt;
      if (barY.value < 0) {
        barY.value = 0;
        barV.value = 0;
      }
      if (barY.value > 1 - barH) {
        barY.value = 1 - barH;
        barV.value = 0;
      }

      // fish — random walk whose violence scales with `fight`
      if (Math.random() < 0.045 + fight * 0.06) {
        fishV.value = (Math.random() - 0.5) * (0.6 + fight * 1.5);
      }
      fishV.value *= 0.965;
      fishY.value += fishV.value * dt;
      if (fishY.value < 0.02) {
        fishY.value = 0.02;
        fishV.value = Math.abs(fishV.value);
      }
      if (fishY.value > 0.98) {
        fishY.value = 0.98;
        fishV.value = -Math.abs(fishV.value);
      }

      const inside = fishY.value >= barY.value && fishY.value <= barY.value + barH;
      catchProgress.value += (inside ? 0.42 : -0.30) * dt;

      if (catchProgress.value >= 1) {
        catchProgress.value = 1;
        runOnJS(onCaught)();
      } else if (catchProgress.value <= 0) {
        catchProgress.value = 0;
        runOnJS(onEscaped)();
      }
    },
    [barH, barV, barY, catchProgress, fight, fishV, fishY, frame, holding, onCaught, onEscaped],
  );

  useGameLoop(reelLoop, phase === 'reeling' && !paused);

  const holdGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0)
        .maxDistance(9999)
        .onBegin(() => {
          'worklet';
          holding.value = 1;
        })
        .onFinalize(() => {
          'worklet';
          holding.value = 0;
        }),
    [holding],
  );

  /* ------------------------------------------------------------- exit */

  const endSession = useCallback(() => {
    const total = sessionCatch.reduce((sum, c) => sum + c.qty, 0);
    const value = sessionCatch.reduce(
      (sum, c) => sum + (ALL_FISH.find((f) => f.id === c.id)?.value ?? 0) * c.qty,
      0,
    );
    onFinish({
      score: value,
      outcome: 'win',
      metrics: { fish_caught: 0, fish_species: fishSave.species.length },
      reward: { coins: Math.round(value * 0.15), xp: Math.round(total * 6) },
      breakdown: [
        { label: 'Fish caught', value: `${total}` },
        { label: 'Species known', value: `${fishSave.species.length}/${ALL_FISH.length}` },
        { label: 'Location', value: location.name },
      ],
    });
  }, [fishSave.species.length, location.name, onFinish, sessionCatch]);

  /* --------------------------------------------------------- location */

  const switchLocation = useCallback(
    (id: string) => {
      const loc = LOCATIONS.find((l) => l.id === id)!;
      const unlocked = fishSave.unlocked.includes(id);
      if (!unlocked) {
        if (level < loc.minLevel) {
          haptics.warn();
          return;
        }
        if (!usePlayerStore.getState().spendCoins(loc.unlockCost)) {
          haptics.warn();
          return;
        }
        setSave((prev: FishingSave) => ({ ...prev, unlocked: [...prev.unlocked, id] }));
        haptics.success();
      }
      setLocationId(id);
      setSave((prev: FishingSave) => ({ ...prev, location: id }));
      setPhase('idle');
      clearTimers();
    },
    [fishSave.unlocked, level, setSave],
  );

  /* -------------------------------------------------------- rendering */

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.sin(frame.value * 0.06) * 5 }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    top: barY.value * trackH,
    height: barH * trackH,
  }));
  const fishStyle = useAnimatedStyle(() => ({ top: fishY.value * trackH - 14 }));
  const progressStyle = useAnimatedStyle(() => ({ height: `${catchProgress.value * 100}%` }));

  const isReeling = phase === 'reeling';

  return (
    <>
      <ScrollView
        scrollEnabled={!isReeling}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------------------------ water --- */}
        <Card variant="gradient" gradient={[location.tint, '#07070E']} padding={0} style={styles.water}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.waterInner, { height: sc(230) }]}>
            <Burst trigger={burst} radius={110} count={18} colors={[palette.cyan, '#fff', palette.gold]} />

            <Text size={38} style={styles.locGlyph}>
              {location.glyph}
            </Text>

            {phase === 'idle' ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.center}>
                <Text variant="heading">{location.name}</Text>
                <Text variant="caption" muted center>
                  {location.blurb}
                </Text>
              </Animated.View>
            ) : null}

            {(phase === 'casting' || phase === 'waiting') ? (
              <Animated.View entering={FadeIn} style={[styles.center, bobStyle]}>
                <Text size={30}>🎣</Text>
                <Text variant="caption" muted>
                  {phase === 'casting' ? 'Casting…' : 'Waiting for a bite…'}
                </Text>
              </Animated.View>
            ) : null}

            {phase === 'bite' ? (
              <Animated.View entering={FadeIn.duration(90)} style={styles.center}>
                <Text size={54}>❗</Text>
                <Text variant="heading" color={palette.gold}>
                  TAP NOW
                </Text>
              </Animated.View>
            ) : null}

            {phase === 'caught' && hooked ? (
              <Animated.View entering={FadeIn} style={styles.center}>
                <Text size={54}>{hooked.glyph}</Text>
                <Text variant="heading" color={rarityColor[hooked.rarity]}>
                  {hooked.name}
                </Text>
                <Text variant="caption" muted>
                  worth {hooked.value} 🪙
                </Text>
              </Animated.View>
            ) : null}

            {phase === 'lost' ? (
              <Animated.View entering={FadeIn} style={styles.center}>
                <Text size={40}>💨</Text>
                <Text variant="heading" muted>
                  It got away
                </Text>
              </Animated.View>
            ) : null}

            {isReeling && hooked ? (
              <GestureDetector gesture={holdGesture}>
                <View style={styles.reelWrap}>
                  <Text variant="caption" muted>
                    hold to reel
                  </Text>
                  <View style={[styles.track, { height: trackH }]}>
                    <Animated.View style={[styles.reelBar, barStyle]} />
                    <Animated.View style={[styles.reelFish, fishStyle]}>
                      <Text size={22}>{hooked.glyph}</Text>
                    </Animated.View>
                  </View>
                  <View style={[styles.progressTrack, { height: trackH }]}>
                    <Animated.View style={[styles.progressFill, progressStyle]} />
                  </View>
                </View>
              </GestureDetector>
            ) : null}
          </View>
        </Card>

        {!isReeling ? (
          <Button
            label={phase === 'bite' ? 'STRIKE!' : phase === 'idle' ? 'Cast line' : '…'}
            icon={phase === 'bite' ? '❗' : '🎣'}
            onPress={phase === 'bite' ? strike : cast}
            disabled={phase !== 'idle' && phase !== 'bite'}
            gradient={phase === 'bite' ? ['#FFD166', '#FF9F1C'] : undefined}
            shine={phase === 'bite'}
            size="lg"
            full
          />
        ) : null}

        {/* ------------------------------------------- locations --- */}
        <SectionHeader
          title="Locations"
          subtitle="Each has its own fish table"
          action="Collection"
          onAction={() => setCollectionOpen(true)}
        />
        <View style={styles.locRow}>
          {LOCATIONS.map((l) => {
            const unlocked = fishSave.unlocked.includes(l.id);
            const canUnlock = level >= l.minLevel;
            const active = l.id === locationId;
            return (
              <PressableScale
                key={l.id}
                onPress={() => switchLocation(l.id)}
                style={[
                  styles.locCard,
                  {
                    borderColor: active ? palette.cyan : palette.hairline,
                    backgroundColor: active ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                    opacity: unlocked || canUnlock ? 1 : 0.45,
                  },
                ]}
                scaleTo={0.94}
              >
                <Text size={24}>{unlocked ? l.glyph : '🔒'}</Text>
                <Text variant="caption" numberOfLines={1}>
                  {l.name}
                </Text>
                <Text variant="micro" color={unlocked ? palette.mint : palette.coin}>
                  {unlocked ? 'OPEN' : canUnlock ? `${l.unlockCost} 🪙` : `Lv ${l.minLevel}`}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {sessionCatch.length ? (
          <>
            <SectionHeader title="This trip" />
            <View style={styles.catchRow}>
              {sessionCatch.map((c) => (
                <ItemTile key={c.id} item={getItem(c.id)} qty={c.qty} size={62} showName={false} />
              ))}
            </View>
            <Button label="End trip" variant="secondary" onPress={endSession} full />
          </>
        ) : null}
      </ScrollView>

      {/* ------------------------------------------------ collection --- */}
      <Sheet
        visible={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        title="Fish collection"
        subtitle={`${fishSave.species.length} of ${ALL_FISH.length} species`}
      >
        <ProgressBar
          value={fishSave.species.length / ALL_FISH.length}
          height={8}
          gradient={[palette.cyan, palette.sky]}
          style={{ marginBottom: spacing.lg }}
        />
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {LOCATIONS.map((l) => (
            <View key={l.id} style={{ marginBottom: spacing.lg }}>
              <Text variant="label" muted style={{ marginBottom: spacing.sm }}>
                {l.glyph} {l.name}
              </Text>
              <View style={styles.catchRow}>
                {l.fish.map((fish) => {
                  const known = fishSave.species.includes(fish.id);
                  return (
                    <ItemTile
                      key={fish.id}
                      item={getItem(fish.id)}
                      size={62}
                      locked={!known}
                      qty={inventory.count(fish.id)}
                      showName={false}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  water: { overflow: 'hidden' },
  waterInner: { alignItems: 'center', justifyContent: 'center' },
  locGlyph: { position: 'absolute', top: spacing.md, right: spacing.lg, opacity: 0.35 },
  center: { alignItems: 'center', gap: 4 },
  reelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: '100%', paddingVertical: spacing.md },
  track: {
    width: 44,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  reelBar: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(52,226,168,0.35)',
    borderWidth: 1,
    borderColor: palette.mint,
  },
  reelFish: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  progressTrack: {
    width: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  progressFill: { width: '100%', backgroundColor: palette.gold },
  locRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  locCard: {
    width: 84,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  catchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
