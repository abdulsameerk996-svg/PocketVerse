import React, { memo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp } from 'react-native-reanimated';
import { Burst, PressableScale, Text } from '@/ui';
import { DonutIcon } from '../art/DonutIcon';
import { formatMoney } from '../format';

type Float = { id: number; amount: number; dx: number };

/**
 * The money-maker: a big glazed donut that pays out per tap.
 * Each press fires a radial burst and spawns a floating "+$X" label.
 */
export const TapDonut = memo(function TapDonut({
  tapPower,
  onTap,
}: {
  tapPower: number;
  onTap: () => void;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const [floats, setFloats] = useState<Float[]>([]);
  const idRef = useRef(0);

  const handlePress = () => {
    onTap();
    setBurstKey((k) => k + 1);
    const id = ++idRef.current;
    const next = { id, amount: tapPower, dx: (Math.random() - 0.5) * 40 };
    setFloats((f) => [...f.slice(-5), next]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
  };

  return (
    <View style={styles.wrap}>
      {floats.map((f) => (
        <FloatingLabel key={f.id} float={f} />
      ))}
      <PressableScale onPress={handlePress} scaleTo={0.92} haptic="collect" style={styles.donut}>
        <Burst trigger={burstKey} count={12} radius={74} colors={['#FFD166', '#FF8FB3', '#6FD3C0', '#FFFFFF']} size={7} />
        <DonutIcon size={180} />
      </PressableScale>
      <Text variant="caption" muted center style={styles.hint}>
        tap the donut to earn
      </Text>
    </View>
  );
});

const FloatingLabel = memo(function FloatingLabel({ float }: { float: Float }) {
  return (
    <Animated.Text
      entering={FadeOutUp.duration(850).delay(60)}
      style={[styles.float, { transform: [{ translateX: float.dx }] }]}
    >
      +{formatMoney(float.amount)}
    </Animated.Text>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  donut: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  hint: { marginTop: 8, opacity: 0.8 },
  float: {
    position: 'absolute',
    top: 30,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFD98A',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
});
