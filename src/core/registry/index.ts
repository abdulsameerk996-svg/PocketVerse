import type { GameId } from '../types';
import type { GameModule } from './types';

export * from './types';

/**
 * The module registry.
 *
 * Populated once at boot by `src/games/index.ts`. Everything else in the app
 * (arcade grid, quest engine, item catalog, achievement list, offline sim)
 * iterates this registry rather than importing games directly — which is why
 * no hub code has to change when a game is added or removed.
 */

const modules = new Map<GameId, GameModule>();

export function registerGames(list: GameModule[]) {
  for (const m of list) {
    if (modules.has(m.id) && __DEV__) {
      console.warn(`[registry] duplicate game module "${m.id}" — overwriting`);
    }
    modules.set(m.id, m);
  }
}

export function getGame(id: GameId | string): GameModule | undefined {
  return modules.get(id as GameId);
}

export function allGames(): GameModule[] {
  return [...modules.values()].sort((a, b) => a.meta.order - b.meta.order);
}

export function gameIds(): GameId[] {
  return allGames().map((g) => g.id);
}

export function isUnlocked(id: GameId, level: number): boolean {
  const g = modules.get(id);
  return !!g && level >= g.meta.minLevel;
}
