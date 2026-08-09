import React, { memo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

/** Neon Rings mark — a glowing ring with a gap and the launched ball. */
export const RingIcon = memo(function RingIcon({ size, style }: { size: number; style?: object }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      {/* pole */}
      <Line x1={50} y1={10} x2={50} y2={90} stroke="rgba(34,211,238,0.25)" strokeWidth={5} strokeLinecap="round" />
      <Line x1={50} y1={10} x2={50} y2={90} stroke="#22D3EE" strokeWidth={2} strokeLinecap="round" />
      {/* ring with gap (rotated so gap faces the ball below) */}
      <Circle
        cx={50}
        cy={40}
        r={26}
        stroke="#FF4D8D"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="120 43.4"
        rotation={132}
      />
      {/* ball */}
      <Circle cx={50} cy={78} r={9} fill="rgba(34,211,238,0.3)" />
      <Circle cx={50} cy={78} r={5.5} fill="#22D3EE" />
      <Circle cx={48} cy={76} r={1.8} fill="rgba(255,255,255,0.9)" />
    </Svg>
  );
});
