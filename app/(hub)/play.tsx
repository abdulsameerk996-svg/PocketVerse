import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';

import { getGame } from '@/core/registry';
import { Screen, Card, PressableScale, Text, SectionHeader, palette, spacing, radius, useResponsive } from '@/ui';
import { gradients } from '@/ui/theme/tokens';

export default function PlayScreen() {
  const router = useRouter();
  const { width } = useResponsive();
  const flagship = useMemo(() => getGame('nexusarena'), []);

  if (!flagship) {
    return (
      <Screen gradient={gradients.hub} tabBarPadding>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text variant="heading">No flagship found</Text>
          <Text variant="caption" muted>Registry should contain nexusarena</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen gradient={gradients.hub} tabBarPadding>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="display">Play</Text>
        <Text variant="caption" muted>One flagship • One arena • One more run</Text>

        <SectionHeader title="FEATURED" subtitle="The only game — polished 3D arena battle" />
        <PressableScale onPress={() => router.push(`/game/${flagship.id}`)} scaleTo={0.97} style={styles.hero}>
          <ExpoLinearGradient colors={[`${flagship.meta.accent}DD`, `${flagship.meta.accent}44`, '#0B0F22']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="micro" color={palette.cyan}>POCKETVERSE • NEXUS ARENA • FLAGSHIP</Text>
              <Text variant="display">{flagship.meta.title}</Text>
              <Text variant="body" color="rgba(233,244,255,0.86)">{flagship.meta.tagline} — {flagship.meta.session} • {flagship.meta.players} players • {flagship.meta.difficulty}</Text>
              <Text variant="caption" muted>Pick a hero → enter beautiful floating ruins arena with central power core → fight bots → use abilities → win • No blank screen, fallback arena guaranteed</Text>
            </View>
            <Text size={64}>{flagship.meta.glyph}</Text>
          </View>
          <View style={styles.cta}><Text variant="label" color="#07111F">▶ PLAY NEXUS ARENA — {flagship.meta.energyCost} ⚡</Text></View>
        </PressableScale>

        <Card variant="glass" padding={spacing.lg}>
          <Text variant="subheading">How to Play</Text>
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            1. Choose hero (Nova/Bolt/Brick/Spectre) — distinct silhouette/color{'\n'}
            2. Enter arena — floating island, central core, crystals, lava void{'\n'}
            3. Move: left joystick / WASD, Attack: ⚔️, Dash: 💨, Shield: 🛡️, Ult: ☀️{'\n'}
            4. AI bots pursue/retreat/use abilities, difficulty via behavior not HP bloat{'\n'}
            5. Score for KOs, pickups health/energy/score, leader indicator, 100s match{'\n'}
            6. Results → Rewards → Play Again (genuinely resets simulation, RNG, timers, camera, particles)
          </Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="micro" color={palette.mint}>RENDER SAFETY</Text>
          <Text variant="caption" muted>GameCanvas zero-size detection + safe defaults, Stage safe lighting/camera/material/fog + finite guards + cleanup, FallbackScene floor+player+light+camera+restart+return, ErrorBoundary with platform/UA/heap/stack + retry + fallback toggle, all transforms finiteOr/safePosition, no NaN/Infinity to Three.js. If real scene fails, fallback visible arena appears instead of blank.</Text>
        </Card>

        <Card variant="glass" padding={spacing.md}>
          <Text variant="micro" color={palette.gold}>SINGLE FLAGSHIP REBUILD</Text>
          <Text variant="caption" muted>31 games deprecated from visible catalogue. Only nexusarena registered. Reusable infra preserved: host, save, audio, input, 3D renderer, physics, reward, nav, sprites. New flagship: Nexus Arena with PartyCharacter (head/body/arms/legs/eyes+6 anims), PartyCamera dynamic zoom min6 max22, premium 3D lobby, hero select 3D preview, 60 FPS pooled.</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { minHeight: 200, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(124,92,255,0.35)', overflow: 'hidden', padding: spacing.lg, justifyContent: 'space-between' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cta: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: 'rgba(233,244,255,0.92)' },
});
