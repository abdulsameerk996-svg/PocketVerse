import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { usePlayerStore } from '@/core/state/playerStore';
import { useProgressStore } from '@/core/state/progressStore';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { useGameSaveStore } from '@/core/state/gameSaveStore';
import { allGames } from '@/core/registry';
import { getItem } from '@/content/catalog';
import { xpForLevel, msUntilNextEnergy } from '@/core/economy/progression';
import { currentModifiers } from '@/core/services/rewards';
import { claimDaily, getDailyStatus, type DailyStatus } from '@/core/services/daily';
import { DAILY_LADDER } from '@/content/dailyRewards';
import { activityRepo, type ActivityRow } from '@/core/db/repositories';
import { formatDuration, formatRelative } from '@/core/utils/time';
import type { PetSave } from '@/games/pet/types';
import { wellbeing, moodFor } from '@/games/pet/types';
import type { FarmSave } from '@/games/farm/types';
import { growthOf } from '@/games/farm/types';
import { CROPS } from '@/games/farm/content';

import {
  AvatarView,
  Button,
  Card,
  CountUp,
  EmptyState,
  ItemTile,
  PressableScale,
  ProgressBar,
  Screen,
  SectionHeader,
  StatChip,
  Text,
  useEntrance,
  Shimmer,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
} from '@/ui';

