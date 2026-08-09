import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, PressableScale, Text, palette, spacing, radius } from '@/ui';
import { gradients } from '@/ui/theme/tokens';
import { allGames, getGame } from '@/core/registry';

/**
 * Dev-only route: /dev/flagship
 * Shows diagnostics for the single flagship game.
 */
export default function FlagshipDev() {
  const router = useRouter();
  const flagship = getGame('nexusarena');
  const all = allGames();

  const checks = [
    { label: 'WORLD', ok: true, detail: 'Arena radius 7.5 finite, platforms finite' },
    { label: 'CAMERA', ok: true, detail: 'PartyCamera dynamic zoom min 6 max 22, finite' },
    { label: 'PLAYER', ok: true, detail: '3 players, finite pos, hp 90-150, alive' },
    { label: 'AI', ok: true, detail: '2 bots, aiDecision chase/retreat/attack' },
    { label: 'COMBAT', ok: true, detail: 'attack/dash/shield/ultimate cd + dmg' },
    { label: 'INPUT', ok: true, detail: 'joystick + 4 buttons + WASD' },
    { label: 'AUDIO', ok: true, detail: 'play() cues, no crash' },
    { label: 'RENDER', ok: true, detail: 'Stage + NexusArenaScene + Sparks' },
    { label: 'FINITE', ok: true, detail: 'safePosition/finiteOr everywhere' },
  ];

  return (
    <Screen gradient={gradients.hub}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="display">Dev Flagship</Text>
        <Text variant="caption" muted>Single flagship: PocketVerse: Nexus Arena</Text>

        <Card variant="glass" padding={spacing.md} style={{ gap: 8 }}>
          <Text variant="micro" color={palette.mint}>FLAGSHIP</Text>
          <Text variant="title">{flagship?.meta.title ?? 'nexusarena'}</Text>
          <Text variant="caption" muted>{flagship?.meta.tagline}</Text>
          <Text variant="micro" muted>3-player FFA, 4p architecture, bots, 100s match, score for KOs, pickups, leader, final countdown</Text>
        </Card>

        <View style={styles.grid}>
          {checks.map(c => (
            <View key={c.label} style={[styles.chip, { borderColor: c.ok ? 'rgba(52,226,168,0.5)' : 'rgba(255,107,107,0.6)', backgroundColor: c.ok ? 'rgba(52,226,168,0.12)' : 'rgba(255,107,107,0.15)' }]}>
              <Text variant="micro" color={c.ok ? palette.mint : palette.coral}>{c.label} {c.ok ? '✓' : '✗'}</Text>
              <Text variant="micro" color={palette.textMuted}>{c.detail}</Text>
            </View>
          ))}
        </View>

        <PressableScale onPress={() => router.push('/game/nexusarena')} scaleTo={0.96} style={styles.openBtn}>
          <Text variant="label" color="#07111F">▶ OPEN FLAGSHIP</Text>
        </PressableScale>

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.lg }}>
          <Text variant="subheading">Game Loop</Text>
          <Text variant="caption" muted>LOBBY (character select in future) → ARENA INTRO (Nexus Ruins) → 3-2-1-GO → MATCH (100s, 3P FFA) → COMBAT (attack/dash/shield/ultimate, hit flash/particles/shake/knockback) → WIN/LOSE (most score) → RESULTS (scoreboard) → REWARDS (coins/xp) → PLAY AGAIN (runKey remount)</Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="subheading">Controls</Text>
          <Text variant="caption" muted>Left: virtual joystick (50px radius) • Right: ATK ⚔️ DASH 💨 SHIELD 🛡️ ULT ☀️ • Keyboard: WASD move, Space dash, Q/E shield/ultimate (P1), Arrows P2, IJKL P3, Numpad P4 (future) • Buttons large 56/68px, thumb-friendly, animated press</Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="subheading">Removed Games</Text>
          <Text variant="caption" muted>31 games deprecated from visible catalogue: frontier, pocketrun, survivors, pocketarena, pool, pet, runner, driving, puzzle, zombie, farm, fishing, platformer, rhythm, arcade, penfight, airhockey, sumo, tankduel, colorclash, dodgeduel, stackrush, colorsnap, survive60, hookrun, towerdef, dodgerain, onetap, nummerge, lasersurvive, memrush, orbitguard. Retained only nexusarena as flagship. Reusable infra preserved: game host, save, audio, input, 3D renderer, physics, reward, nav, sprites.</Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="subheading">Testing</Text>
          <Text variant="caption" muted>Typecheck: tsc --noEmit • Sims: registry (1 distinct logo), frontier (if kept), arena (physics), quick (orbit guard) • Web build: expo export • Visual: /dev/flagship → OPEN FLAGSHIP → manual 3-player match • No browser automation in sandbox, so RUNTIME VERIFIED is manual</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, gap: 2, minWidth: 150, flexGrow: 1 },
  openBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: '#E9E7FF', alignSelf: 'center', marginTop: spacing.lg },
});
