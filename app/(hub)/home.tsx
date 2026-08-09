import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { Screen, PressableScale, Text, Card, palette, spacing, radius, useResponsive } from '@/ui';
import { gradients } from '@/ui/theme/tokens';
import { getGame } from '@/core/registry';

/**
 * POCKETVERSE PARTY — Single Flagship Hub
 * Polished 3D lobby with floating island, characters, slowly moving camera.
 * Visual direction: stylized 3D, rounded geometry, bright materials, soft shadows.
 * 
 * NOTE: PartyHubScene uses R3F which requires window/WebGL — it cannot render during
 * static export (SSR). We mount it only on client to avoid 500 on Cloudflare Pages.
 */

function ClientOnlyPartyHub({ playerCount }: { playerCount: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <View style={[styles.lobby3D, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0E0B1F' }]}>
        <Text variant="micro" color={palette.cyan}>POCKETVERSE • NEXUS ARENA</Text>
        <Text variant="title" color="#fff" style={{ marginTop: 8 }}>Loading Arena...</Text>
      </View>
    );
  }
  // dynamic import to avoid SSR bundling issues
  const PartyHubScene = require('@/games/party/PartyHubScene').PartyHubScene;
  return <PartyHubScene playerCount={playerCount} />;
}

export default function PartyHome() {
  const router = useRouter();
  const { width } = useResponsive();
  const [playerCount, setPlayerCount] = useState<2|3|4>(4);
  const flagship = getGame('nexusarena');

  return (
    <Screen gradient={gradients.hub} tabBarPadding>
      <View style={styles.lobby3D}>
        <ClientOnlyPartyHub playerCount={playerCount} />
        <View style={styles.titleOverlay} pointerEvents="none">
          <LinearGradient colors={['rgba(14,11,31,0.9)', 'transparent']} style={StyleSheet.absoluteFill} />
          <View style={styles.titleContent}>
            <Text variant="micro" color={palette.cyan} center>POCKETVERSE</Text>
            <Text variant="display" center style={styles.logo}>PARTY</Text>
            <Text variant="caption" color="rgba(255,255,255,0.8)" center>4 players. One phone. Chaos.</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card variant="gradient" gradient={['#1F1840', '#0E0B1F']} padding={spacing.lg} style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text variant="micro" color={palette.gold}>PREMIUM 3D PARTY • 1-4 PLAYERS</Text>
              <Text variant="title" style={{ marginTop: 4 }}>PocketVerse: Nexus Arena</Text>
              <Text variant="caption" muted>Floating ruins • 3-player FFA • 100s matches • bots • abilities • VFX</Text>
              {flagship ? <Text variant="micro" color={palette.cyan} style={{ marginTop: 4 }}>Featured: {flagship.meta.title} — {flagship.meta.tagline}</Text> : null}
            </View>
            <View style={styles.playerCountRow}>
              {[2,3,4].map(n => (
                <PressableScale key={n} onPress={() => setPlayerCount(n as any)} scaleTo={0.9} style={[styles.countBtn, playerCount===n && { backgroundColor: palette.violet }]}>
                  <Text variant="label" color={playerCount===n ? '#fff' : palette.textMuted}>{n}P</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        </Card>

        <View style={styles.actionGrid}>
          <PressableScale onPress={() => router.push('/game/nexusarena')} scaleTo={0.96} style={[styles.actionBtn, { backgroundColor: palette.violet }]}>
            <Text size={28}>🎮</Text>
            <Text variant="label" color="#fff">PLAY NOW</Text>
            <Text variant="micro" color="rgba(255,255,255,0.8)">Nexus Arena</Text>
          </PressableScale>
          <PressableScale onPress={() => router.push('/game/nexusarena')} scaleTo={0.96} style={[styles.actionBtn, { backgroundColor: '#1E1B3A' }]}>
            <Text size={28}>👥</Text>
            <Text variant="label">LOCAL PARTY</Text>
            <Text variant="micro" muted>{playerCount} players</Text>
          </PressableScale>
        </View>

        <View style={styles.actionGrid}>
          <PressableScale onPress={() => router.push('/game/nexusarena')} scaleTo={0.96} style={[styles.actionBtnSmall, { backgroundColor: '#1E1B3A' }]}>
            <Text size={22}>🏆</Text>
            <Text variant="label">TOURNAMENT</Text>
            <Text variant="micro" muted>3-5 games</Text>
          </PressableScale>
          <PressableScale onPress={() => router.push('/modal/avatar')} scaleTo={0.96} style={[styles.actionBtnSmall, { backgroundColor: '#1E1B3A' }]}>
            <Text size={22}>🎭</Text>
            <Text variant="label">CHARACTERS</Text>
            <Text variant="micro" muted>4 heroes</Text>
          </PressableScale>
          <PressableScale onPress={() => router.push('/modal/settings')} scaleTo={0.96} style={[styles.actionBtnSmall, { backgroundColor: '#1E1B3A' }]}>
            <Text size={22}>⚙️</Text>
            <Text variant="label">SETTINGS</Text>
          </PressableScale>
        </View>

        <Card variant="glass" padding={spacing.lg} style={{ marginTop: spacing.lg }}>
          <Text variant="subheading">How to Play — Nexus Arena</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            • P1 WASD / left joystick, P2 Arrows, P3 IJKL, P4 Numpad (future 4P on one device){'\n'}
            • Left joystick move, Right: ATK ⚔️ DASH 💨 SHIELD 🛡️ ULT ☀️{'\n'}
            • 3-player free-for-all, 100s, score for KOs, pickups health/energy/score{'\n'}
            • Abilities: attack (0.45s cd), dash (2.2s invul blink), shield (6.5s block), ultimate (18s Solar Flare 4.2 radius burn+knockback){'\n'}
            • Bots: chase/retreat/attack/use abilities, avoid hazards, seek pickups, behavior based on hp{'\n'}
            • Camera: PartyCamera dynamic zoom min 6 max 22, keeps all alive visible, smooth lerp
          </Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="micro" color={palette.mint}>VISUAL IDENTITY — NEXUS ARENA</Text>
          <Text variant="caption" muted>Original sci-fi fantasy: floating platforms, glowing energy channels, ancient stone, neon accents, central power core (octahedron emissive), bridges/ramps, crystals (octahedron emissive), boundaries glowing rim + stone pillars + sphere lights, lava void below, atmospheric particles, soft shadows, ambient + directional, 60 FPS target, pooled Sparks 100.</Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="micro" color={palette.gold}>SINGLE FLAGSHIP REBUILD</Text>
          <Text variant="caption" muted>Removed 31 games from visible catalogue (frontier, pocketrun, survivors, pocketarena, pool, pet, runner, driving, puzzle, zombie, farm, fishing, platformer, rhythm, arcade, penfight, airhockey, sumo, tankduel, colorclash, dodgeduel, stackrush, colorsnap, survive60, hookrun, towerdef, dodgerain, onetap, nummerge, lasersurvive, memrush, orbitguard). Their folders remain for reference but not registered. Reusable infra preserved: game host, save, audio, input, 3D renderer, physics, reward, nav, sprites. New flagship: Nexus Arena. All others deprecated until polished.</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lobby3D: { height: 360, overflow: 'hidden', backgroundColor: '#0E0B1F' },
  titleOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: spacing.lg },
  titleContent: { gap: 2 },
  logo: { fontSize: 52, fontWeight: '900', letterSpacing: 2, color: '#FFFFFF', textShadowColor: '#7C5CFF', textShadowRadius: 14 },
  content: { padding: spacing.lg, gap: spacing.md, paddingTop: spacing.md },
  hero: { borderWidth: 1, borderColor: 'rgba(124,92,255,0.25)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  playerCountRow: { flexDirection: 'row', gap: 6 },
  countBtn: { width: 36, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  actionGrid: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  actionBtnSmall: { flex: 1, padding: spacing.md, borderRadius: radius.lg, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});
