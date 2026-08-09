import React, { memo, useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from './Text';
import { compactNumber, withCommas } from '../utils/format';

export type CountUpProps = Omit<TextProps, 'children'> & {
  value: number;
  duration?: number;
  format?: 'compact' | 'comma' | 'plain';
  /** Custom display formatter (e.g. money with $ + suffix). */
  formatter?: (n: number) => string;
  prefix?: string;
  suffix?: string;
};

/**
 * Animated numeric readout — counting money up rather than snapping makes
 * rewards feel earned. Uses a JS interval deliberately: it drives text
 * content, which cannot live on the UI thread anyway.
 */
export const CountUp = memo(function CountUp({
  value,
  duration = 650,
  format = 'comma',
  formatter,
  prefix = '',
  suffix = '',
  ...textProps
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (Math.abs(to - from) < 2) {
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
  }, [value, duration]);

  const text = formatter
    ? formatter(display)
    : format === 'compact'
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
