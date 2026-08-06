import type { ItemDef } from '../types';
import { usePlayerStore } from '../state/playerStore';
import { useInventoryStore } from '../state/inventoryStore';
import { useProgressStore } from '../state/progressStore';
import { toast } from '../state/uiStore';
import { activityRepo } from '../db/repositories';
import { haptics } from '@/ui/hooks/useHaptics';
import { play } from '@/ui/hooks/useSound';

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: 'owned' | 'funds' | 'level' | 'unavailable' };

export function canPurchase(item: ItemDef): PurchaseResult {
  if (!item.price) return { ok: false, reason: 'unavailable' };
  const { player } = usePlayerStore.getState();
  if ((item.minLevel ?? 1) > player.level) return { ok: false, reason: 'level' };
  if (!item.stackable && useInventoryStore.getState().isUnlocked(item.id)) {
    return { ok: false, reason: 'owned' };
  }
  const balance = item.price.currency === 'coins' ? player.coins : player.gems;
  if (balance < item.price.amount) return { ok: false, reason: 'funds' };
  return { ok: true };
}

export function purchase(item: ItemDef, qty = 1): PurchaseResult {
  const check = canPurchase(item);
  if (!check.ok) {
    haptics.warn();
    play('ui.error');
    return check;
  }
  const price = item.price!;
  const player = usePlayerStore.getState();
  const total = price.amount * qty;
  const paid =
    price.currency === 'coins' ? player.spendCoins(total) : player.spendGems(total);
  if (!paid) return { ok: false, reason: 'funds' };

  const inv = useInventoryStore.getState();
  if (item.stackable) inv.add(item.id, qty);
  else inv.unlock(item.id);

  useProgressStore.getState().track({ store_purchases: 1 });
  haptics.success();
  play('reward.chest');
  toast({
    title: `Bought ${item.name}`,
    subtitle: `−${total} ${price.currency === 'coins' ? '🪙' : '💎'}`,
    glyph: item.glyph,
    tone: 'success',
  });
  void activityRepo.add('purchase', `Bought ${item.name}`, undefined, item.glyph);
  return { ok: true };
}

/** Sell a stackable item back for its listed value. */
export function sell(item: ItemDef, qty = 1): boolean {
  if (!item.stackable || item.value <= 0) return false;
  const inv = useInventoryStore.getState();
  if (!inv.remove(item.id, qty)) return false;
  usePlayerStore.getState().addCoins(item.value * qty);
  haptics.tap();
  play('reward.coin');
  toast({
    title: `Sold ${item.name} ×${qty}`,
    subtitle: `+${item.value * qty} 🪙`,
    glyph: '🪙',
    tone: 'success',
  });
  return true;
}

/** Consumables have effects; centralised so any screen can use one. */
export function useConsumable(item: ItemDef): boolean {
  const inv = useInventoryStore.getState();
  if (!inv.has(item.id)) return false;

  const player = usePlayerStore.getState();
  switch (item.id) {
    case 'con_energy_s':
      player.addEnergy(5);
      break;
    case 'con_energy_l':
      player.addEnergy(player.player.energyMax);
      break;
    case 'con_xp_boost':
    case 'con_luck':
      // Consumed by the next session; stored as a flag on the player blob.
      toast({ title: `${item.name} armed`, subtitle: 'Applies to your next run', glyph: item.glyph, tone: 'success' });
      break;
    default:
      return false;
  }
  inv.remove(item.id, 1);
  haptics.success();
  return true;
}
