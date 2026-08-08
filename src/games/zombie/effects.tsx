import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { palette, radius, spacing } from '@/ui';

/**
 * ============================================================================
 *  LAST SIGNAL — PRESENTATION LAYER
 * ============================================================================
 *
 * Everything here is *only* presentation. Nothing in this file participates in
 * the simulation: no collision, no scoring, no pickups, no writes to any value
 * the game loop reads. It renders alongside the existing 2D architecture and
 * can be deleted without changing a single gameplay outcome.
 *
 * Two hard rules, both learned the expensive way in this codebase:
 *
 *  1. **No `sc()` — or any other non-worklet function — inside a worklet.**
 *     Every scaled length arrives here as a prop, already resolved on the JS
 *     thread. A worklet that calls a captured JS function throws on the UI
 *     thread and takes the screen down with it.
 *  2. **Nothing here touches the scrap path.** Collection, rewards, inventory
 *     and persistence are verified working and are not imported, called or
 *     observed for anything except a read-only counter.
 *
 * Performance: every animation is a `withRepeat` on a shared value driven
 * entirely on the UI thread. There are no per-frame React renders, no timers
 * per particle, and the burst pool is fixed-size and recycled.
 */

/* ------------------------------------------------------------- atmosphere -- */

const FOG_BLOBS = 5;

/**
 * Layered depth behind the arena: a receding grid, slow drifting fog, and a
 * vignette. Three cheap layers do more for "atmospheric sci-fi" than any amount
 * of extra brightness, and none of them move fast enough to compete with the
 * entities for attention.
 */
export const Atmosphere = memo(function Atmosphere({
  width,
  top,
  height,
  accent,
}: {
  width: number;
  top: number;
  height: number;
  accent: string;
}) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 26000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(drift);
  }, [drift]);

  const rows = Math.max(3, Math.round(height / 46));
  const cols = Math.max(3, Math.round(width / 46));

  return (
    <View pointerEvents="none" style={[styles.fill, { top, height }]}>
      {/* receding grid — perspective is faked by fading the far rows */}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`r${i}`}
          style={[
            styles.gridLine,
            { top: (i / rows) * height, backgroundColor: accent, opacity: 0.03 + (i / rows) * 0.05 },
          ]}
        />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <View
          key={`c${i}`}
          style={[styles.gridCol, { left: (i / cols) * width, backgroundColor: accent, opacity: 0.035 }]}
        />
      ))}

      {Array.from({ length: FOG_BLOBS }, (_, i) => (
        <FogBlob key={i} index={i} drift={drift} width={width} height={height} accent={accent} />
      ))}

      {/* vignette: darkens the rim so the lit centre reads as the play space */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
});

const FogBlob = memo(function FogBlob({
  index,
  drift,
  width,
  height,
  accent,
}: {
  index: number;
  drift: SharedValue<number>;
  width: number;
  height: number;
  accent: string;
}) {
  const size = 150 + index * 46;
  const baseY = (index / FOG_BLOBS) * height;
  const dir = index % 2 === 0 ? 1 : -1;

  const style = useAnimatedStyle(() => {
    const t = (drift.value + index / FOG_BLOBS) % 1;
    return {
      transform: [
        { translateX: (t * (width + size) - size) * dir + (dir < 0 ? width : 0) },
        { translateY: baseY + Math.sin(t * Math.PI * 2) * 18 },
      ],
      opacity: 0.05 + Math.sin(t * Math.PI) * 0.05,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size * 0.55, borderRadius: size },
        { backgroundColor: accent },
        style,
      ]}
    />
  );
});

/* ----------------------------------------------------------------- signal -- */

export type SignalState = 'idle' | 'near' | 'charging' | 'burst';

/**
 * THE SIGNAL.
 *
 * A decorative beacon, and the game's namesake made visible. It has no
 * hitbox and no interaction — the game has never had a Signal *object*, only
 * the title — so its states are driven entirely by state the simulation
 * already keeps:
 *
 *   idle      · default ambient pulse
 *   near      · the player is close (read from px/py, purely observational)
 *   charging  · health is low — the beacon strains
 *   burst     · a wave was cleared, fired by the existing `startWave` callback
 *
 * Built from six layers so it reads as a 3D object in a 2D scene: halo, three
 * counter-rotating rings, a breathing core, orbiting fragments and sweeping
 * rays. All of it animates on the UI thread.
 */
