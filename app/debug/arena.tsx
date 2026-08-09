import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen, Text, Card, palette, spacing } from '@/ui';
import { gradients } from '@/ui/theme/tokens';

/**
 * /debug/arena — minimal Nexus Arena renderer test
 * NOT full game, only: sky, floor, 1 directional, 1 ambient, camera, 1 cube player, 1 cube enemy, 1 platform
 * No physics, particles, shadows, textures, audio, instancing, spawning, multiplayer, AI
 */
export default function DebugArena() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [detail, setDetail] = useState('Starting minimal arena test...');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Test imports that Nexus Arena uses
        const { Stage } = await import('@/core/game3d');
        const THREE = await import('three');
        if (!mounted) return;
        setStatus('ok');
        setDetail(`Stage + three ${THREE.REVISION} loaded, ready to render minimal arena`);
      } catch (e: any) {
        setStatus('fail');
        setDetail(e?.message ?? String(e));
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <Screen gradient={gradients.hub}>
      <View style={styles.content}>
        <Text variant="display">Debug Arena</Text>
        <Text variant="caption" muted>Minimal Nexus Arena renderer: sky + floor + lights + camera + player cube + enemy cube + platform. No physics/particles/audio/AI.</Text>

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.md, borderColor: status === 'ok' ? 'rgba(52,226,168,0.4)' : status === 'fail' ? 'rgba(255,107,107,0.6)' : undefined, borderWidth: 1 }}>
          <Text variant="label" color={status === 'ok' ? palette.mint : status === 'fail' ? palette.coral : palette.textMuted}>Minimal Arena Import: {status.toUpperCase()}</Text>
          <Text variant="caption" muted>{detail}</Text>
        </Card>

        {status === 'ok' ? (
          <View style={styles.arenaWrap}>
            <MinimalArena />
          </View>
        ) : null}

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.lg }}>
          <Text variant="micro" color={palette.gold}>PROGRESSIVE TEST PLAN</Text>
          <Text variant="caption" muted>
            TEST A: Basic arena (this page) — floor+light+camera+player+enemy+platform{'\n'}
            TEST B: Player model — replace cube with PartyCharacter{'\n'}
            TEST C: Enemy model — second PartyCharacter{'\n'}
            TEST D: Camera controller — PartyCamera dynamic zoom{'\n'}
            TEST E: Player movement — joystick + WASD{'\n'}
            TEST F: Combat — attack/dash + hit detection{'\n'}
            TEST G: AI — bot chase/attack{'\n'}
            TEST H: Particles — Sparks pooled{'\n'}
            TEST I: Audio — play() cues{'\n'}
            TEST J: HUD — health/score/timer{'\n'}
            TEST K: Full Nexus Arena — complete
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

function MinimalArena() {
  const [Component, setComponent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { Stage } = await import('@/core/game3d');
        const THREE = await import('three');
        if (!mounted) return;

        const ArenaComp = () => (
          <Stage fit={{ halfWidth: 5, halfDepth: 5, height: 2, margin: 0.9 }} cameraDir={[0, 6, 6]} fov={50} background="#0A0B1A" ambient={0.7}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="#2A2A4A" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.6, 0]} castShadow>
              <capsuleGeometry args={[0.28, 0.5, 4, 10]} />
              <meshStandardMaterial color="#FF6B6B" roughness={0.5} />
            </mesh>
            <mesh position={[2, 0.6, 1]} castShadow>
              <capsuleGeometry args={[0.28, 0.5, 4, 10]} />
              <meshStandardMaterial color="#4EA8FF" roughness={0.5} />
            </mesh>
            <mesh position={[1, 0.25, -1.5]} receiveShadow>
              <cylinderGeometry args={[1.2, 1.1, 0.4, 16]} />
              <meshStandardMaterial color="#3A2A6B" />
            </mesh>
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 6, 2]} intensity={1.2} castShadow />
          </Stage>
        );

        setComponent(() => ArenaComp);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (error) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Text variant="label" color={palette.coral}>Minimal arena failed: {error}</Text>
      </View>
    );
  }

  if (!Component) {
    return (
      <View style={{ height: 240, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A2E', borderRadius: 12 }}>
        <Text variant="caption" muted>Loading minimal arena...</Text>
      </View>
    );
  }

  return (
    <View style={styles.arenaWrapInner}>
      <Component />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  arenaWrap: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0A0B1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: spacing.md },
  arenaWrapInner: { flex: 1 },
});
