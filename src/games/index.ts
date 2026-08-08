import { registerGames } from '@/core/registry';
import { invalidateCatalog } from '@/content/catalog';

import { petModule } from './pet';
import { runnerModule } from './runner';
import { drivingModule } from './driving';
import { puzzleModule } from './puzzle';
import { zombieModule } from './zombie';
import { farmModule } from './farm';
import { fishingModule } from './fishing';
import { platformerModule } from './platformer';
import { rhythmModule } from './rhythm';
import { arcadeModule } from './arcade';
import { penfightModule } from './penfight';
import { airHockeyModule } from './airhockey';
import { sumoModule } from './sumo';
import { tankDuelModule } from './tankduel';
import { colorClashModule } from './colorclash';
import { dodgeDuelModule } from './dodgeduel';

/**
 * ============================================================================
 *  THE ONLY FILE THAT CHANGES WHEN A GAME IS ADDED
 * ============================================================================
 *
 * Import the module, add it to the array. Everything downstream — the arcade
 * grid, the quest pool, the achievement list, the item catalog, offline
 * simulation, save hydration, the router — discovers it from the registry.
 */
export const GAME_MODULES = [
  petModule,
  runnerModule,
  drivingModule,
  puzzleModule,
  zombieModule,
  farmModule,
  fishingModule,
  platformerModule,
  rhythmModule,
  arcadeModule,
  penfightModule,

  // 2 PLAYER — local, same device
  airHockeyModule,
  sumoModule,
  tankDuelModule,
  colorClashModule,
  dodgeDuelModule,
];

let registered = false;

export function installGames() {
  if (registered) return;
  registered = true;
  registerGames(GAME_MODULES);
  invalidateCatalog();
}
