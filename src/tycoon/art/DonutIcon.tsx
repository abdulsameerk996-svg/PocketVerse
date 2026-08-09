import React, { memo } from 'react';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';

/**
 * Donut Tycoon's hero mark — a vector glazed ring with sprinkles. No binaries,
 * no emoji-as-art; pure deterministic shapes that work on web and Android.
 */
export const DonutIcon = memo(function DonutIcon({
  size,
  glaze = '#FF8FB3',
  dough = '#C9823F',
  sprinkle = ['#FFD166', '#6FD3C0', '#7FD8A0', '#FFFFFF'],
  style,
}: {
  size: number;
  glaze?: string;
  dough?: string;
  sprinkle?: string[];
  style?: object;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      {/* dough ring */}
      <Circle cx={50} cy={52} r={40} fill={dough} />
      {/* glaze layer on top */}
      <Ellipse cx={50} cy={48} rx={40} ry={36} fill={glaze} />
      {/* hole */}
      <Circle cx={50} cy={46} r={15} fill="#160F0B" opacity={0.92} />
      {/* sprinkles */}
      <Rect x={22} y={34} width={7} height={3.2} rx={1.6} fill={sprinkle[0]} transform="rotate(-20 25 36)" />
      <Rect x={44} y={22} width={7} height={3.2} rx={1.6} fill={sprinkle[1]} transform="rotate(15 47 24)" />
      <Rect x={66} y={30} width={7} height={3.2} rx={1.6} fill={sprinkle[2]} transform="rotate(-35 69 32)" />
      <Rect x={30} y={56} width={7} height={3.2} rx={1.6} fill={sprinkle[3]} transform="rotate(40 33 58)" />
      <Rect x={58} y={52} width={7} height={3.2} rx={1.6} fill={sprinkle[0]} transform="rotate(-10 61 54)" />
      <Rect x={76} y={52} width={7} height={3.2} rx={1.6} fill={sprinkle[1]} transform="rotate(25 79 54)" />
      <Rect x={38} y={66} width={7} height={3.2} rx={1.6} fill={sprinkle[2]} transform="rotate(-50 41 68)" />
      {/* glaze drip on the side */}
      <Ellipse cx={72} cy={56} rx={7} ry={11} fill={glaze} />
    </Svg>
  );
});
