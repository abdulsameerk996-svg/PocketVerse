import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale, Text, palette, radius, spacing } from '@/ui';
import { DonutIcon } from '@/tycoon/art/DonutIcon';
import { RingIcon } from '@/rings/RingIcon';
import { useTycoon } from '@/tycoon/store';
import { useRings } from '@/rings/store';
import { derive } from '@/tycoon/engine';
import { formatMoney } from '@/tycoon/format';

export default function Hub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void useTycoon.getState().hydrate();
    void useRings.getState().hydrate();
    const t = setTimeout(() => setHydrated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const tycoonState = useTycoon((s) => s.state);
  const ringsState = useRings((s) => s.state);
  const tycoonCps = derive(tycoonState).cps;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1E140D', '#0F0906']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
        <Text variant="micro" color={palette.gold} style={{ letterSpacing: 2 }}>
          POCKETVERSE ARCADE
        </Text>
        <Text variant="display" style={{ marginTop: 2 }}>
          Choose your game
        </Text>
      </View>

      <View style={styles.cards}>
        {/* Donut Tycoon */}
        <PressableScale onPress={() => router.push('/tycoon')} scaleTo={0.97} style={styles.cardWrap}>
          <LinearGradient colors={['#3E2A1A', '#1E140D']} style={StyleSheet.absoluteFill} />
          <View style={styles.cardTop}>
            <DonutIcon size={64} />
          </View>
          <Text variant="heading" style={{ marginTop: spacing.md }}>
            Donut Tycoon
          </Text>
          <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 4 }}>
            Tap donuts, hire a café crew, grow an empire — it earns while you're away.
          </Text>
          <View style={styles.cardMeta}>
            <MetaChip label={hydrated ? formatMoney(tycoonState.cash) : '—'} icon="💰" />
            <MetaChip label={hydrated ? `${formatMoney(tycoonCps)}/s` : '—'} icon="⚡" />
            <MetaChip label={hydrated ? `${tycoonState.prestiges} prestige` : '—'} icon="🏆" />
          </View>
        </PressableScale>

        {/* Neon Rings */}
        <PressableScale onPress={() => router.push('/rings')} scaleTo={0.97} style={styles.cardWrap}>
          <LinearGradient colors={['#3B1D5E', '#140A2B']} style={StyleSheet.absoluteFill} />
          <View style={styles.cardTop}>
            <RingIcon size={64} />
          </View>
          <Text variant="heading" style={{ marginTop: spacing.md }}>
            Neon Rings
          </Text>
          <Text variant="caption" muted numberOfLines={2} style={{ marginTop: 4 }}>
            Bounce. Tap. Thread the ball through sliding neon rings — timing is everything.
          </Text>
          <View style={styles.cardMeta}>
            <MetaChip label={hydrated ? `${Math.max(ringsState.best, ringsState.score)}` : '—'} icon="🏆" />
            <MetaChip label={hydrated ? `level ${ringsState.bestLevel}` : '—'} icon="🌀" />
          </View>
        </PressableScale>
      </View>

      <Text variant="caption" faint center style={{ paddingBottom: insets.bottom + spacing.lg }}>
        offline-first · one save per game · no account
      </Text>
    </View>
  );
}

function MetaChip({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.chip}>
      <Text size={12}>{icon}</Text>
      <Text variant="caption" muted numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  cards: { flex: 1, gap: spacing.lg, paddingHorizontal: spacing.xl },
  cardWrap: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  cardTop: { alignItems: 'center', marginTop: spacing.sm },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});
