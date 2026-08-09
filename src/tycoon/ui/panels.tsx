import React, { memo } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Button, Card, ProgressBar, Text, palette, radius, spacing } from '@/ui';
import { GENERATORS, MILESTONES, UPGRADES } from '../data';
import {
  canClaimMilestone,
  costOf,
  derive,
  generatorUnlocked,
  milestoneProgress,
  prestigeGain,
  prestigeMultiplier,
  upgradeUnlocked,
} from '../engine';
import type { GameState, GeneratorId } from '../types';
import { formatDuration, formatMoney, formatNumber } from '../format';
import { GeneratorIcon } from '../art/GeneratorIcon';

/* ------------------------------------------------------------- SHOP ---- */

export const ShopPanel = memo(function ShopPanel({
  state,
  onBuy,
}: {
  state: GameState;
  onBuy: (id: GeneratorId) => void;
}) {
  const d = derive(state);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelPad}>
      {GENERATORS.map((def) => {
        const owned = state.generators[def.id];
        const unlocked = generatorUnlocked(state, def.id);
        const cost = costOf(def, owned);
        const affordable = state.cash >= cost;
        const each = def.baseCps * d.cpsMult * d.prestigeMult;
        return (
          <Card key={def.id} variant="glass" padding={spacing.md} style={styles.row}>
            <View style={styles.rowIcon}>
              <GeneratorIcon
                id={def.id}
                size={38}
                color={unlocked ? (def.id === 'robo' ? palette.mint : palette.violet) : palette.textFaint}
              />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTitleLine}>
                <Text variant="subheading" numberOfLines={1} style={unlocked ? undefined : styles.lockedText}>
                  {def.name}
                </Text>
                {owned > 0 ? (
                  <Text variant="caption" numeric muted>
                    ×{owned}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" muted numberOfLines={1}>
                {unlocked ? `${def.tagline} · +${formatMoney(each)}/s each` : `Needs a ${def.unlockRequires ? capitalize(GENERATORS.find((g) => g.id === def.unlockRequires)?.name ?? def.unlockRequires) : ''}`}
              </Text>
            </View>
            <View style={styles.rowBuy}>
              {unlocked ? (
                <Button
                  label={formatMoney(cost)}
                  size="sm"
                  variant={affordable ? 'primary' : 'secondary'}
                  disabled={!affordable}
                  onPress={() => onBuy(def.id)}
                  haptic="press"
                />
              ) : (
                <Text variant="micro" faint>
                  LOCKED
                </Text>
              )}
            </View>
          </Card>
        );
      })}
      <Text variant="caption" faint center style={styles.footNote}>
        Every unit adds to your income per second — even while you're away.
      </Text>
    </ScrollView>
  );
});

/* -------------------------------------------------------- UPGRADES ---- */

