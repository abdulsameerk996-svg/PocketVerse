import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';

import { allGames } from '@/core/registry';
import type { GameCategory } from '@/core/registry';
import { gradients } from '@/ui/theme/tokens';
import { usePlayerStore } from '@/core/state/playerStore';
import { scoreRepo } from '@/core/db/repositories';
import { SpriteView, spriteForGame, spriteForLock } from '@/ui/assets';
import {
  Card,
  PressableScale,
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

const FILTERS = ['all', 'action', 'versus', 'cosy', 'daily', 'levels'] as const;
type Filter = (typeof FILTERS)[number];

/** Section order in the launcher. Anything without a category is arcade. */
const SECTIONS: { id: GameCategory; label: string; blurb: string }[] = [
  { id: 'adventure', label: 'ADVENTURE', blurb: 'The flagship — explore, fight, survive' },
  { id: 'arcade', label: 'ARCADE', blurb: 'Solo runs, scores and streaks' },
  { id: 'versus', label: '2 PLAYER', blurb: 'Same device, same keyboard, no mercy' },
];

/**
 * THE ARCADE GRID
 *
 * Reads the module registry — it has no knowledge of which games exist. Add a
 * module and it appears here with its gating, energy cost, tags and best score
 * already wired.
 */
export default function PlayScreen() {
  const router = useRouter();
  const { s: sc, width } = useResponsive();
  const player = usePlayerStore((s) => s.player);
  const [filter, setFilter] = useState<Filter>('all');
  const [bests, setBests] = useState<Record<string, number>>({});

  const games = useMemo(() => allGames(), []);

  React.useEffect(() => {
    void scoreRepo.bestAll().then((rows) => {
      const map: Record<string, number> = {};
      for (const [key, v] of Object.entries(rows)) map[key.split(':')[0]] = v;
      setBests(map);
    });
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return games;
    return games.filter((g) => g.meta.tags.includes(filter));
  }, [filter, games]);

  const flagship = useMemo(() => visible.find((g) => g.meta.category === 'adventure'), [visible]);

  /**
   * Grouped into launcher sections. Nothing here knows which games exist — a
   * module that declares `category: 'versus'` appears under 2 PLAYER the moment
   * it is registered, and an empty section renders nothing.
   */
  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        games: visible.filter((g) => (g.meta.category ?? 'arcade') === s.id),
      })).filter((s) => s.games.length > 0),
    [visible],
  );

  const cardW = (width - spacing.lg * 2 - spacing.md) / 2;

  return (
    <Screen tabBarPadding gradient={gradients.hub}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="display">Play</Text>
            <Text variant="caption" muted>
              {games.length} games · one shared account
            </Text>
          </View>
          <StatChip glyph="⚡" value={player.energy} suffix={`/${player.energyMax}`} color={palette.energy} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((f) => (
            <PressableScale
              key={f}
              onPress={() => setFilter(f)}
              scaleTo={0.92}
              haptic="select"
              style={[
                styles.filterChip,
                filter === f && { backgroundColor: palette.violet, borderColor: palette.violet },
              ]}
            >
              <Text variant="caption" color={filter === f ? palette.white : palette.textMuted}>
                {f.toUpperCase()}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>

        {flagship ? (
          <PressableScale
            onPress={() => router.push(`/game/${flagship.id}`)}
            scaleTo={0.975}
            haptic="select"
            style={styles.heroWrap}
          >
            <LinearGradient
              colors={['#16337F', '#2E7BD6', '#0B0F22']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Shimmer width={width} duration={3200} />
            <View style={styles.heroRow}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="micro" color="#A9E7FF">
                  FEATURED · NEW
                </Text>
                <Text variant="title" numberOfLines={1}>
                  {flagship.meta.title}
                </Text>
                <Text variant="caption" color="rgba(233,244,255,0.82)" numberOfLines={2}>
                  {flagship.meta.tagline}
                </Text>
                <Text variant="micro" color="#A9E7FF" style={{ marginTop: spacing.xs }}>
                  {flagship.meta.energyCost} ⚡ per run
                  {bests[flagship.id] ? ` · best ${Math.round(bests[flagship.id])}` : ''}
                </Text>
              </View>
              <SpriteView
                sprite={spriteForGame(flagship.id, '#A9E7FF', flagship.meta.title)}
                size={66}
                label={flagship.meta.title}
              />
            </View>
            <View style={styles.heroCta}>
              <Text variant="label" color="#07111F">
                ▶ PLAY
              </Text>
            </View>
          </PressableScale>
        ) : null}

        {sections.map((section) => (
          <View key={section.id} style={{ gap: spacing.md }}>
            <SectionHeader title={section.label} subtitle={section.blurb} />
            <View style={styles.grid}>
              {section.games.map((g, i) => {
                const locked = player.level < g.meta.minLevel;
                const affordable = g.meta.energyCost <= player.energy;
                return (
                  <GameCard
                    key={g.id}
                    index={i}
                    width={cardW}
                    gameId={g.id}
                    title={g.meta.title}
                    tagline={g.meta.tagline}
                    accent={g.meta.accent}
                    gradient={gradients[g.meta.gradient]}
                    energy={g.meta.energyCost}
                    kind={g.meta.kind}
                    minLevel={g.meta.minLevel}
                    category={g.meta.category ?? 'arcade'}
                    players={g.meta.players ?? 1}
                    locked={locked}
                    affordable={affordable}
                    best={bests[g.id]}
                    onPress={() => {
                      if (locked) {
                        haptics.warn();
                        return;
                      }
                      router.push(`/game/${g.id}`);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        <Card variant="glass" style={{ marginTop: spacing.lg }} padding={spacing.lg}>
          <Text variant="subheading">One world, ten doors</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            Coins, XP, items, cosmetics and achievements are shared across every game.
            Scrap from a zombie run buys a shotgun upgrade; a hat bought with fishing
            money makes the runner faster.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function GameCard({
  index,
  width,
  gameId,
  title,
  tagline,
  accent,
  gradient,
  energy,
  kind,
  minLevel,
  category,
  players,
  locked,
  affordable,
  best,
  onPress,
}: {
  index: number;
  width: number;
  gameId: string;
  title: string;
  tagline: string;
  accent: string;
  gradient: readonly [string, string, ...string[]];
  energy: number;
  kind: 'session' | 'ambient';
  minLevel: number;
  category: GameCategory;
  players: 1 | 2;
  locked: boolean;
  affordable: boolean;
  best?: number;
  onPress: () => void;
}) {
  const entrance = useEntrance(index);
  // "Air Hockey · 2 Players" — the line the launcher brief asked for.
  const sectionLabel = category === 'versus' ? '2 Player' : category === 'adventure' ? 'Adventure' : 'Arcade';
  const subtitle = `${sectionLabel} · ${players === 2 ? '2 Players' : '1 Player'}`;

  return (
    <Animated.View style={entrance}>
      <PressableScale onPress={onPress} scaleTo={0.955} style={[styles.card, { width }]}>
        <LinearGradient
          colors={locked ? ['#1A1A2A', '#101018'] : [`${accent}55`, 'rgba(10,10,20,0.85)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {!locked && kind === 'ambient' ? <Shimmer width={width} duration={3600} /> : null}

        <View style={styles.cardTop}>
          {locked ? (
            <SpriteView sprite={spriteForLock(`${title} locked`)} size={38} />
          ) : (
            <SpriteView sprite={spriteForGame(gameId, accent, title)} size={44} label={title} />
          )}
          {players === 2 ? (
            <View style={[styles.tag, { borderColor: `${accent}88` }]}>
              <Text variant="micro" color={accent}>
                2P
              </Text>
            </View>
          ) : kind === 'ambient' ? (
            <View style={[styles.tag, { borderColor: `${accent}88` }]}>
              <Text variant="micro" color={accent}>
                LIVE
              </Text>
            </View>
          ) : null}
        </View>

        <Text variant="subheading" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="micro" color={accent} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text variant="caption" muted numberOfLines={2} style={styles.tagline}>
          {locked ? `Unlocks at account level ${minLevel}` : tagline}
        </Text>

        <View style={styles.cardFoot}>
          <Text variant="micro" color={energy === 0 ? palette.mint : affordable ? palette.energy : palette.coral}>
            {energy === 0 ? 'FREE TO ENTER' : `${energy} ⚡`}
          </Text>
          {best ? (
            <Text variant="micro" color={palette.gold}>
              ★ {Math.round(best)}
            </Text>
          ) : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  filters: { gap: spacing.sm, paddingRight: spacing.lg },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  heroWrap: {
    minHeight: 168,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(169,231,255,0.35)',
    overflow: 'hidden',
    padding: spacing.lg,
    justifyContent: 'space-between',
    shadowColor: '#2E7BD6',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(233,244,255,0.92)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    minHeight: 172,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.xs, borderWidth: 1 },
  tagline: { marginTop: 2, minHeight: 30 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
});
