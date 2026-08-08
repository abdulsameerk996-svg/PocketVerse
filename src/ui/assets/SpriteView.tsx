import React, { memo } from 'react';
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';
import { SPRITE_SIZE, type Sprite, type SpriteShape } from './sprites';

/**
 * Renders a `Sprite` as crisp vector art via react-native-svg.
 *
 * Works identically on Android and web (react-native-svg ships its own web
 * implementation, and it is a direct dependency already). Shapes are static
 * data, so this component is memo-safe: a pooled entity that renders the same
 * sprite index never re-draws.
 *
 * Accessibility: the sprite carries a semantic label (item name, game title,
 * icon description) so replacing an emoji never removes the label.
 */
const Shape = memo(function Shape({ s }: { s: SpriteShape }) {
  switch (s.t) {
    case 'circle':
      return (
        <Circle
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
        />
      );
    case 'ring':
      return (
        <Circle
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="none"
          stroke={s.color}
          strokeWidth={s.w}
          opacity={s.opacity}
        />
      );
    case 'rect': {
      const common = {
        x: s.x,
        y: s.y,
        width: s.w,
        height: s.h,
        rx: s.rx ?? 0,
        fill: s.fill,
        stroke: s.stroke,
        strokeWidth: s.strokeW,
        opacity: s.opacity,
      };
      if (s.rotate) {
        return <Rect {...common} transform={`rotate(${s.rotate} 32 32)`} />;
      }
      return <Rect {...common} />;
    }
    case 'poly':
      return (
        <Polygon
          points={s.pts.map((p) => `${p[0]},${p[1]}`).join(' ')}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeW}
          opacity={s.opacity}
        />
      );
    case 'line':
      return (
        <Line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.color}
          strokeWidth={s.w}
          opacity={s.opacity}
          strokeLinecap="round"
        />
      );
  }
});

export type SpriteViewProps = {
  sprite: Sprite | null | undefined;
  size: number;
  /** Overrides the sprite's semantic label (a11y). */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export const SpriteView = memo(function SpriteView({ sprite, size, label, style }: SpriteViewProps) {
  if (!sprite) return null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      accessibilityLabel={label ?? sprite.label}
      accessible
      style={style}
    >
      {sprite.shapes.map((s, i) => (
        <Shape key={i} s={s} />
      ))}
    </Svg>
  );
});