export const UpgradesPanel = memo(function UpgradesPanel({
  state,
  onBuy,
}: {
  state: GameState;
  onBuy: (id: string) => void;
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelPad}>
      {UPGRADES.map((u) => {
        const owned = state.upgrades.includes(u.id);
        const unlocked = upgradeUnlocked(state, u.id);
        const affordable = state.cash >= u.cost;
        const multLabel = u.tapMult ? `tap ×${u.tapMult}` : u.cpsMult ? `income ×${u.cpsMult}` : '';
        const reqGen = u.requires ? GENERATORS.find((g) => g.id === u.requires!.gen) : undefined;
        return (
          <Card key={u.id} variant="glass" padding={spacing.md} style={[styles.row, owned && styles.rowOwned]}>
            <View style={[styles.rowIcon, styles.upgradeIcon]}>
              <Text size={18}>{owned ? '✓' : '★'}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTitleLine}>
                <Text variant="subheading" numberOfLines={1} style={owned ? styles.ownedText : undefined}>
                  {u.name}
                </Text>
                {multLabel ? (
                  <Text variant="caption" color={palette.gold} numeric>
                    {multLabel}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" muted numberOfLines={1}>
                {owned
                  ? 'Owned — permanent boost'
                  : u.requires
                    ? `Needs ${u.requires.count}× ${reqGen?.name}`
                    : u.tagline}
              </Text>
            </View>
            <View style={styles.rowBuy}>
              {owned ? (
                <Text variant="micro" color={palette.mint}>
                  OWNED
                </Text>
              ) : unlocked ? (
                <Button
                  label={formatMoney(u.cost)}
                  size="sm"
                  variant={affordable ? 'primary' : 'secondary'}
                  disabled={!affordable}
                  onPress={() => onBuy(u.id)}
                  haptic="press"
                />
              ) : (
                <Text variant="micro" faint>
                  LOCKED
                </Text>
              )}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
});

/* ----------------------------------------------------------- STATS ---- */

export const StatsPanel = memo(function StatsPanel({
  state,
  onPrestige,
  onClaimMilestone,
}: {
  state: GameState;
  onPrestige: () => void;
  onClaimMilestone: (id: string) => void;
}) {
  const d = derive(state);
  const gain = prestigeGain(state);
  const bonusPct = Math.round((prestigeMultiplier(state.prestigeTokens) - 1) * 100);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelPad}>
      {/* prestige */}
      <Card variant="gradient" gradient={['#4A2E1A', '#2A180D']} padding={spacing.lg} style={styles.prestigeCard}>
        <Text variant="micro" color={palette.gold}>
          PRESTIGE · OPEN A SECOND CAFÉ
        </Text>
        <Text variant="heading" style={{ marginTop: 4 }}>
          {gain > 0 ? `+${gain} Cream Token${gain > 1 ? 's' : ''} ready` : 'Building an empire…'}
        </Text>
        <Text variant="caption" muted style={{ marginTop: 4 }}>
          {gain > 0
            ? `Reset the shop for ${gain} Cream Token${gain > 1 ? 's' : ''} (+${gain * 10}% permanent income each).`
            : `Earn ${formatMoney(1_000_000)} in one run to open your second café.`}
        </Text>
        <View style={styles.prestigeStats}>
          <Text variant="caption" muted>
            Current bonus
          </Text>
          <Text variant="label" color={palette.gold} numeric>
            +{bonusPct}%
          </Text>
        </View>
        <Button
          label={gain > 0 ? 'Open Second Café' : 'Not yet'}
          disabled={gain <= 0}
          size="sm"
          full
          gradient={['#FFD98A', '#E8934A']}
          style={{ marginTop: spacing.md }}
          onPress={onPrestige}
        />
      </Card>

      {/* stats grid */}
      <View style={styles.statsGrid}>
        <Stat label="All-time earned" value={formatMoney(state.allTimeEarned)} accent={palette.coin} />
        <Stat label="This run" value={formatMoney(state.lifetimeEarned)} />
        <Stat label="Income / sec" value={`${formatMoney(d.cps)}/s`} accent={palette.mint} />
        <Stat label="Tap power" value={formatMoney(d.tapPower)} accent={palette.gold} />
        <Stat label="Taps" value={formatNumber(state.taps)} />
        <Stat label="Generators" value={formatNumber(d.totalGenerators)} />
        <Stat label="Prestiges" value={formatNumber(state.prestiges)} />
        <Stat label="Time played" value={formatDuration(state.playSeconds)} />
      </View>

      {/* milestones */}
      <Text variant="heading" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Milestones
      </Text>
      {MILESTONES.map((m) => {
        const progress = milestoneProgress(state, m.id);
        const claimed = state.milestonesClaimed.includes(m.id);
        const claimable = canClaimMilestone(state, m.id);
        return (
          <Card key={m.id} variant="glass" padding={spacing.md} style={styles.milestone}>
            <View style={styles.rowTitleLine}>
              <Text variant="label" numberOfLines={1} style={claimed ? styles.ownedText : undefined}>
                {claimed ? '✓ ' : ''}
                {m.name}
              </Text>
              <Text variant="caption" color={claimable ? palette.gold : palette.textMuted} numeric>
                {claimable ? formatMoney(m.reward) : `${formatNumber(Math.min(progress, m.target))}/${formatNumber(m.target)}`}
              </Text>
            </View>
            <Text variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
              {m.tagline}
            </Text>
            <View style={styles.milestoneFoot}>
              <ProgressBar
                value={Math.min(1, progress / m.target)}
                height={6}
                gradient={claimable ? ['#FFD98A', '#E8934A'] : [palette.violet, palette.violetDim]}
                glow={false}
                style={{ flex: 1, marginRight: spacing.md }}
              />
              {claimable ? (
                <Button label="Claim" size="sm" variant="success" onPress={() => onClaimMilestone(m.id)} style={{ minWidth: 76 }} />
              ) : claimed ? (
                <Text variant="micro" color={palette.mint}>
                  DONE
                </Text>
              ) : null}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
});

/* ---------------------------------------------------------- helpers ---- */

const Stat = memo(function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text variant="caption" muted numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" numeric color={accent ?? palette.text} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
});

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  panelPad: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowOwned: { opacity: 0.75 },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,236,214,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  upgradeIcon: { backgroundColor: 'rgba(255,217,138,0.08)' },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowBuy: { alignItems: 'flex-end' },
  lockedText: { color: palette.textFaint },
  ownedText: { color: palette.mint },
  footNote: { marginTop: spacing.md, textAlign: 'center' },
  prestigeCard: { borderWidth: 1, borderColor: 'rgba(255,217,138,0.25)' },
  prestigeStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  statCell: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,236,214,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: 2,
  },
  milestone: { gap: 2 },
  milestoneFoot: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
});
