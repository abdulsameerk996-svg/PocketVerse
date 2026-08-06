import type { ItemDef } from '@/core/types';
import { palette } from '@/ui/theme/tokens';

export const RUNNER_SKINS = [
  { id: 'run_default', name: 'Rookie', glyph: '🏃', color: palette.violet, price: 0 },
  { id: 'run_ninja', name: 'Nightblade', glyph: '🥷', color: '#2E2E4E', price: 1400 },
  { id: 'run_robot', name: 'Unit-07', glyph: '🤖', color: palette.cyan, price: 2800 },
  { id: 'run_ghost', name: 'Wisp', glyph: '👻', color: '#8AA0FF', price: 5200 },
  { id: 'run_dragon', name: 'Scale', glyph: '🐲', color: palette.mint, price: 9600 },
] as const;

export const RUNNER_ITEMS: ItemDef[] = RUNNER_SKINS.filter((s) => s.price > 0).map((s) => ({
  id: s.id,
  name: s.name,
  kind: 'cosmetic',
  rarity: s.price > 5000 ? 'legendary' : s.price > 2000 ? 'epic' : 'rare',
  glyph: s.glyph,
  description: 'Runner skin — also appears as your character in the arcade.',
  value: Math.round(s.price * 0.25),
  stackable: false,
  slot: 'face',
  tint: s.color,
  source: 'runner',
  price: { currency: 'coins', amount: s.price },
}));
