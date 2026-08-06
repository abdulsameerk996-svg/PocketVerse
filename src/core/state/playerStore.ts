import { create } from 'zustand';
import type { AvatarConfig, CosmeticSlot, PlayerState, RoomState } from '../types';
import { metaRepo } from '../db/repositories';
import { markDirty, registerChannel } from '../save/saveService';
import {
  applyXp,
  energyMaxForLevel,
  regenEnergy,
  BASE_ENERGY_MAX,
} from '../economy/progression';
import { palette } from '@/ui/theme/tokens';
import { dayKey } from '../utils/time';

const CHANNEL = 'player';

export const DEFAULT_AVATAR: AvatarConfig = {
  photoUri: null,
  bodyColor: palette.violet,
  skinTone: '#E8B48B',
  faceId: 'face_calm',
  equipped: {
    hat: 'hat_none',
    shirt: 'shirt_basic',
    shoes: 'shoes_basic',
    aura: 'aura_none',
    background: 'bg_night',
    pet: 'pet_blob',
    trail: 'trail_none',
  },
};

export const DEFAULT_ROOM: RoomState = {
  wallpaperId: 'bg_night',
  floorId: 'floor_default',
  placements: [],
};

function newPlayer(): PlayerState {
  const now = Date.now();
  return {
    name: 'Player',
    level: 1,
    xp: 0,
    coins: 500,
    gems: 10,
    energy: BASE_ENERGY_MAX,
    energyMax: BASE_ENERGY_MAX,
    energyUpdatedAt: now,
    createdAt: now,
    lastSeenAt: now,
    avatar: DEFAULT_AVATAR,
    streak: 0,
    lastClaimDay: null,
  };
}

