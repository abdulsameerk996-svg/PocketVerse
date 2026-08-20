import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, palette } from '@/ui';
import { BUILDING, GENERATOR_MAP } from '../data';
import type { Floater, GameState, WorldCharacter } from '../types';
import { SpriteCharacter } from './SpriteCharacter';
import { formatMoney } from '../format';

/**
 * Side-view café building — the flagship visual of the tycoon.
 *
 * Renders:
 * - Building shell (walls, roof, street)
 * - Floors stacked vertically with equipment slots
 * - Equipment glyphs in each slot
 * - Character sprites walking between stations
 * - Floating "+$X" money labels rising from equipment
 * - Floor labels
 *
 * The entire component is pure RN views — no R3F, no canvas, no SVG.
 * This keeps it fast even with 8 floors × 6 slots × 8 characters.
 */
export const CafeWorld = memo(function CafeWorld({
  state,
  characters,
  floaters,
  onTapBuilding,
}: {
  state: GameState;
  characters: WorldCharacter[];
  floaters: Floater[];
  onTapBuilding: () => void;
}) {
  const w = Math.max(1, Math.floor(state.floorWidth));
  const totalFloors = Math.max(1, state.floors);
  const cellWidth = 56;
  const buildingWidth = w * cellWidth;

  // Which floors have equipment?
  const floorData = useMemo(() => {
    const floors: { floor: number; slots: { id: string; glyph: string; name: string }[] }[] = [];
    for (let f = 0; f < totalFloors; f++) {
      const slots: { id: string; glyph: string; name: string }[] = [];
      for (let s = 0; s < w; s++) {
        // Find what's in this slot by flat-indexing all generators
        let flatIdx = f * w + s;
        let found = false;
        for (const def of Object.values(GENERATOR_MAP)) {
          const owned = state.generators[def.id] ?? 0;
          if (flatIdx < owned) {
            slots.push({ id: `${def.id}_${s}`, glyph: def.glyph, name: def.name });
            found = true;
            break;
          }
          flatIdx -= owned;
        }
        if (!found) {
          slots.push({ id: `empty_${s}`, glyph: '', name: '' });
        }
      }
      floors.push({ floor: f, slots });
    }
    return floors;
  }, [state.generators, totalFloors, w]);

  // Characters grouped by floor
  const charsByFloor = useMemo(() => {
    const map: Record<number, WorldCharacter[]> = {};
    for (const c of characters) {
      if (!map[c.floor]) map[c.floor] = [];
      map[c.floor].push(c);
    }
    return map;
  }, [characters]);

  // Floaters grouped by floor
  const floatersByFloor = useMemo(() => {
    const map: Record<number, Floater[]> = {};
    for (const f of floaters) {
      if (!map[f.floor]) map[f.floor] = [];
      map[f.floor].push(f);
    }
    return map;
  }, [floaters]);

  return (
    <View style={styles.container} onTouchEnd={onTapBuilding}>
      {/* Sky / background */}
      <View style={styles.sky}>
        <Text variant="caption" center color={palette.textFaint} style={styles.skyLabel}>
          ☕ Tap the counter to collect tips
        </Text>
      </View>

      {/* Building wrapper */}
      <View style={[styles.buildingWrap, { width: buildingWidth + 40 }]}>
        {/* Roof */}
        <View style={[styles.roof, { width: buildingWidth + 32 }]}>
          <View style={styles.roofPeak} />
          <Text variant="micro" color={palette.text} center style={styles.roofText}>
            CAFÉ TYCOON
          </Text>
        </View>

        {/* Floors (rendered top-down but displayed bottom-up) */}
        {floorData.map((floorInfo, fi) => {
          const floorIdx = totalFloors - 1 - fi; // reverse so floor 1 is at bottom
          const hasEquipment = floorInfo.slots.some((s) => s.glyph !== '');
          const charsOnFloor = charsByFloor[floorIdx] ?? [];
          const floatersOnFloor = floatersByFloor[floorIdx] ?? [];

          return (
            <View
              key={floorIdx}
              style={[
                styles.floor,
                {
                  width: buildingWidth + 28,
                  height: BUILDING.floorVisualHeight,
                },
                fi === totalFloors - 1 && styles.floorFirst,
              ]}
            >
              {/* Floor label */}
              <Text variant="micro" color={palette.textFaint} style={styles.floorLabel}>
                F{floorIdx + 1}
              </Text>

              {/* Equipment slots */}
              <View style={[styles.slotsRow, { width: buildingWidth }]}>
                {floorInfo.slots.map((slot, si) => {
                  const isEmpty = !slot.glyph;
                  return (
                    <View
                      key={si}
                      style={[
                        styles.slot,
                        { width: cellWidth - 4, height: BUILDING.floorVisualHeight - 16 },
                        isEmpty ? styles.slotEmpty : styles.slotFilled,
                      ]}
                    >
                      {isEmpty ? (
                        <Text size={10} color={palette.textFaint} center style={styles.emptySlot}>
                          +
                        </Text>
                      ) : (
                        <>
                          <Text size={20} style={styles.slotGlyph}>{slot.glyph}</Text>
                          <Text variant="micro" color={palette.textMuted} numberOfLines={1} style={styles.slotName}>
                            {slot.name}
                          </Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Characters on this floor */}
              {charsOnFloor.map((char) => (
                <SpriteCharacter
                  key={char.id}
                  char={char}
                  floorWidth={w}
                  cellWidth={cellWidth}
                />
              ))}

              {/* Floating money */}
              {floatersOnFloor.map((f) => {
                const age = (Date.now() - f.born) / 1000;
                const progress = Math.min(1, age / 1.2);
                return (
                  <Text
                    key={f.id}
                    style={[
                      styles.floater,
                      {
                        left: f.x * cellWidth * w + 20,
                        top: 8 - progress * 30,
                        opacity: 1 - progress * 0.8,
                      },
                    ]}
                    color="#FFD98A"
                  >
                    +{formatMoney(f.amount)}
                  </Text>
                );
              })}
            </View>
          );
        })}

        {/* Street */}
        <View style={styles.street}>
          <View style={styles.sidewalk} />
          <View style={styles.road}>
            <View style={styles.roadLine} />
          </View>
        </View>
      </View>

      {/* Income indicator overlaid at bottom of world */}
      <View style={styles.incomeBadge}>
        <Text variant="caption" color={palette.gold} numeric>
          +{formatMoney(deriveQuickCps(state))}/s
        </Text>
      </View>
    </View>
  );
});

/* ---- quick CPS without importing engine ---- */
import { GENERATORS } from '../data';
function deriveQuickCps(state: GameState): number {
  let cps = 0;
  for (const def of GENERATORS) {
    const owned = typeof state.generators[def.id] === 'number' ? state.generators[def.id] : 0;
    cps += owned * def.baseCps;
  }
  return cps;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  sky: {
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  skyLabel: { opacity: 0.6 },
  buildingWrap: {
    alignItems: 'center',
  },
  roof: {
    height: 28,
    backgroundColor: '#5C3D2E',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7A5240',
    borderBottomWidth: 0,
  },
  roofPeak: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#5C3D2E',
  },
  roofText: { letterSpacing: 2, fontSize: 9 },
  floor: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C1E14',
    borderWidth: 1,
    borderColor: '#4A3428',
    borderTopWidth: 0,
    paddingHorizontal: 4,
    overflow: 'visible',
  },
  floorFirst: {
    borderBottomWidth: 2,
    borderBottomColor: '#5C3D2E',
  },
  floorLabel: {
    width: 18,
    fontSize: 8,
    opacity: 0.5,
  },
  slotsRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 4,
    paddingLeft: 2,
  },
  slot: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  slotEmpty: {
    backgroundColor: 'rgba(255,236,214,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,236,214,0.06)',
    borderStyle: 'dashed',
  },
  slotFilled: {
    backgroundColor: 'rgba(255,217,138,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,138,0.15)',
  },
  emptySlot: { opacity: 0.3 },
  slotGlyph: { lineHeight: 24 },
  slotName: { fontSize: 7, opacity: 0.6 },
  floater: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    zIndex: 30,
    pointerEvents: 'none',
  },
  street: {
    width: '100%',
    overflow: 'hidden',
  },
  sidewalk: {
    height: 8,
    backgroundColor: '#6B5744',
  },
  road: {
    height: 14,
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadLine: {
    width: '80%',
    height: 2,
    backgroundColor: '#666',
    borderRadius: 1,
    opacity: 0.5,
  },
  incomeBadge: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,217,138,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,217,138,0.25)',
  },
});
