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
import { frontierModule } from './frontier';
// Phase 7 quick-play collection
import { stackRushModule } from './stackrush';
import { colorSnapModule } from './colorsnap';
import { survive60Module } from './survive60';
import { hookRunModule } from './hookrun';
import { towerDefModule } from './towerdef';
// Phase 8 quick-play collection
import { dodgeRainModule } from './dodgerain';
import { oneTapModule } from './onetap';
import { numMergeModule } from './nummerge';
import { laserSurviveModule } from './lasersurvive';
import { memRushModule } from './memrush';
import { orbitGuardModule } from './orbitguard';

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
  // FLAGSHIP — the big game
  frontierModule,

  // QUICK PLAY — one-minute, score-chasing runs
  stackRushModule,
  colorSnapModule,
  survive60Module,
  hookRunModule,
  towerDefModule,
  dodgeRainModule,
  oneTapModule,
  numMergeModule,
  laserSurviveModule,
  memRushModule,
  orbitGuardModule,

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