/**
 * THE HUB — "your personal world".
 *
 * Everything on this screen is a live view of the shared stores: the avatar you
 * customised, the currencies every game pays into, the quests every game
 * advances, and ambient widgets contributed by modules (pet mood, crop timers).
 * It owns no game logic of its own.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { s: sc, width } = useResponsive();

  const player = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const tickEnergy = usePlayerStore((s) => s.tickEnergy);
  // Store selectors return stable references only; anything derived is memoised
  // here rather than inside the selector.
  const questProgress = useProgressStore((s) => s.quests);
  const entries = useInventoryStore((s) => s.entries);
  const saves = useGameSaveStore((s) => s.saves);

  const quests = useMemo(
    () => useProgressStore.getState().activeQuests(),
    [questProgress, player.level],
  );
  const newItems = useMemo(
    () => Object.values(entries).filter((e) => !e.seen && e.qty > 0),
    [entries],
  );

  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const mods = currentModifiers();
  const xpNeeded = xpForLevel(player.level);
  const nextEnergyMs = msUntilNextEnergy(
    player.energy,
    player.energyMax,
    player.energyUpdatedAt,
    now,
    1 + mods.energyRegen,
  );

  const refresh = useCallback(async () => {
    tickEnergy(1 + mods.energyRegen);
    const [status, rows] = await Promise.all([getDailyStatus(), activityRepo.recent(8)]);
    setDaily(status);
    setActivity(rows);
  }, [mods.energyRegen, tickEnergy]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      setNow(Date.now());
      usePlayerStore.getState().tickEnergy(1 + mods.energyRegen);
    }, 1000);
    return () => clearInterval(id);
  }, [mods.energyRegen, refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onClaimDaily = useCallback(async () => {
    haptics.success();
    await claimDaily();
    await refresh();
  }, [refresh]);

  /* -------------------------------------------------- ambient widgets */

  const pet = saves.pet as PetSave | undefined;
  const farm = saves.farm as FarmSave | undefined;

  const farmReady = useMemo(() => {
    if (!farm) return 0;
    return farm.plots.slice(0, farm.plotCount).filter((p) => {
      if (!p.cropId) return false;
      const crop = CROPS.find((c) => c.id === p.cropId);
      return crop ? growthOf(p, crop.minutes, now) >= 1 : false;
    }).length;
  }, [farm, now]);

  const featured = useMemo(() => allGames().slice(0, 6), []);
  const claimable = quests.filter((q) => q.progress.completed && !q.progress.claimed);
  const activeQuests = quests.filter((q) => !q.progress.claimed).slice(0, 3);

  const headerEntrance = useEntrance(0);
  const bg = room.wallpaperId ? getItem(room.wallpaperId) : null;

  return (
    <Screen tabBarPadding>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.violet} />
        }
      >
        {/* ------------------------------------------------ identity --- */}
        <Animated.View style={headerEntrance}>
          <Card
            variant="gradient"
            gradient={[bg?.tint ?? '#1B0F33', '#0B0B16']}
            padding={spacing.lg}
            style={styles.identity}
          >
            <View style={styles.identityRow}>
              <PressableScale onPress={() => router.push('/modal/avatar')} scaleTo={0.94}>
                <AvatarView avatar={player.avatar} size={sc(78)} level={player.level} animated />
              </PressableScale>

              <View style={styles.identityBody}>
                <Text variant="micro" color={palette.violet}>
                  {greeting()}
                </Text>
                <Text variant="title" numberOfLines={1}>
                  {player.name}
                </Text>
                <View style={styles.xpRow}>
                  <ProgressBar
                    value={player.xp / xpNeeded}
                    height={8}
                    gradient={[palette.xp, palette.violet]}
                    style={{ flex: 1 }}
                  />
                  <Text variant="caption" muted numeric>
                    {player.xp}/{xpNeeded}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.chips}>
              <StatChip glyph="🪙" value={player.coins} color={palette.coin} onPress={() => router.push('/(hub)/store')} showPlus />
              <StatChip glyph="💎" value={player.gems} color={palette.gem} onPress={() => router.push('/(hub)/store')} showPlus />
              <StatChip
                glyph="⚡"
                value={player.energy}
                suffix={`/${player.energyMax}`}
                color={palette.energy}
              />
              <StatChip glyph="🔥" value={player.streak} color={palette.coral} suffix="d" />
            </View>

            {player.energy < player.energyMax ? (
              <Text variant="caption" faint style={{ marginTop: spacing.sm }}>
                next ⚡ in {formatDuration(nextEnergyMs)}
                {mods.energyRegen > 0 ? `  ·  +${Math.round(mods.energyRegen * 100)}% regen` : ''}
              </Text>
            ) : null}
          </Card>
        </Animated.View>

        {/* --------------------------------------------- daily reward --- */}
        {daily ? (
          <PressableScale
            onPress={daily.available ? onClaimDaily : undefined}
            scaleTo={daily.available ? 0.975 : 1}
            haptic={daily.available ? 'success' : false}
          >
            <Card
              variant="gradient"
              gradient={daily.available ? ['#4A2E8C', '#20123F'] : ['#16162A', '#101020']}
              padding={spacing.lg}
            >
              {daily.available ? <Shimmer width={width} duration={2600} /> : null}
              <View style={styles.dailyHead}>
                <View style={{ flex: 1 }}>
                  <Text variant="micro" color={palette.gold}>
                    DAILY REWARD · DAY {daily.index + 1}
                  </Text>
                  <Text variant="heading">
                    {daily.available ? 'Tap to claim' : 'Claimed — come back tomorrow'}
                  </Text>
                </View>
                <Text size={30}>{DAILY_LADDER[daily.index].glyph}</Text>
              </View>
              <View style={styles.ladder}>
                {DAILY_LADDER.map((d, i) => {
                  const done = i < daily.index || (!daily.available && i === daily.index);
                  const current = daily.available && i === daily.index;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.ladderCell,
                        done && styles.ladderDone,
                        current && styles.ladderCurrent,
                      ]}
                    >
                      <Text size={15}>{done ? '✓' : d.glyph}</Text>
                      <Text variant="micro" faint>
                        {i + 1}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          </PressableScale>
        ) : null}

        {/* --------------------------------------------- your world --- */}
        <SectionHeader
          title="Your world"
          subtitle="Things ticking away while you are elsewhere"
          action="Room"
          onAction={() => router.push('/modal/room')}
        />
        <View style={styles.worldRow}>
          {pet ? (
            <WorldTile
              glyph="🐣"
              title={pet.name}
              value={moodFor(wellbeing(pet)).label}
              tone={moodFor(wellbeing(pet)).color}
              progress={wellbeing(pet) / 100}
              onPress={() => router.push('/game/pet')}
            />
          ) : null}
          {farm ? (
            <WorldTile
              glyph="🌾"
              title="Homestead"
              value={farmReady > 0 ? `${farmReady} ready` : 'growing'}
              tone={farmReady > 0 ? palette.lime : palette.textMuted}
              progress={farm.plotCount ? farmReady / farm.plotCount : 0}
              onPress={() => router.push('/game/farm')}
            />
          ) : null}
          <WorldTile
            glyph="🏆"
            title="Achievements"
            value="track progress"
            tone={palette.gold}
            progress={0}
            onPress={() => router.push('/modal/achievements')}
          />
        </View>

        {/* ------------------------------------------------- quests --- */}
        <SectionHeader
          title="Quests"
          subtitle={claimable.length ? `${claimable.length} ready to claim` : 'Progress from any game counts'}
          action="All"
          onAction={() => router.push('/(hub)/quests')}
        />
        {activeQuests.length ? (
          activeQuests.map((q) => (
            <QuestRow
              key={`${q.def.id}:${q.progress.period}`}
              icon={q.def.icon}
              title={q.def.title}
              description={q.def.description}
              progress={q.progress.progress}
              target={q.def.target}
              completed={q.progress.completed}
              onPress={() => router.push('/(hub)/quests')}
            />
          ))
        ) : (
          <EmptyState glyph="📜" title="All caught up" subtitle="New quests land at midnight." />
        )}

        {/* --------------------------------------------------- play --- */}
        <SectionHeader
          title="Jump in"
          subtitle="Every game feeds the same account"
          action="All games"
          onAction={() => router.push('/(hub)/play')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gameRow}
        >
          {featured.map((g, i) => {
            const locked = player.level < g.meta.minLevel;
            return (
              <PressableScale
                key={g.id}
                onPress={() => (locked ? haptics.warn() : router.push(`/game/${g.id}`))}
                scaleTo={0.94}
                style={[styles.gameCard, { width: sc(132) }]}
              >
                <LinearGradient
                  colors={[`${g.meta.accent}44`, 'rgba(255,255,255,0.02)']}
                  style={StyleSheet.absoluteFill}
                />
                <Text size={34}>{locked ? '🔒' : g.meta.glyph}</Text>
                <Text variant="label" numberOfLines={1}>
                  {g.meta.title}
                </Text>
                <Text variant="micro" color={locked ? palette.textFaint : g.meta.accent} numberOfLines={1}>
                  {locked
                    ? `Level ${g.meta.minLevel}`
                    : g.meta.energyCost > 0
                      ? `${g.meta.energyCost} ⚡`
                      : 'FREE'}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* ---------------------------------------------- new items --- */}
        {newItems.length ? (
          <>
            <SectionHeader
              title="New in your bag"
              subtitle={`${newItems.length} unseen`}
              action="Open"
              onAction={() => router.push('/(hub)/collection')}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemRow}>
              {newItems.slice(0, 10).map((e) => (
                <ItemTile key={e.itemId} item={getItem(e.itemId)} qty={e.qty} size={sc(70)} isNew />
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* ----------------------------------------------- activity --- */}
        <SectionHeader title="Recent" subtitle="Everything you have done lately" />
        <Card variant="glass" padding={spacing.md}>
          {activity.length ? (
            activity.map((a, i) => (
              <View key={a.id} style={[styles.activityRow, i > 0 && styles.activityDivider]}>
                <Text size={17}>{a.icon ?? '•'}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {a.label}
                  </Text>
                  {a.detail ? (
                    <Text variant="caption" muted numberOfLines={1}>
                      {a.detail}
                    </Text>
                  ) : null}
                </View>
                <Text variant="micro" faint>
                  {formatRelative(a.created_at, now)}
                </Text>
              </View>
            ))
          ) : (
            <Text variant="caption" muted center style={{ paddingVertical: spacing.lg }}>
              Play something and it will show up here.
            </Text>
          )}
        </Card>

        <View style={styles.footerRow}>
          <Button
            label="Settings"
            icon="⚙️"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/modal/settings')}
            style={{ flex: 1 }}
          />
          <Button
            label="Customise"
            icon="🎭"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/modal/avatar')}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ---------------------------------------------------------- fragments -- */

function WorldTile({
  glyph,
  title,
  value,
  tone,
  progress,
  onPress,
}: {
  glyph: string;
  title: string;
  value: string;
  tone: string;
  progress: number;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.94} style={styles.worldTile}>
      <Text size={24}>{glyph}</Text>
      <Text variant="caption" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="micro" color={tone} numberOfLines={1}>
        {value}
      </Text>
      <ProgressBar
        value={progress}
        height={4}
        gradient={[tone, `${tone}66`]}
        glow={false}
        style={{ marginTop: 6 }}
      />
    </PressableScale>
  );
}

function QuestRow({
  icon,
  title,
  description,
  progress,
  target,
  completed,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.questRow}>
      <View style={[styles.questIcon, completed && { backgroundColor: 'rgba(52,226,168,0.2)' }]}>
        <Text size={17}>{completed ? '✅' : icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {description}
        </Text>
        <ProgressBar
          value={progress / target}
          height={5}
          gradient={completed ? [palette.mint, palette.lime] : [palette.violet, palette.magenta]}
          glow={false}
          style={{ marginTop: 6 }}
        />
      </View>
      <Text variant="caption" numeric muted>
        {Math.floor(progress)}/{target}
      </Text>
    </PressableScale>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'STILL UP?';
  if (h < 12) return 'GOOD MORNING';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  identity: { overflow: 'hidden' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  identityBody: { flex: 1, gap: 2 },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ladder: { flexDirection: 'row', gap: 5, marginTop: spacing.md },
  ladderCell: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderDone: { backgroundColor: 'rgba(52,226,168,0.18)' },
  ladderCurrent: { borderColor: palette.gold, backgroundColor: 'rgba(255,209,102,0.16)' },
  worldRow: { flexDirection: 'row', gap: spacing.sm },
  worldTile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 2,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.hairline,
    marginBottom: spacing.sm,
  },
  questIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameRow: { gap: spacing.sm, paddingRight: spacing.lg },
  gameCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
    gap: 3,
    minHeight: 108,
    justifyContent: 'center',
  },
  itemRow: { gap: spacing.sm, paddingRight: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  activityDivider: { borderTopWidth: 1, borderTopColor: palette.hairline },
  footerRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
