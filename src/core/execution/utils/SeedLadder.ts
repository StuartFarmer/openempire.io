import { FoodConfig } from "../../configuration/FoodConfig";
import { Game, Player } from "../../game/Game";

/**
 * The seed ladder (restore-organic-growth, seed-ladder spec): a geometric
 * peak-population ladder banks founding PAIRS — one Settlement seed + one
 * Farmland seed. Rung n sits at seedLadderBase × seedLadderGrowth^(n−1):
 * "every next town costs double the people." The ratchet never re-awards;
 * the spawn kit is pair zero (placed structures, not banked seeds).
 */

/** The population the (awarded+1)-th pair requires. */
export function nextLadderRung(f: FoodConfig, awarded: number): number {
  return Math.round(f.seedLadderBase * Math.pow(f.seedLadderGrowth, awarded));
}

/** Ratchet the peak and bank newly crossed pairs. Call once per player per
 *  tick, after foodTick has set foodFlow().population. */
export function seedLadderTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  if (f.seedLadderBase <= 0) return; // ladder disabled (inert configs)
  const impl = player as Player & {
    _peakPopulation: number;
    _laddersAwarded: number;
    _farmSeeds: number;
    _settlementSeeds: number;
  };
  const pop = player.foodFlow().population;
  if (pop > impl._peakPopulation) impl._peakPopulation = pop;
  // Growth ≤ 1 would make every rung equal (or lower) — award at most one
  // pair per tick to keep a degenerate config from minting infinite seeds.
  let guard = 0;
  while (
    impl._peakPopulation >= nextLadderRung(f, impl._laddersAwarded) &&
    guard < 8
  ) {
    impl._laddersAwarded++;
    impl._farmSeeds++;
    impl._settlementSeeds++;
    guard++;
  }
}
