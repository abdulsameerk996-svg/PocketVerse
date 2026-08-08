import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { GameSurfaceProps } from '@/core/registry';
import { createRng, hashString, shuffle } from '@/core/utils/rng';
import { dayKey } from '@/core/utils/time';
import {
  Card,
  PressableScale,
  SectionHeader,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
} from '@/ui';
import { ColourMatch, MeteorDodge, ReflexGrid, TapRush } from './challenges';
import type { ArcadeSave, ChallengeId, ChallengeProps } from './types';

const CHALLENGES: {
  id: ChallengeId;
  name: string;
  glyph: string;
  blurb: string;
  colors: [string, string];
  Component: React.ComponentType<ChallengeProps>;
}[] = [
  {
    id: 'reflex',
    name: 'Reflex Grid',
    glyph: '🟢',
    blurb: 'Nine cells. Two colours. One rule.',
    colors: ['#34E2A8', '#0F766E'],
    Component: ReflexGrid,
  },
  {
    id: 'taprush',
    name: 'Tap Rush',
    glyph: '👆',
    blurb: 'Twelve seconds of pure thumb.',
    colors: ['#7C5CFF', '#3B2A8C'],
    Component: TapRush,
  },
  {
    id: 'stroop',
    name: 'Colour Match',
    glyph: '🎨',
    blurb: 'Your brain will lie to you.',
    colors: ['#FFB443', '#B45309'],
    Component: ColourMatch,
  },
  {
    id: 'dodge',
    name: 'Meteor Dodge',
    glyph: '☄️',
    blurb: 'Survive as long as you can.',
    colors: ['#FF4D8D', '#7F1D4E'],
    Component: MeteorDodge,
  },
];

/**
 * ARCADE CHALLENGES
 *
 * A rotating shell over interchangeable micro-games. The daily rotation is a
 * deterministic shuffle of the roster seeded by the date — every device sees
 * the same three, and the order cannot be rerolled by relaunching.
 */
export function ArcadeSurface({ onFinish, save, setSave, modifiers }: GameSurfaceProps) {
  const arcadeSave = save as ArcadeSave;
  const insets = useSafeAreaInsets();
  const { s: sc } = useResponsive();
  const [active, setActive] = useState<ChallengeId | null>(null);

  const today = dayKey();

  /**
   * The daily rotation *features* challenges. It does not gate them.
   *
   * This used to slice the roster to three and render the remainder as dimmed,
   * unpressable rows — so Meteor Dodge was unplayable on roughly one day in
   * four, with no way for the player to override it. A daily pick is a
   * recommendation; it should never be the reason someone cannot open a game
   * they own. The seeding is unchanged, so "today's three" are still identical
   * on every device and still cannot be rerolled by relaunching.
   */
  const featured = useMemo(() => {
    const rng = createRng(hashString(`arcade-${today}`));
    return shuffle(rng, CHALLENGES).slice(0, 3);
  }, [today]);

  const featuredIds = useMemo(() => new Set(featured.map((c) => c.id)), [featured]);
  const rest = useMemo(() => CHALLENGES.filter((c) => !featuredIds.has(c.id)), [featuredIds]);

  const end = useCallback(
    (id: ChallengeId, score: number, extra?: { label: string; value: string }[]) => {
      const previous = arcadeSave.best[id] ?? 0;
      setSave((prev: ArcadeSave) => ({
        ...prev,
        rounds: prev.rounds + 1,
        best: { ...prev.best, [id]: Math.max(prev.best[id] ?? 0, score) },
        lastRotation: today,
      }));

      const def = CHALLENGES.find((c) => c.id === id)!;
      onFinish({
        score,
        outcome: score > previous ? 'win' : 'lose',
        metrics: { arcade_rounds: 1, arcade_high_score: score },
        reward: {
          coins: Math.round(60 + score * 0.5),
          xp: Math.round(18 + score * 0.12),
          items: score > 600 ? { mat_circuit: 1 } : { mat_scrap: 1 },
          gems: score > 1200 ? 2 : 0,
        },
        breakdown: [
          { label: 'Challenge', value: def.name },
          ...(extra ?? []),
          { label: 'Previous best', value: `${previous}` },
        ],
      });
      setActive(null);
    },
    [arcadeSave.best, onFinish, setSave, today],
  );

  if (active) {
    const def = CHALLENGES.find((c) => c.id === active)!;
    const Component = def.Component;
    return (
      <View style={[styles.playRoot, { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.lg }]}>
        <Component
          key={active}
          onEnd={(score, extra) => end(active, score, extra)}
          luck={modifiers.luck}
          speed={modifiers.speed}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Card variant="gradient" gradient={['#2A1152', '#0D0A1A']}>
        <Text variant="micro" color={palette.violet}>
          TODAY’S FEATURED · {today}
        </Text>
        <Text variant="title">Three challenges, one minute each</Text>
        <Text variant="caption" muted style={{ marginTop: 4 }}>
          The featured picks change at midnight — but every challenge is always
          playable. High scores are kept forever.
        </Text>
      </Card>

      <SectionHeader title="Featured today" subtitle={`${arcadeSave.rounds} rounds played`} />
      {featured.map((c) => (
        <ChallengeRow
          key={c.id}
          challenge={c}
          best={arcadeSave.best[c.id]}
          featured
          onPress={() => {
            haptics.press();
            setActive(c.id);
          }}
        />
      ))}

      {rest.length > 0 ? (
        <>
          <SectionHeader title="All challenges" subtitle="Always available" />
          {rest.map((c) => (
            <ChallengeRow
              key={c.id}
              challenge={c}
              best={arcadeSave.best[c.id]}
              onPress={() => {
                haptics.press();
                setActive(c.id);
              }}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * One challenge row. Featured and unfeatured differ only in a badge — both are
 * pressable, because the rotation is a recommendation, not a lock.
 */
const ChallengeRow = React.memo(function ChallengeRow({
  challenge,
  best,
  featured,
  onPress,
}: {
  challenge: (typeof CHALLENGES)[number];
  best?: number;
  featured?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.row} scaleTo={0.975}>
      <LinearGradient colors={challenge.colors} style={styles.art}>
        <Text size={26}>{challenge.glyph}</Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text variant="subheading">{challenge.name}</Text>
          {featured ? (
            <View style={styles.badge}>
              <Text variant="micro" color={palette.violet}>
                TODAY
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" muted>
          {challenge.blurb}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="micro" muted>
          BEST
        </Text>
        <Text variant="label" numeric color={best ? palette.gold : palette.textMuted}>
          {best ?? '—'}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: `${palette.violet}88`,
  },
  playRoot: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  art: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
