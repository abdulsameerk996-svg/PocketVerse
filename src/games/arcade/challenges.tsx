import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { PressableScale, Text, haptics, palette, radius, spacing } from '@/ui';
import type { ChallengeProps } from './types';

/**
 * Arcade challenges.
 *
 * Each is a self-contained component with one contract: `onEnd(score)`. The
 * arcade shell owns timing, rotation, high scores and rewards, so adding a new
 * challenge is writing one component and adding one row to `CHALLENGES`.
 */

/* --------------------------------------------------------- Reflex Grid */

export function ReflexGrid({ onEnd }: ChallengeProps) {
  const DURATION = 22;
  const [targets, setTargets] = useState<{ id: number; cell: number; bad: boolean }[]>([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const idRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (left > 0) return;
    onEnd(score, [{ label: 'Hits', value: `${Math.round(score / 10)}` }]);
  }, [left, onEnd, score]);

  useEffect(() => {
    const spawn = setInterval(
      () => {
        setTargets((prev) => {
          const cell = Math.floor(Math.random() * 9);
          if (prev.some((t) => t.cell === cell)) return prev;
          const id = ++idRef.current;
          const bad = Math.random() < 0.28;
          setTimeout(
            () => setTargets((p) => p.filter((t) => t.id !== id)),
            700 + Math.random() * 500,
          );
          return [...prev, { id, cell, bad }];
        });
      },
      Math.max(260, 620 - (DURATION - left) * 14),
    );
    return () => clearInterval(spawn);
  }, [left]);

  const tap = useCallback((t: { id: number; bad: boolean }) => {
    setTargets((prev) => prev.filter((x) => x.id !== t.id));
    if (t.bad) {
      setScore((s) => Math.max(0, s - 25));
      haptics.fail();
    } else {
      setScore((s) => s + 10);
      haptics.collect();
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <ChallengeHeader title="Reflex Grid" hint="Tap the green ones. Avoid the red." score={score} left={left} />
      <View style={styles.grid3}>
        {Array.from({ length: 9 }, (_, cell) => {
          const t = targets.find((x) => x.cell === cell);
          return (
            <PressableScale
              key={cell}
              onPress={() => t && tap(t)}
              scaleTo={0.9}
              haptic={false}
              style={[
                styles.cell3,
                t
                  ? {
                      backgroundColor: t.bad ? 'rgba(255,107,107,0.28)' : 'rgba(52,226,168,0.28)',
                      borderColor: t.bad ? palette.coral : palette.mint,
                    }
                  : null,
              ]}
            >
              {t ? (
                <Animated.View entering={FadeIn.duration(90)} exiting={FadeOut.duration(120)}>
                  <Text size={30}>{t.bad ? 'ðŸ’£' : 'ðŸŸ¢'}</Text>
                </Animated.View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Tap Rush */

export function TapRush({ onEnd }: ChallengeProps) {
  const DURATION = 12;
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const pulse = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (left > 0) return;
    onEnd(taps * 12, [
      { label: 'Taps', value: `${taps}` },
      { label: 'Per second', value: (taps / DURATION).toFixed(1) },
    ]);
  }, [left, onEnd, taps]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  return (
    <View style={styles.wrap}>
      <ChallengeHeader title="Tap Rush" hint="As many taps as you can. Go." score={taps} left={left} />
      <PressableScale
        onPress={() => {
          setTaps((t) => t + 1);
          pulse.value = 1;
          pulse.value = 0;
          haptics.tick();
        }}
        haptic={false}
        sound={false}
        scaleTo={0.97}
        style={styles.tapPad}
      >
        <Animated.View style={style}>
          <Text variant="display" size={64} numeric>
            {taps}
          </Text>
        </Animated.View>
      </PressableScale>
    </View>
  );
}

/* --------------------------------------------------------- Colour Match */

const WORDS = ['RED', 'GREEN', 'BLUE', 'GOLD'] as const;
const WORD_COLORS = [palette.coral, palette.mint, palette.sky, palette.gold];

export function ColourMatch({ onEnd }: ChallengeProps) {
  const DURATION = 24;
  const [round, setRound] = useState({ word: 0, ink: 1 });
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [left, setLeft] = useState(DURATION);

  const next = useCallback(() => {
    const word = Math.floor(Math.random() * WORDS.length);
    let ink = Math.floor(Math.random() * WORDS.length);
    if (Math.random() < 0.35) ink = word;
    setRound({ word, ink });
  }, []);

  useEffect(() => {
    next();
  }, [next]);

  useEffect(() => {
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (left > 0) return;
    onEnd(score, [{ label: 'Best streak', value: `${streak}` }]);
  }, [left, onEnd, score, streak]);

  const answer = useCallback(
    (i: number) => {
      if (i === round.ink) {
        setScore((s) => s + 20 + streak * 2);
        setStreak((s) => s + 1);
        haptics.collect();
      } else {
        setScore((s) => Math.max(0, s - 15));
        setStreak(0);
        haptics.fail();
      }
      next();
    },
    [next, round.ink, streak],
  );

  return (
    <View style={styles.wrap}>
      <ChallengeHeader
        title="Colour Match"
        hint="Tap the COLOUR of the word, not the word."
        score={score}
        left={left}
      />
      <View style={styles.stroopWord}>
        <Text variant="display" size={54} color={WORD_COLORS[round.ink]}>
          {WORDS[round.word]}
        </Text>
        {streak > 2 ? (
          <Text variant="label" color={palette.gold}>
            {streak}x streak
          </Text>
        ) : null}
      </View>
      <View style={styles.stroopRow}>
        {WORDS.map((w, i) => (
          <PressableScale
            key={w}
            onPress={() => answer(i)}
            haptic={false}
            scaleTo={0.92}
            style={[styles.stroopBtn, { borderColor: WORD_COLORS[i], backgroundColor: `${WORD_COLORS[i]}22` }]}
          >
            <View style={[styles.swatch, { backgroundColor: WORD_COLORS[i] }]} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------- Meteor Dodge */

/**
 * Meteor Dodge is now a 3D game (`MeteorDodge3D.tsx`).
 *
 * It is loaded lazily for the same reason Pen Fight is: `src/games/index.ts`
 * imports every module eagerly so the registry and catalog are complete at
 * boot, and pulling three.js into that path would tax the hub for a challenge
 * that is only in the rotation two days out of three.
 */
export function MeteorDodge(props: ChallengeProps) {
  return (
    <React.Suspense fallback={<ChallengeLoading />}>
      <MeteorDodgeLazy {...props} />
    </React.Suspense>
  );
}

const MeteorDodgeLazy = React.lazy(() => import('./MeteorDodge3D'));

function ChallengeLoading() {
  return (
    <View style={[styles.wrap, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text size={40}>☄️</Text>
      <Text variant="caption" muted style={{ marginTop: spacing.sm }}>
        Loading arena
      </Text>
    </View>
  );
}


/* -------------------------------------------------------------- shared */

function ChallengeHeader({
  title,
  hint,
  score,
  left,
}: {
  title: string;
  hint: string;
  score: number;
  left: number | null;
}) {
  return (
    <View style={styles.header}>
      <Text variant="micro" color={palette.violet}>
        CHALLENGE
      </Text>
      <Text variant="title">{title}</Text>
      <Text variant="caption" muted center>
        {hint}
      </Text>
      <View style={styles.headerRow}>
        <Text variant="numeric" color={palette.gold}>
          {score}
        </Text>
        {left != null ? (
          <Text variant="numeric" color={left <= 5 ? palette.coral : palette.textMuted}>
            {Math.max(0, left)}s
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { alignItems: 'center', gap: 2 },
  headerRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  cell3: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapPad: {
    flex: 1,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(124,92,255,0.16)',
    borderWidth: 2,
    borderColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  stroopWord: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  stroopRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  stroopBtn: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  dodgeArea: {
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  rock: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dodgePlayer: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
