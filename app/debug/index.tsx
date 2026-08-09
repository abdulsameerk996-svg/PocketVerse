import React, { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, View, Platform } from 'react-native';
import { Screen, Text, Card, PressableScale, palette, spacing, radius } from '@/ui';
import { gradients } from '@/ui/theme/tokens';

type TestResult = { label: string; status: 'PASS' | 'FAIL' | 'PENDING'; detail?: string };

export default function DebugPage() {
  const [results, setResults] = useState<TestResult[]>([
    { label: '1. JavaScript', status: 'PENDING' },
    { label: '2. React', status: 'PENDING' },
    { label: '3. Router', status: 'PENDING' },
    { label: '4. Three.js', status: 'PENDING' },
    { label: '5. WebGL', status: 'PENDING' },
    { label: '6. R3F Canvas', status: 'PENDING' },
    { label: '7. Basic Three.js cube', status: 'PENDING' },
    { label: '8. Basic R3F cube', status: 'PENDING' },
    { label: '9. Camera', status: 'PENDING' },
    { label: '10. Lighting', status: 'PENDING' },
    { label: '11. Texture loading', status: 'PENDING' },
    { label: '12. Dynamic import', status: 'PENDING' },
    { label: '13. Nexus Arena module', status: 'PENDING' },
  ]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawThreeRef = useRef<HTMLCanvasElement>(null);

  const update = (idx: number, status: 'PASS' | 'FAIL', detail?: string) => {
    setResults(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], status, detail };
      return next;
    });
  };

  useEffect(() => {
    // 1. JavaScript
    try {
      update(0, 'PASS', `JS works, Platform.OS=${Platform.OS}, userAgent=${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'no-navigator'}`);
    } catch (e: any) {
      update(0, 'FAIL', e?.message ?? String(e));
    }

    // 2. React
    try {
      update(1, 'PASS', `React ${React.version ?? 'unknown'} mounted`);
    } catch (e: any) {
      update(1, 'FAIL', e?.message ?? String(e));
    }

    // 3. Router
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const router = require('expo-router');
      update(2, 'PASS', `expo-router present, useRouter type ${typeof router.useRouter}`);
    } catch (e: any) {
      update(2, 'FAIL', e?.message ?? String(e));
    }

    // 4. Three.js
    (async () => {
      try {
        const THREE = await import('three');
        update(3, 'PASS', `three ${THREE.REVISION ?? 'unknown'} loaded, BoxGeometry exists ${!!THREE.BoxGeometry}`);
      } catch (e: any) {
        update(3, 'FAIL', e?.message ?? String(e));
      }

      // 5. WebGL
      try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
        if (!gl && !gl2) {
          update(4, 'FAIL', 'WebGL not available (no webgl/webgl2 context)');
        } else {
          const info = gl ? `webgl renderer ${gl.getParameter(gl.RENDERER) ?? ''}` : 'webgl2';
          update(4, 'PASS', `${gl ? 'WebGL' : ''} ${gl2 ? '+ WebGL2' : ''} available, ${info}, DPR=${window.devicePixelRatio}`);
        }
      } catch (e: any) {
        update(4, 'FAIL', e?.message ?? String(e));
      }

      // 7. Basic Three.js cube (raw)
      try {
        const THREE = await import('three');
        const canvas = rawThreeRef.current;
        if (!canvas) {
          update(6, 'FAIL', 'raw canvas ref null');
        } else {
          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
          renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
          const scene = new THREE.Scene();
          scene.background = new THREE.Color('#1A1A2E');
          const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
          camera.position.set(0, 2, 4);
          camera.lookAt(0, 0, 0);
          const light = new THREE.DirectionalLight(0xffffff, 1.2);
          light.position.set(2, 5, 3);
          scene.add(light);
          scene.add(new THREE.AmbientLight(0xffffff, 0.6));
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#4ADE80' }));
          mesh.position.y = 0.5;
          scene.add(mesh);
          renderer.render(scene, camera);
          update(6, 'PASS', `raw three cube rendered ${canvas.clientWidth}x${canvas.clientHeight}`);
        }
      } catch (e: any) {
        update(6, 'FAIL', e?.message ?? String(e));
      }

      // 6. R3F Canvas (we test via dynamic import, actual render in separate component below)
      try {
        const fiber = await import('@react-three/fiber');
        update(5, 'PASS', `@react-three/fiber loaded, Canvas exists ${!!fiber.Canvas}`);
      } catch (e: any) {
        update(5, 'FAIL', e?.message ?? String(e));
      }

      // 12. Dynamic import
      try {
        const mod = await import('@/games/nexusarena');
        update(11, 'PASS', `dynamic import @/games/nexusarena works, has nexusArenaModule ${!!(mod as any).nexusArenaModule}`);
      } catch (e: any) {
        update(11, 'FAIL', e?.message ?? String(e));
      }

      // 13. Nexus Arena module
      try {
        const { nexusArenaModule } = await import('@/games/nexusarena');
        const hasSurface = !!(nexusArenaModule as any).Surface;
        update(12, 'PASS', `nexusArenaModule loaded, id=${nexusArenaModule.id}, Surface=${hasSurface}, meta ${nexusArenaModule.meta.title}`);
      } catch (e: any) {
        update(12, 'FAIL', e?.message ?? String(e));
      }

      // 9-11 are covered by R3F tests below, mark as pending to be updated by R3FTest component via callback
    })();
  }, []);

  return (
    <Screen gradient={gradients.hub}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="display">Debug — Web Runtime Test</Text>
        <Text variant="caption" muted>Tests plain JS → React → Router → Three.js → WebGL → R3F → Nexus Arena module. Each independent.</Text>

        <Card variant="glass" padding={spacing.md} style={{ gap: 6 }}>
          <Text variant="micro" color={palette.cyan}>INSTRUCTIONS</Text>
          <Text variant="caption" muted>
            If #1-5 FAIL → Cloudflare serving broken files or browser no WebGL.{'\n'}
            If #7 FAIL but #4 PASS → Three.js module broken.{'\n'}
            If #8 FAIL but #7 PASS → R3F layer broken.{'\n'}
            If #13 FAIL but #7-8 PASS → Nexus Arena module import broken.{'\n'}
            Check console.error for first meaningful error.
          </Text>
        </Card>

        {results.map((r, i) => (
          <Card key={i} variant="glass" padding={spacing.md} style={[styles.testCard, r.status === 'FAIL' && { borderColor: 'rgba(255,107,107,0.6)' }, r.status === 'PASS' && { borderColor: 'rgba(52,226,168,0.4)' }]}>
            <View style={styles.testRow}>
              <Text variant="label" color={r.status === 'PASS' ? palette.mint : r.status === 'FAIL' ? palette.coral : palette.textMuted}>{r.label}</Text>
              <View style={[styles.badge, { backgroundColor: r.status === 'PASS' ? 'rgba(52,226,168,0.18)' : r.status === 'FAIL' ? 'rgba(255,107,107,0.18)' : 'rgba(255,255,255,0.06)' }]}>
                <Text variant="micro" color={r.status === 'PASS' ? palette.mint : r.status === 'FAIL' ? palette.coral : palette.textMuted}>{r.status}</Text>
              </View>
            </View>
            {r.detail ? <Text variant="caption" muted style={{ marginTop: 4 }}>{r.detail}</Text> : null}
          </Card>
        ))}

        <Text variant="subheading" style={{ marginTop: spacing.lg }}>7. Raw Three.js Cube</Text>
        <View style={styles.canvasWrap}>
          <canvas ref={rawThreeRef} width={320} height={180} style={{ width: 320, height: 180, backgroundColor: '#1A1A2E' } as any} />
        </View>

        <Text variant="subheading" style={{ marginTop: spacing.lg }}>8. Minimal R3F Cube</Text>
        <View style={styles.canvasWrap}>
          <R3FTest onResult={(ok, detail) => update(7, ok ? 'PASS' : 'FAIL', detail)} />
        </View>

        <Card variant="glass" padding={spacing.md} style={{ marginTop: spacing.lg }}>
          <Text variant="micro" color={palette.gold}>NEXT</Text>
          <Text variant="caption" muted>Go to /debug/arena for minimal Nexus Arena renderer test (floor + light + camera + player cube). If that works, enable systems progressively: player model → enemy → camera controller → movement → combat → AI → particles → HUD → full.</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function R3FTest({ onResult }: { onResult: (ok: boolean, detail?: string) => void }) {
  const [status, setStatus] = useState<'pending' | 'ok' | 'fail'>('pending');
  const [detail, setDetail] = useState<string>('');

  useEffect(() => {
    // This component itself is proof R3F can mount — if it throws, ErrorBoundary would catch
    setStatus('ok');
    setDetail('R3FTest component mounted, will render Canvas below');
    onResult(true, 'R3FTest component mounted');
  }, [onResult]);

  if (status === 'fail') {
    return <Text variant="caption" color={palette.coral}>{detail}</Text>;
  }

  return (
    <View style={{ width: 320, height: 180, backgroundColor: '#1A1A2E', borderRadius: 8, overflow: 'hidden' }}>
      <R3FCanvasTest onResult={onResult} />
    </View>
  );
}

function R3FCanvasTest({ onResult }: { onResult: (ok: boolean, detail?: string) => void }) {
  const [Three, setThree] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fiber = await import('@react-three/fiber');
        const THREE = await import('three');
        if (!mounted) return;
        setThree({ fiber, THREE });
        onResult(true, `@react-three/fiber Canvas + three ${THREE.REVISION} loaded, attempting render`);
      } catch (e: any) {
        onResult(false, e?.message ?? String(e));
      }
    })();
    return () => { mounted = false; };
  }, [onResult]);

  if (!Three) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" muted>Loading R3F...</Text></View>;

  const { fiber, THREE } = Three;
  const Canvas = fiber.Canvas;

  return (
    <Canvas
      style={{ width: 320, height: 180 } as any}
      camera={{ position: [0, 2, 4], fov: 50 }}
      gl={{ antialias: true }}
      onCreated={({ gl, scene }: any) => {
        try {
          const canvas = gl.domElement as HTMLCanvasElement;
          onResult(true, `R3F Canvas created ${canvas.width}x${canvas.height}, WebGLRenderer ok`);
        } catch (e: any) {
          onResult(false, e?.message ?? String(e));
        }
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 5, 3]} intensity={1.2} />
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#FFD166" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#2A2A4A" />
      </mesh>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  testCard: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  testRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  canvasWrap: { alignItems: 'center', marginVertical: spacing.sm },
});
