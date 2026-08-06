import React, { memo, useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from './Text';
import { compactNumber, withCommas } from '@/core/utils/format';
import { useSettingsStore } from '@/core/state/settingsStore';

export type CountUpProps = Omit<TextProps, 'children'> & {
  value: number;
  duration?: number;
  format?: 'compact' | 'comma' | 'plain';
  prefix?: string;
  suffix?: string;
};

/**
 * Animated numeric readout.
 *
 * Counting coins up rather than snapping is a small thing that makes rewards
 * feel earned. Uses a JS interval intentionally: it drives text content, which
 * cannot live on the UI thread anyway, and runs only while a value changes.
 */
export const CountUp = memo(function CountUp({
  value,
  duration = 650,
  format = 'comma',
  prefix = '',
  suffix = '',
  ...textProps
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (reduced || Math.abs(to - from) < 2) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t >= 1) {
        clearInterval(id);
        fromRef.current = to;
        setDisplay(to);
      }
    }, 32);

    return () => clearInterval(id);
  }, [value, duration, reduced]);

  const text =
    format === 'compact'
      ? compactNumber(display)
      : format === 'plain'
        ? `${Math.round(display)}`
        : withCommas(display);

  return (
    <Text numeric {...textProps}>
      {prefix}
      {text}
      {suffix}
    </Text>
  );
});
