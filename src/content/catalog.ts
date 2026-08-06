import type { AchievementDef, CosmeticSlot, ItemDef, QuestDef } from '@/core/types';
import { allGames } from '@/core/registry';
import { CORE_ITEMS } from './items';
import { CORE_QUESTS } from './quests';
import { CORE_ACHIEVEMENTS } from './achievements';

/**
 * The merged world catalog.
 *
 * Core content + everything contributed by registered game modules. Built lazily
 * on first access (after `registerGames` has run) and memoised. A new module's
 * items/quests/achievements appear automatically in inventory, store, quests and
 * achievement screens with zero edits here.
 */

type Catalog = {
  items: Map<string, ItemDef>;
  itemList: ItemDef[];
  quests: Map<string, QuestDef>;
  questList: QuestDef[];
  achievements: Map<string, AchievementDef>;
  achievementList: AchievementDef[];
};

let cache: Catalog | null = null;

function build(): Catalog {
  const items = new Map<string, ItemDef>();
  const quests = new Map<string, QuestDef>();
  const achievements = new Map<string, AchievementDef>();

  for (const it of CORE_ITEMS) items.set(it.id, it);
  for (const q of CORE_QUESTS) quests.set(q.id, q);
  for (const a of CORE_ACHIEVEMENTS) achievements.set(a.id, a);

  for (const mod of allGames()) {
    for (const it of mod.items ?? []) items.set(it.id, { source: mod.id, ...it });
    for (const q of mod.quests ?? []) quests.set(q.id, { game: mod.id, ...q });
    for (const a of mod.achievements ?? []) achievements.set(a.id, { game: mod.id, ...a });
  }

  return {
    items,
    itemList: [...items.values()],
    quests,
    questList: [...quests.values()],
    achievements,
    achievementList: [...achievements.values()],
  };
}

export function catalog(): Catalog {
  if (!cache) cache = build();
  return cache;
}

/** Called after registry changes (only in dev/hot-reload). */
export function invalidateCatalog() {
  cache = null;
}

/* ------------------------------------------------------------ accessors */

const UNKNOWN: ItemDef = {
  id: '__unknown',
  name: 'Unknown',
  kind: 'material',
  rarity: 'common',
  glyph: '❔',
  description: 'Missing catalog entry.',
  value: 0,
  stackable: true,
};

export function getItem(id: string): ItemDef {
  return catalog().items.get(id) ?? { ...UNKNOWN, id };
}

export function tryGetItem(id: string): ItemDef | undefined {
  return catalog().items.get(id);
}

export function getQuest(id: string): QuestDef | undefined {
  return catalog().quests.get(id);
}

export function getAchievement(id: string): AchievementDef | undefined {
  return catalog().achievements.get(id);
}

export function itemsBySlot(slot: CosmeticSlot): ItemDef[] {
  return catalog()
    .itemList.filter((i) => i.slot === slot)
    .sort((a, b) => (a.price?.amount ?? 0) - (b.price?.amount ?? 0));
}

export function storeItems(): ItemDef[] {
  return catalog()
    .itemList.filter((i) => !!i.price)
    .sort((a, b) => (a.price!.amount ?? 0) - (b.price!.amount ?? 0));
}

export function questsByScope(scope: QuestDef['scope']): QuestDef[] {
  return catalog().questList.filter((q) => q.scope === scope);
}
