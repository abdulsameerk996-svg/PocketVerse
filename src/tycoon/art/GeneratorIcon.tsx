import React, { memo } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import type { GeneratorId } from '../types';

/**
 * One vector glyph per generator — clean geometric shop-empire icons, drawn
 * from the same warm palette so the shop reads as one café.
 */
export const GeneratorIcon = memo(function GeneratorIcon({
  id,
  size,
  color = '#E8934A',
}: {
  id: GeneratorId;
  size: number;
  color?: string;
}) {
  const c = color;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {id === 'barista' && (
        <>
          {/* apron + head */}
          <Rect x={24} y={20} width={16} height={26} rx={6} fill={c} />
          <Circle cx={32} cy={14} r={7} fill={c} />
          {/* arm holding cup */}
          <Path d="M40 30 q8 2 6 9" stroke={c} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Rect x={42} y={36} width={10} height={8} rx={2} fill="#FFD166" />
        </>
      )}
      {id === 'fryer' && (
        <>
          <Rect x={14} y={26} width={36} height={20} rx={4} fill={c} />
          <Rect x={18} y={20} width={10} height={6} rx={2} fill="#FFD166" />
          <Path d="M26 20 q0 -8 6 -8 q6 0 6 8" stroke="#FF8FB3" strokeWidth={3} fill="none" />
          {/* oil bubbles */}
          <Circle cx={26} cy={36} r={2} fill="#160F0B" opacity={0.6} />
          <Circle cx={36} cy={40} r={2} fill="#160F0B" opacity={0.6} />
        </>
      )}
      {id === 'display' && (
        <>
          <Rect x={12} y={18} width={40} height={30} rx={4} fill={c} />
          {/* glass shine */}
          <Line x1={16} y1={22} x2={48} y2={22} stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
          {/* donuts on shelves */}
          <Circle cx={22} cy={32} r={5} fill="#FFD166" />
          <Circle cx={34} cy={32} r={5} fill="#FF8FB3" />
          <Circle cx={46} cy={32} r={5} fill="#7FD8A0" />
          <Circle cx={28} cy={42} r={5} fill="#C9823F" />
          <Circle cx={40} cy={42} r={5} fill="#FFD166" />
        </>
      )}
      {id === 'drive' && (
        <>
          {/* drive-thru window */}
          <Rect x={10} y={20} width={44} height={28} rx={4} fill={c} />
          <Rect x={18} y={27} width={28} height={14} rx={2} fill="#160F0B" />
          <Rect x={22} y={30} width={20} height={8} rx={2} fill="#FFD166" />
          {/* awning */}
          <Path d="M8 16 q24 -8 48 0 l-4 6 q-20 -6 -40 0 z" fill="#FF8FB3" />
        </>
      )}
      {id === 'roaster' && (
        <>
          <Rect x={12} y={26} width={40} height={22} rx={4} fill={c} />
          <Circle cx={32} cy={37} r={9} fill="#160F0B" />
          <Circle cx={32} cy={37} r={5} fill="#FFD166" />
          {/* steam */}
          <Path d="M24 20 q4 -6 0 -10 M34 20 q4 -6 0 -10" stroke="#D9BFA6" strokeWidth={3} fill="none" strokeLinecap="round" />
        </>
      )}
      {id === 'van' && (
        <>
          <Path d="M10 40 L10 28 q0 -6 6 -6 L44 22 l10 6 v12 z" fill={c} />
          <Rect x={34} y={24} width={14} height={10} rx={2} fill="#7FD8A0" />
          <Circle cx={20} cy={46} r={5} fill="#160F0B" />
          <Circle cx={44} cy={46} r={5} fill="#160F0B" />
          <Rect x={48} y={30} width={10} height={6} rx={2} fill="#FFD166" />
        </>
      )}
      {id === 'franchise' && (
        <>
          <Path d="M10 26 L32 12 L54 26 Z" fill="#FF8FB3" />
          <Rect x={14} y={26} width={36} height={26} rx={3} fill={c} />
          <Rect x={22} y={30} width={20} height={8} rx={2} fill="#FFD166" />
          <Rect x={22} y={42} width={20} height={10} rx={2} fill="#160F0B" />
          <Line x1={16} y1={40} x2={48} y2={40} stroke="#160F0B" strokeWidth={2} />
        </>
      )}
      {id === 'robo' && (
        <>
          <Rect x={20} y={16} width={24} height={20} rx={4} fill={c} />
          <Circle cx={27} cy={26} r={2.5} fill="#160F0B" />
          <Circle cx={37} cy={26} r={2.5} fill="#160F0B" />
          <Path d="M28 32 h8" stroke="#160F0B" strokeWidth={2} strokeLinecap="round" />
          {/* arms */}
          <Path d="M18 34 L10 46 M46 34 L54 46" stroke={c} strokeWidth={4} strokeLinecap="round" />
          <Circle cx={10} cy={48} r={4} fill="#FFD166" />
          <Circle cx={54} cy={48} r={4} fill="#FFD166" />
        </>
      )}
    </Svg>
  );
});
