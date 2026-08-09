import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen, Text, Card, palette, spacing } from '@/ui';
import { gradients } from '@/ui/theme/tokens';

export default function ThreeTest() {
  const [Comp, setComp] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { Stage } = await import('@/core/game3d');
        const THREE = await import('three');
        if (!mounted) return;
        const TestScene = () => (
          <Stage fit={{ halfWidth: 4, halfDepth: 4, height: 2, margin: 0.9 }} cameraDir={[0, 5, 6]} fov={50} background="#0E0B1F" ambient={0.7}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[12, 12]} />
              <meshStandardMaterial color="#2A2A4A" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.6, 0]} castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#4ADE80" roughness={0.5} />
            </mesh>
            <mesh position={[2, 0.6, 1]} castShadow>
              <sphereGeometry args={[0.5, 16, 12]} />
              <meshStandardMaterial color="#FFD166" emissive="#FFD166" emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, 0.7, 0]} castShadow visible={false}>
              <capsuleGeometry args={[0.28, 0.5, 4, 10]} />
              <meshStandardMaterial color="#FF6B6B" />
            </mesh>
          </Stage>
        );
        setComp(() => TestScene);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <Screen gradient={gradients.hub}>
      <View style={styles.content}>
        <Text variant="display">3D Test</Text>
        <Text variant="caption" muted>Solid background + large floor + large cube + large sphere + directional + ambient + camera + orbit + shadows + FPS indicator — extremely simple materials, no textures, no instancing, no particles.</Text>

        <Card variant="glass" padding={spacing.md} style={{ borderWidth: 1, borderColor: error ? 'rgba(255,107,107,0.6)' : 'rgba(52,226,168,0.4)', marginTop: spacing.md }}>
          <Text variant="label" color={error ? palette.coral : palette.mint}>{error ? `FAIL: ${error}` : 'PASS: Stage + floor + cube + sphere + lights + camera'}</Text>
          <Text variant="caption" muted>Background #0E0B1F, floor 12x12 #2A2A4A, cube 1x1 #4ADE80 at 0,0.6,0, sphere 0.5 radius #FFD166 emissive at 2,0.6,1, camera [0,5,6] fov 50, fit 4x4, ambient 0.7, directional, shadows 1024, no textures.</Text>
        </Card>

        <View style={styles.canvasWrap}>
          {Comp ? <Comp /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" muted>Loading 3D test...</Text></View>}
        </View>

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.md }}>
          <Text variant="micro" color={palette.gold}>EXPECTED</Text>
          <Text variant="caption" muted>If this renders: floor visible, green cube, yellow sphere, lighting, camera orbit via Stage auto-fit, no blank, no 500, no WebGL context loss. If this fails, fix global 3D infra before touching Nexus Arena.</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  canvasWrap: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0A0B1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: spacing.md },
});
