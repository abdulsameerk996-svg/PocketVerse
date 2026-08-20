import React, { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/ui';
import type { WorldCharacter } from '../types';

/**
 * A tiny 2D sprite character for the café world.
 * - Barista: circle head + coloured body apron, works at a station
 * - Customer: circle head + neutral body, visits then leaves
 *
 * All rendering is pure React Native views — no SVG needed for these
 * simple geometric characters, which keeps the world performant with
 * many characters on screen.
 */
export const SpriteCharacter = memo(function SpriteCharacter({
  char,
  floorWidth,
  cellWidth,
}: {
  char: WorldCharacter;
  floorWidth: number;
  cellWidth: number;
}) {
  const isBarista = char.type === 'barista';
  const baseHue = char.hue;

  // Colour palette derived from the hue
  const headColor = hsl(baseHue, 45, 75);
  const bodyColor = isBarista ? hsl(baseHue, 55, 50) : hsl(baseHue, 25, 55);
  const accentColor = isBarista ? '#FFD166' : hsl(baseHue, 30, 65);

  // Position within the floor
  const xPos = char.x * cellWidth * floorWidth;

  // Subtle bob for walking characters
  const isMoving = char.state === 'walking' || char.state === 'entering' || char.state === 'leaving';
  const bobOffset = isMoving ? Math.sin(Date.now() * 0.006 + char.hue) * 2 : 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: xPos - 10,
        bottom: 24 + bobOffset,
        width: 20,
        alignItems: 'center',
        zIndex: isBarista ? 20 : 10,
      }}
    >
      {/* hat / head accessory for baristas */}
      {isBarista && (
        <View
          style={{
            width: 14,
            height: 5,
            borderRadius: 3,
            backgroundColor: accentColor,
            marginBottom: -2,
            zIndex: 2,
          }}
        />
      )}
      {/* head */}
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: headColor,
          zIndex: 1,
        }}
      />
      {/* body */}
      <View
        style={{
          width: 16,
          height: 14,
          borderRadius: 4,
          backgroundColor: bodyColor,
          marginTop: -2,
        }}
      />
      {/* working indicator: small floating icon */}
      {char.state === 'working' && isBarista && (
        <Text
          size={8}
          style={{
            position: 'absolute',
            top: -14,
            opacity: 0.7,
          }}
        >
          {char.slot >= 0 ? '✨' : ''}
        </Text>
      )}
    </View>
  );
});

/**
 * Simple HSL to hex helper (no alpha, no platform dependency).
 */
function hsl(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
