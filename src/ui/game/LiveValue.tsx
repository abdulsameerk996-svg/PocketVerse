import React, { memo, useEffect, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { Text, type TextProps } from '../components/Text';

/**
 * Bridges a UI-thread `SharedValue` into readable text.
 *
 * Game simulation lives on the UI thread, but a score readout has to be a React
 * string. Rather than pushing a value across the bridge 60×/second, this polls
 * at 10 Hz **inside its own component**, so only this small node re-renders —
 * the game surface itself never re-renders while playing.
 */
export const LiveValue = memo(function LiveValue({
  value,
  fps = 10,
  format = (v: number) => `${Math.floor(v)}`,
  ...textProps
}: {
  value: SharedValue<number>;
  fps?: number;
  format?: (v: number) => string;
} & Omit<TextProps, 'children'>) {
  const [display, setDisplay] = useState(() => format(value.value));

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((prev) => {
        const next = format(value.value);
        return prev === next ? prev : next;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [value, fps, format]);

  return (
    <Text numeric {...textProps}>
      {display}
    </Text>
  );
});