type PlayerStore = {
  player: PlayerState;
  room: RoomState;
  hydrated: boolean;
  /** Elapsed ms since the previous session — consumed once by offline sim. */
  offlineElapsedMs: number;

  hydrate: () => Promise<void>;
  persist: () => Promise<void>;

  addCoins: (n: number) => void;
  addGems: (n: number) => void;
  spendCoins: (n: number) => boolean;
  spendGems: (n: number) => boolean;

  /** Returns levels gained. */
  addXp: (n: number) => number;

  tickEnergy: (regenMultiplier?: number) => void;
  spendEnergy: (n: number) => boolean;
  addEnergy: (n: number) => void;

  setName: (name: string) => void;
  setAvatar: (patch: Partial<AvatarConfig>) => void;
  equip: (slot: CosmeticSlot, itemId: string) => void;
  setRoom: (patch: Partial<RoomState>) => void;

  registerLogin: () => { newDay: boolean; streak: number };
  reset: () => void;
};

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  player: newPlayer(),
  room: DEFAULT_ROOM,
  hydrated: false,
  offlineElapsedMs: 0,

  hydrate: async () => {
    const [saved, room] = await Promise.all([metaRepo.getPlayer(), metaRepo.getRoom()]);
    const now = Date.now();
    if (saved) {
      const elapsed = Math.max(0, now - (saved.lastSeenAt ?? now));
      // Merge defensively so a save from an older build never crashes the app.
      const player: PlayerState = {
        ...newPlayer(),
        ...saved,
        avatar: { ...DEFAULT_AVATAR, ...saved.avatar, equipped: { ...DEFAULT_AVATAR.equipped, ...saved.avatar?.equipped } },
        energyMax: energyMaxForLevel(saved.level ?? 1),
        lastSeenAt: now,
      };
      const tick = regenEnergy(player.energy, player.energyMax, player.energyUpdatedAt, now);
      set({
        player: { ...player, ...tick },
        room: room ?? DEFAULT_ROOM,
        hydrated: true,
        offlineElapsedMs: elapsed,
      });
    } else {
      set({ player: newPlayer(), room: DEFAULT_ROOM, hydrated: true, offlineElapsedMs: 0 });
      markDirty(CHANNEL);
    }
  },

  persist: async () => {
    const { player, room } = get();
    await Promise.all([
      metaRepo.savePlayer({ ...player, lastSeenAt: Date.now() }),
      metaRepo.saveRoom(room),
    ]);
  },

  addCoins: (n) => {
    if (!n) return;
    set((s) => ({ player: { ...s.player, coins: Math.max(0, s.player.coins + n) } }));
    markDirty(CHANNEL);
  },

  addGems: (n) => {
    if (!n) return;
    set((s) => ({ player: { ...s.player, gems: Math.max(0, s.player.gems + n) } }));
    markDirty(CHANNEL);
  },

  spendCoins: (n) => {
    if (n <= 0) return true;
    if (get().player.coins < n) return false;
    set((s) => ({ player: { ...s.player, coins: s.player.coins - n } }));
    markDirty(CHANNEL);
    return true;
  },

  spendGems: (n) => {
    if (n <= 0) return true;
    if (get().player.gems < n) return false;
    set((s) => ({ player: { ...s.player, gems: s.player.gems - n } }));
    markDirty(CHANNEL);
    return true;
  },

  addXp: (n) => {
    if (n <= 0) return 0;
    const p = get().player;
    const res = applyXp(p.level, p.xp, n);
    set({
      player: {
        ...p,
        level: res.level,
        xp: res.xp,
        energyMax: res.newEnergyMax,
        // Level-ups top the bar off — a classic, and it feels great.
        energy: res.levelsGained > 0 ? res.newEnergyMax : p.energy,
        coins: p.coins + (res.bonus.coins ?? 0),
        gems: p.gems + (res.bonus.gems ?? 0),
      },
    });
    markDirty(CHANNEL);
    return res.levelsGained;
  },

  tickEnergy: (regenMultiplier = 1) => {
    const p = get().player;
    const tick = regenEnergy(p.energy, p.energyMax, p.energyUpdatedAt, Date.now(), regenMultiplier);
    if (tick.energy === p.energy && tick.energyUpdatedAt === p.energyUpdatedAt) return;
    set({ player: { ...p, ...tick } });
    markDirty(CHANNEL);
  },

  spendEnergy: (n) => {
    if (n <= 0) return true;
    const p = get().player;
    if (p.energy < n) return false;
    set({
      player: {
        ...p,
        energy: p.energy - n,
        // Starting the regen clock the moment the bar leaves full.
        energyUpdatedAt: p.energy >= p.energyMax ? Date.now() : p.energyUpdatedAt,
      },
    });
    markDirty(CHANNEL);
    return true;
  },

  addEnergy: (n) => {
    if (n <= 0) return;
    set((s) => ({
      player: { ...s.player, energy: Math.min(s.player.energyMax, s.player.energy + n) },
    }));
    markDirty(CHANNEL);
  },

  setName: (name) => {
    set((s) => ({ player: { ...s.player, name: name.slice(0, 18) || 'Player' } }));
    markDirty(CHANNEL);
  },

  setAvatar: (patch) => {
    set((s) => ({ player: { ...s.player, avatar: { ...s.player.avatar, ...patch } } }));
    markDirty(CHANNEL);
  },

  equip: (slot, itemId) => {
    set((s) => ({
      player: {
        ...s.player,
        avatar: { ...s.player.avatar, equipped: { ...s.player.avatar.equipped, [slot]: itemId } },
      },
    }));
    markDirty(CHANNEL);
  },

  setRoom: (patch) => {
    set((s) => ({ room: { ...s.room, ...patch } }));
    markDirty(CHANNEL);
  },

  registerLogin: () => {
    const p = get().player;
    const today = dayKey();
    if (p.lastClaimDay === today) return { newDay: false, streak: p.streak };
    return { newDay: true, streak: p.streak };
  },

  reset: () => {
    set({ player: newPlayer(), room: DEFAULT_ROOM, offlineElapsedMs: 0 });
    markDirty(CHANNEL);
  },
}));

registerChannel(CHANNEL, () => usePlayerStore.getState().persist());

/* ------------------------------------------------------------ selectors */

export const selectPlayer = (s: PlayerStore) => s.player;
export const selectLevel = (s: PlayerStore) => s.player.level;
export const selectCoins = (s: PlayerStore) => s.player.coins;
export const selectGems = (s: PlayerStore) => s.player.gems;
export const selectEnergy = (s: PlayerStore) => s.player.energy;
export const selectAvatar = (s: PlayerStore) => s.player.avatar;
