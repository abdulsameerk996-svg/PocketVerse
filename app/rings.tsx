import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { PressableScale, Text, palette, radius, spacing } from '@/ui';
import { useRings } from '@/rings/store';
import { useRingsTicker } from '@/rings/ticker';
import { idleBallY, ringRot, ringY } from '@/rings/logic';

const NEON = {
  cyan: '#22D3EE',
  magenta: '#FF4D8D',
  violet: '#7C5CFF',
  gold: '#FFD98A',
  bg: ['#1A0B2E', '#0D0520', '#070312'] as const,
};

/**
 * NEON RINGS
 *
 * The ball bounces at the base of a neon pole. Tap to launch it straight up.
 * Rings slide up and down the pole, each with a rotating gap — pass only when
 * the gap is open toward you. Level by level, the rings multiply and tighten.
 */
export default function NeonRings() {
  useRingsTicker();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const state = useRings((s) => s.state);
  const tap = useRings((s) => s.tap);
  const retry = useRings((s) => s.retry);

  const ballY = state.status === 'flying' ? state.ballY : idleBallY(state);
  const over = state.status === 'over';
  const levelUp = state.levelUpFlash > 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...NEON.bg]} style={StyleSheet.absoluteFill} />

      {/* HUD */}
      <View style={[styles.hud, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => router.back()} scaleTo={0.9} style={styles.back}>
          <Text size={16}>←</Text>
        </PressableScale>
        <View style={styles.hudStats}>
          <HudStat label="LEVEL" value={`${state.level}`} color={NEON.cyan} />
          <HudStat label="SCORE" value={`${state.score}`} color={NEON.gold} />
          <HudStat label="BEST" value={`${Math.max(state.best, state.score)}`} color={NEON.magenta} />
        </View>
      </View>

      {/* playfield */}
      <Pressable style={styles.field} onPress={() => { if (!over) tap(); }}>
        <Scene state={state} ballY={ballY} />

        {levelUp ? (
          <View pointerEvents="none" style={styles.levelUpBanner}>
            <Text variant="title" color={NEON.cyan} style={{ textShadowColor: NEON.cyan, textShadowRadius: 10 }}>
              LEVEL {state.level}
            </Text>
            <Text variant="caption" color={NEON.magenta}>
              {state.rings.length} rings · tighter gaps
            </Text>
          </View>
        ) : null}

        {!over && state.status === 'idle' && !levelUp ? (
          <View pointerEvents="none" style={styles.launchHint}>
            <Text variant="heading" color={NEON.cyan} style={{ textShadowColor: NEON.cyan, textShadowRadius: 8 }}>
              TAP TO LAUNCH
            </Text>
            <Text variant="caption" muted style={{ marginTop: 4 }}>
              time the ring gaps · {state.rings.length} rings ahead
            </Text>
          </View>
        ) : null}

        {state.combo >= 3 && !over ? (
          <View pointerEvents="none" style={styles.combo}>
            <Text variant="heading" color={NEON.magenta}>
              {state.combo}× COMBO
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* game over */}
      {over ? (
        <View style={[styles.overlay, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.overCard}>
            <Text variant="micro" color={NEON.magenta}>
              RUN OVER
            </Text>
            <Text variant="display" color={NEON.gold} style={{ marginTop: spacing.xs }}>
              {state.score}
            </Text>
            <Text variant="caption" muted>
              best {state.best} · reached level {state.bestLevel}
            </Text>
            <View style={styles.overActions}>
              <Button label="Back" variant="secondary" size="sm" onPress={() => router.back()} style={{ flex: 1 }} />
              <Button label="Retry" size="sm" onPress={retry} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ scene ---- */

const Scene = memo(function Scene({
  state,
  ballY,
}: {
  state: ReturnType<typeof useRings.getState>['state'];
  ballY: number;
}) {
  const W = 100; // logical width
  const H = 160; // logical height
  const cx = W / 2;
  const poleTop = 14;
  const poleBottom = H - 20;
  const poleLen = poleBottom - poleTop;
  const by = poleBottom - ballY * poleLen;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* starfield */}
      {STARS.map((s, i) => (
        <Circle key={i} cx={s[0]} cy={s[1]} r={s[2]} fill="rgba(255,255,255,0.5)" />
      ))}

      {/* grid floor */}
      <Line x1={4} y1={poleBottom + 4} x2={W - 4} y2={poleBottom + 4} stroke="rgba(124,92,255,0.35)" strokeWidth={1} />
      <Line x1={10} y1={poleBottom + 9} x2={W - 10} y2={poleBottom + 9} stroke="rgba(124,92,255,0.2)" strokeWidth={1} />

      {/* pole */}
      <Line x1={cx} y1={poleTop} x2={cx} y2={poleBottom} stroke="rgba(34,211,238,0.18)" strokeWidth={6} strokeLinecap="round" />
      <Line x1={cx} y1={poleTop} x2={cx} y2={poleBottom} stroke={NEON.cyan} strokeWidth={2.5} strokeLinecap="round" />

      {/* rings */}
      {state.rings.map((ring) => {
        const ry = ringY(ring, state.time);
        const cy = poleBottom - ry * poleLen;
        const rot = ringRot(ring, state.time);
        const gapDeg = (ring.gapHalf * 180) / Math.PI;
        const rotDeg = (rot * 180) / Math.PI;
        const r = ring.radius * W;
        const circum = 2 * Math.PI * r;
        const gapLen = 2 * r * ring.gapHalf;
        const solid = circum - gapLen;
        const passed = state.nextRing > ring.id;
        return (
          <Circle
            key={ring.id}
            cx={cx}
            cy={cy}
            r={r}
            stroke={passed ? 'rgba(34,211,238,0.25)' : NEON.magenta}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${solid} ${gapLen}`}
            rotation={90 + gapDeg + rotDeg}
            opacity={passed ? 0.35 : 1}
          />
        );
      })}

      {/* ball */}
      <Circle cx={cx} cy={by} r={7} fill="rgba(34,211,238,0.25)" />
      <Circle cx={cx} cy={by} r={4.2} fill={NEON.cyan} />
      <Circle cx={cx - 1.2} cy={by - 1.2} r={1.4} fill="rgba(255,255,255,0.9)" />

      {/* launch pad */}
      <Rect x={cx - 9} y={poleBottom - 2} width={18} height={3} rx={1.5} fill={NEON.violet} />
    </Svg>
  );
});

/** Static star positions (deterministic). */
const STARS: [number, number, number][] = [
  [8, 12, 0.8], [22, 26, 0.6], [34, 8, 0.9], [48, 20, 0.6], [60, 10, 0.8],
  [74, 24, 0.6], [86, 14, 0.9], [94, 30, 0.6], [16, 42, 0.6], [42, 36, 0.7],
  [68, 40, 0.6], [90, 46, 0.7], [28, 56, 0.6], [56, 50, 0.6], [80, 58, 0.6],
];

/* ---------------------------------------------------------- bits ---- */

const HudStat = memo(function HudStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.hudStat}>
      <Text variant="micro" color="rgba(255,255,255,0.5)">
        {label}
      </Text>
      <Text variant="label" numeric color={color}>
        {value}
      </Text>
    </View>
  );
});

/** Synthwave-styled button — the shared Button defaults to the coffee theme. */
function Button({ label, variant = 'primary', size = 'sm', onPress, style }: { label: string; variant?: 'primary' | 'secondary'; size?: 'sm' | 'md'; onPress: () => void; style?: object }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={[styles.btn, variant === 'secondary' && styles.btnSecondary, style]}>
      <Text variant="label" color={variant === 'secondary' ? palette.textMuted : palette.void}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0520' },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  hudStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  hudStat: { alignItems: 'center', gap: 1 },
  field: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  levelUpBanner: {
    position: 'absolute',
    top: '30%',
    alignItems: 'center',
    gap: 4,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(13,5,32,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
  },
  launchHint: { position: 'absolute', bottom: 40, alignItems: 'center' },
  combo: { position: 'absolute', top: '16%', alignSelf: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,2,14,0.6)',
    padding: spacing.xl,
  },
  overCard: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    padding: spacing.xxl,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(26,11,46,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,141,0.4)',
    gap: 4,
  },
  overActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, width: '100%' },
  btn: {
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEON.cyan,
    paddingHorizontal: spacing.md,
  },
  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
});
