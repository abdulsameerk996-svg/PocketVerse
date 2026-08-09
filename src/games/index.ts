import { registerGames } from '@/core/registry';
import { invalidateCatalog } from '@/content/catalog';

import { nexusArenaModule } from './nexusarena';

/**
 * ============================================================================
 *  POCKETVERSE PARTY REBUILD — SINGLE FLAGSHIP
 * ============================================================================
 *
 * Quality > Quantity.
 * After audit, we hard-reset the broken collection of 32 mediocre games.
 * The user-facing list is now SMALL and HIGH QUALITY.
 *
 * ONE FLAGSHIP: PocketVerse: Nexus Arena
 *   - 3D Arena Battle, 3-player FFA (4p architecture), bots, polished
 *
 * Reusable infra preserved:
 * - game host (app/game/[id].tsx)
 * - save system (core/db, state, save)
 * - audio (ui/hooks/useSound)
 * - input (game3d/useDuelInput, TouchSticks, useKeyboard)
 * - 3D renderer (GameCanvas, Stage, FallbackScene, safety, PartyCharacter, PartyCamera)
 * - physics (arena2d)
 * - reward (services/rewards)
 * - navigation (expo-router)
 * - asset utilities (sprites)
 *
 * All other games are deprecated from the visible catalogue.
 * Their folders remain for reference but are not registered.
 * To restore a game, add its module back to GAME_MODULES and ensure it has unique logo.
 */

export const GAME_MODULES = [
  nexusArenaModule,
];

let registered = false;

export function installGames() {
  if (registered) return;
  registered = true;
  registerGames(GAME_MODULES);
  invalidateCatalog();
}
