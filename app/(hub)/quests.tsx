import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Layout } from 'react-native-reanimated';

import { useProgressStore, type ActiveQuest } from '@/core/state/progressStore';
import { usePlayerStore } from '@/core/state/playerStore';
import { grantReward, describeReward } from '@/core/services/rewards';
import { msUntilNextDay, formatDuration } from '@/core/utils/time';
import { getGame } from '@/core/registry';
import {
  Button,
  Card,
  EmptyState,
  PressableScale,
  ProgressBar,
  Screen,
  SectionHeader,
  SpriteView,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  spriteForIcon,
} from '@/ui';

/**
 * QUESTS
 *
 * Reads `progressStore.activeQuests()`, which merges core quests with every
 * module's contributed quests and rotates the daily/weekly pool deterministically
 * by date. Claiming routes through `grantReward`, the single reward funnel.
 */
export default function QuestsScreen() {
  // Selector returns the stable progress map; the merged/rotated list is derived
  // with useMemo so React never sees a fresh array as a "new" store snapshot.
  const questProgress = useProgressStore((s) => s.quests);
  const level = usePlayerStore((s) => s.player.level);
  const quests = useMemo(
    () => useProgressStore.getState().activeQuests(),
    [questProgress, level],
  );
  const claimQuest = useProgressStore((s) => s.claimQuest);
  const [resetIn, setResetIn] = useState(msUntilNextDay());

  useEffect(() => {
    const id = setInterval(() => setResetIn(msUntilNextDay()), 1000);
    return () => clearInterval(id);
  }, []);

  const claim = useCallback(
    (q: ActiveQuest) => {
      const reward = claimQuest(q.def.id);
      if (!reward) {
        haptics.warn();
        return;
      }
      grantReward(reward, {
        raw: true,
        label: `Quest: ${q.def.title}`,
        icon: q.def.icon,
      });
    },
    [claimQuest],
  );

  const daily = quests.filter((q) => q.def.scope === 'daily');
  const weekly = quests.filter((q) => q.def.scope === 'weekly');
  const story = quests.filter((q) => q.def.scope === 'story');
  const claimable = quests.filter((q) => q.progress.completed && !q.progress.claimed);

  return (
    <Screen tabBarPadding>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text variant="display">Quests</Text>
          <Text variant="caption" muted>
            Progress from any game counts toward all of these.
          </Text>
        </View>

        {claimable.length ? (
          <Card variant="gradient" gradient={['#1E5C3E', '#0C2418']} padding={spacing.lg}>
            <Text variant="heading">{claimable.length} reward{claimable.length > 1 ? 's' : ''} waiting</Text>
            <Text variant="caption" muted style={{ marginTop: 2 }}>
              {claimable.map((q) => q.def.title).join(' · ')}
            </Text>
            <Button
              label="Claim all"
              icon="🎁"
              gradient={['#34E2A8', '#0EA5A0']}
              full
              shine
              style={{ marginTop: spacing.md }}
              onPress={() => claimable.forEach(claim)}
            />
          </Card>
        ) : null}

        <SectionHeader title="Daily" subtitle={`resets in ${formatDuration(resetIn)}`} />
        {daily.map((q) => (
          <QuestCard key={`${q.def.id}:${q.progress.period}`} quest={q} onClaim={() => claim(q)} />
        ))}

        <SectionHeader title="Weekly" subtitle="Bigger targets, bigger payouts" />
        {weekly.map((q) => (
          <QuestCard key={`${q.def.id}:${q.progress.period}`} quest={q} onClaim={() => claim(q)} />
        ))}

        <SectionHeader title="Milestones" subtitle="Permanent goals across the whole verse" />
        {story.length ? (
          story.map((q) => (
            <QuestCard key={`${q.def.id}:${q.progress.period}`} quest={q} onClaim={() => claim(q)} />
          ))
        ) : (
          <EmptyState
            glyph="🏁"
            sprite={spriteForIcon('🏁', 'milestones', palette.gold)}
            title="No milestones yet"
            subtitle="Keep levelling to unlock them."
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function QuestCard({ quest, onClaim }: { quest: ActiveQuest; onClaim: () => void }) {
  const { def, progress } = quest;
  const pct = Math.min(1, progress.progress / def.target);
  const claimable = progress.completed && !progress.claimed;
  const game = def.game ? getGame(def.game) : undefined;

  return (
    <Animated.View layout={Layout.springify()}>
      <PressableScale
        onPress={claimable ? onClaim : undefined}
        scaleTo={claimable ? 0.98 : 1}
        haptic={claimable ? 'success' : false}
        style={[
          styles.card,
          progress.claimed && { opacity: 0.45 },
          claimable && { borderColor: palette.mint },
        ]}
      >
        <View style={styles.cardHead}>
          <View style={[styles.icon, claimable && { backgroundColor: 'rgba(52,226,168,0.2)' }]}>
            <SpriteView
              sprite={spriteForIcon(progress.claimed ? '✅' : def.icon, def.title, claimable ? palette.mint : palette.violet)}
              size={20}
              label={def.title}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
                {def.title}
              </Text>
              {game ? (
                <View style={[styles.gameTag, { borderColor: `${game.meta.accent}66` }]}>
                  <Text variant="micro" color={game.meta.accent}>
                    {game.meta.glyph} {game.meta.title}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="caption" muted numberOfLines={2}>
              {def.description}
            </Text>
          </View>
        </View>

        <ProgressBar
          value={pct}
          height={7}
          gradient={claimable ? [palette.mint, palette.lime] : [palette.violet, palette.magenta]}
          style={{ marginTop: spacing.md }}
        />

        <View style={styles.cardFoot}>
          <Text variant="caption" numeric muted>
            {Math.floor(progress.progress)} / {def.target}
          </Text>
          <Text variant="caption" color={claimable ? palette.mint : palette.gold}>
            {progress.claimed ? 'claimed' : claimable ? 'TAP TO CLAIM' : describeReward(def.reward)}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
    marginBottom: spacing.sm,
  },
  cardHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gameTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, borderWidth: 1 },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
});
