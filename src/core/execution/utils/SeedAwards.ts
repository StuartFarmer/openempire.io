import { Game, Player } from "../../game/Game";

/**
 * Seed awards (openspec rework-settlement-ecology, design.md §1): plots are
 * AWARDED, never purchased — one ladder, paired awards. The nth crossing of
 * the peak-population ladder settlementLadderBasePop · n^scalingExponent
 * banks a FOUNDING PAIR: one Settlement seed AND one farm seed. A new town
 * needs a field in food-shed reach and a lone field feeds nobody — the pair
 * is the unit of founding. k = scalingExponent is the MEASURED
 * area↔perimeter exponent (design.md §6, ~1.26 — ragged real borders, not
 * the circle's 2), so each founding costs a constant increment of frontier
 * effort, not of population.
 *
 * The ratchet never re-awards: losing people never revokes a seed, and
 * regrowing below the high-water mark awards nothing. Territory awards
 * NOTHING here — under field growth (§1b) conquest buys ROOM for the
 * automata to spread into. Banked seeds are spent by placement
 * (PlayerImpl.buildUnit) and gated in canBuild.
 */

/** Peak population needed for the nth founding pair (1-based). The ladder
 *  exponent is k · ladderTaper: at taper 1 each pair costs a constant
 *  increment of frontier effort; the adopted taper (>1) thins awards out
 *  with size — a big nation captures plots by conquest instead of founding
 *  them (playtest 2026-07-15). */
export function settlementThreshold(mg: Game, n: number): number {
  const f = mg.config().food();
  return Math.round(
    f.settlementLadderBasePop *
      Math.pow(n, f.scalingExponent * f.settlementLadderTaper),
  );
}

/**
 * Ratchet the player's population high-water mark and bank any newly
 * crossed founding pairs. Call once per player per tick, after foodTick has
 * refreshed population.
 */
export function seedAwardTick(mg: Game, player: Player): void {
  const impl = player as Player & {
    _peakPopulation: number;
    _settlementsAwarded: number;
    _farmSeeds: number;
    _settlementSeeds: number;
  };

  impl._peakPopulation = Math.max(
    impl._peakPopulation,
    player.foodFlow().population,
  );
  while (
    impl._peakPopulation >=
    settlementThreshold(mg, impl._settlementsAwarded + 1)
  ) {
    impl._settlementsAwarded++;
    impl._settlementSeeds++;
    impl._farmSeeds++; // the founding PAIR: town and field together
  }
}