export const SignalBeacon = memo(function SignalBeacon({
  x,
  y,
  size,
  px,
  py,
  hp,
  maxHp,
  alive,
  burst,
}: {
  x: number;
  y: number;
  size: number;
  px: SharedValue<number>;
  py: SharedValue<number>;
  hp: SharedValue<number>;
  maxHp: number;
  alive: SharedValue<number>;
  /** Bumped by the surface when a wave is cleared. */
  burst: SharedValue<number>;
}) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  const flare = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [spin, pulse]);

  // Wave cleared → one bright flare. Driven by a counter so repeats retrigger.
  useEffect(() => {
    const id = setInterval(() => {
      if (burst.value > 0) {
        burst.value = 0;
        flare.value = withSequence(
          withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) }),
        );
      }
    }, 100);
    return () => clearInterval(id);
  }, [burst, flare]);

  /**
   * Proximity + strain, as one 0..1 "energy" value. A derived value keeps this
   * on the UI thread; it reads shared values and does arithmetic only.
   */
  const energy = useDerivedValue(() => {
    'worklet';
    const dx = px.value - x;
    const dy = py.value - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = 1 - Math.min(1, dist / (size * 2.6));
    const strain = 1 - Math.min(1, Math.max(0, hp.value) / maxHp);
    const dead = alive.value < 1 ? 0.25 : 1;
    return Math.min(1, (near * 0.55 + strain * 0.45)) * dead;
  }, [x, y, size, maxHp]);

  // Halo opacity is deliberately low: it is atmosphere, and anything an entity
  // has to be seen *through* must not compete with the entity.
  const halo = useAnimatedStyle(() => {
    const p = pulse.value;
    const e = energy.value;
    return {
      opacity: 0.09 + p * 0.06 + e * 0.14 + flare.value * 0.3,
      transform: [{ scale: 1 + p * 0.12 + e * 0.16 + flare.value * 0.5 }],
    };
  });

  const core = useAnimatedStyle(() => {
    const p = pulse.value;
    const e = energy.value;
    return {
      opacity: 0.85 + p * 0.15,
      transform: [{ scale: 0.86 + p * 0.14 + e * 0.12 + flare.value * 0.3 }],
    };
  });

  // Written out rather than generated by a helper: calling a hook from inside
  // another function is fragile, and the worklet plugin is happier seeing each
  // `useAnimatedStyle` call literally.
  const ring1 = useAnimatedStyle(() => ({
    opacity: 0.28 + energy.value * 0.42 + flare.value * 0.3,
    transform: [
      { rotate: `${spin.value * 360}deg` },
      { scale: 1 + pulse.value * 0.05 + flare.value * 0.16 },
    ],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: 0.28 + energy.value * 0.42 + flare.value * 0.3,
    transform: [
      { rotate: `${spin.value * -223}deg` },
      { scale: 0.78 + pulse.value * 0.05 + flare.value * 0.16 },
    ],
  }));
  const ring3 = useAnimatedStyle(() => ({
    opacity: 0.28 + energy.value * 0.42 + flare.value * 0.3,
    transform: [
      { rotate: `${spin.value * 612}deg` },
      { scale: 1.24 + pulse.value * 0.05 + flare.value * 0.16 },
    ],
  }));

  const rays = useAnimatedStyle(() => ({
    opacity: 0.06 + energy.value * 0.16 + flare.value * 0.34,
    transform: [{ rotate: `${spin.value * -140}deg` }, { scale: 1 + flare.value * 0.3 }],
  }));

  const half = size / 2;

  return (
    <View pointerEvents="none" style={[styles.beacon, { left: x - half, top: y - half, width: size, height: size }]}>
      {/* sweeping light rays, behind everything */}
      <Animated.View style={[styles.centred, rays]}>
        {[0, 45, 90, 135].map((deg) => (
          <View
            key={deg}
            style={[
              styles.ray,
              {
                width: size * 2.4,
                height: size * 0.1,
                backgroundColor: palette.cyan,
                transform: [{ rotate: `${deg}deg` }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* outer halo */}
      <Animated.View
        style={[
          styles.centred,
          { width: size, height: size, borderRadius: half, backgroundColor: palette.cyan },
          halo,
        ]}
      />

      {/* energy rings */}
      <Animated.View style={[styles.centred, ring3]}>
        <View style={[styles.ring, { width: size, height: size, borderRadius: half, borderColor: palette.violet }]} />
      </Animated.View>
      <Animated.View style={[styles.centred, ring1]}>
        <View style={[styles.ringDashed, { width: size * 0.82, height: size * 0.82, borderRadius: size, borderColor: palette.cyan }]} />
      </Animated.View>
      <Animated.View style={[styles.centred, ring2]}>
        <View style={[styles.ring, { width: size * 0.58, height: size * 0.58, borderRadius: size, borderColor: palette.mint }]} />
      </Animated.View>

      {/* orbiting fragments */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Fragment key={i} index={i} spin={spin} energy={energy} size={size} />
      ))}

      {/* core */}
      <Animated.View style={[styles.centred, core]}>
        <View style={[styles.core, { width: size * 0.34, height: size * 0.34, borderRadius: size }]} />
        <View style={[styles.coreInner, { width: size * 0.16, height: size * 0.16, borderRadius: size }]} />
      </Animated.View>
    </View>
  );
});

const Fragment = memo(function Fragment({
  index,
  spin,
  energy,
  size,
}: {
  index: number;
  spin: SharedValue<number>;
  energy: SharedValue<number>;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const dir = index % 2 === 0 ? 1 : -1;
    const angle = (spin.value * 360 * (0.5 + index * 0.12) * dir + index * 60) * (Math.PI / 180);
    const orbit = size * (0.38 + (index % 3) * 0.09) * (1 + energy.value * 0.14);
    return {
      opacity: 0.4 + energy.value * 0.55,
      transform: [
        { translateX: Math.cos(angle) * orbit },
        { translateY: Math.sin(angle) * orbit * 0.62 },
        { scale: 0.7 + energy.value * 0.5 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.centred, style]}>
      <View
        style={{
          width: size * 0.07,
          height: size * 0.07,
          borderRadius: 2,
          backgroundColor: index % 2 ? palette.mint : palette.cyan,
        }}
      />
    </Animated.View>
  );
});

/* ---------------------------------------------------------------- bursts -- */

export type BurstHandle = { fire: (x: number, y: number, color: string, count?: number) => void };

const BURST_SLOTS = 18;

/**
 * A small recycled pool of expanding rings, for pickup collection and hits.
 *
 * Pooled and fixed-size on purpose: a wave-survival game produces bursts in
 * clusters, and mounting a component per effect is how an arcade game develops
 * a stutter. Each slot animates on the UI thread and is reused round-robin.
 */
export const BurstLayer = memo(function BurstLayer({
  handle,
}: {
  handle: React.RefObject<BurstHandle | null>;
}) {
  const slots = useRef(
    Array.from({ length: BURST_SLOTS }, () => ({
      x: 0,
      y: 0,
      color: palette.cyan as string,
    })),
  ).current;
  const [, force] = useState(0);
  const progress = useRef(
    Array.from({ length: BURST_SLOTS }, () => ({ p: null as SharedValue<number> | null })),
  ).current;
  const cursor = useRef(0);

  if (handle) {
    handle.current = {
      fire(x, y, color) {
        const i = cursor.current % BURST_SLOTS;
        cursor.current += 1;
        slots[i].x = x;
        slots[i].y = y;
        slots[i].color = color;
        const sv = progress[i].p;
        if (sv) {
          sv.value = 0;
          sv.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
        }
        force((n) => n + 1);
      },
    };
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {slots.map((s, i) => (
        <BurstRing key={i} slot={s} register={(sv) => (progress[i].p = sv)} />
      ))}
    </View>
  );
});

const BurstRing = memo(function BurstRing({
  slot,
  register,
}: {
  slot: { x: number; y: number; color: string };
  register: (sv: SharedValue<number>) => void;
}) {
  const p = useSharedValue(1);
  useEffect(() => {
    // Braces matter here. `useEffect(() => register(p), …)` looks equivalent
    // and is not: an expression-bodied arrow *returns* the assignment's value,
    // React takes that returned value to be the cleanup function, and calling
    // it on unmount throws "destroy is not a function" — which minifies into
    // an unrecognisable `s is not a function` and kills the whole surface.
    register(p);
  }, [p, register]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value >= 1 ? 0 : interpolate(p.value, [0, 0.25, 1], [0, 0.85, 0]),
    transform: [
      { translateX: slot.x - 26 },
      { translateY: slot.y - 26 },
      { scale: 0.25 + p.value * 1.5 },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.burst, { borderColor: slot.color }, style]} />
  );
});

/* ----------------------------------------------------------------- hooks -- */

/**
 * Watch a shared value for increases from the JS thread and report the delta.
 *
 * This is how presentation reacts to gameplay without the simulation having to
 * know it exists: the worklet is not touched, no callback is threaded through
 * it, and a dropped poll costs one missed sparkle rather than a missed pickup.
 * 15 Hz is well under a frame budget and above the eye's threshold for
 * associating an effect with its cause.
 */
export function useValueIncrease(
  value: SharedValue<number>,
  onIncrease: (delta: number) => void,
  active = true,
) {
  const cb = useRef(onIncrease);
  useEffect(() => {
    cb.current = onIncrease;
  }, [onIncrease]);

  useEffect(() => {
    if (!active) return;
    let last = value.value;
    const id = setInterval(() => {
      const now = value.value;
      if (now > last) {
        const delta = now - last;
        last = now;
        cb.current(delta);
      } else if (now < last) {
        last = now;
      }
    }, 66);
    return () => clearInterval(id);
  }, [value, active]);
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  gridCol: { position: 'absolute', top: 0, bottom: 0, width: 1 },

  beacon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  centred: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5, opacity: 0.9 },
  ringDashed: { borderWidth: 1, borderStyle: 'dashed', opacity: 0.9 },
  ray: { position: 'absolute', borderRadius: 99, opacity: 0.5 },
  core: { backgroundColor: palette.white, opacity: 0.9 },
  coreInner: { position: 'absolute', backgroundColor: palette.cyan },

  burst: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
  },

  hudCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,10,20,0.66)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});

export const hudCardStyle = styles.hudCard;
