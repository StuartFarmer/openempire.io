import { Game, Player } from "../../game/Game";

/**
 * Seed awards (openspec rework-settlement-ecology, design.md §1): plots are
 * AWARDED, never purchased. Two ratcheted ledgers per player:
 *
 *   - FARM seeds from PEAK TERRITORY: one per farmSeedTilesPerSeed tiles at
 *     the tiles-ever-held high-water mark. Land earns food potential.
 *   - SETTLEMENT seeds from PEAK POPULATION on the power-law ladder: the nth
 *     settlement triggers at settlementLadderBasePop · n^scalingExponent,
 *     where k = scalingExponent is the MEASURED area↔perimeter exponent
 *     (design.md §6, ~1.26 — ragged real borders, not the circle's 2). Each
 *     settlement costs a constant increment of frontier effort, not of
 *     population — the geometric snowball taxed back to linear.
 *
 * Ratchets never re-award: losing land or people never revokes a seed, and
 * reconquering below the high-water mark awards nothing. Banked seeds are
 * spent by placement (PlayerImpl.buildUnit) and gated in canBuild.
 */

/** Peak population needed for the nth settlement (1-based). */
export function settlementThreshold(mg: Game, n: number): number {
  const f = mg.config().food();
  return Math.round(f.settlementLadderBasePop * Math.pow(n, f.scalingExponent));
}

/**
 * Ratchet the player's high-water marks and bank any newly crossed awards.
 * Call once per player per tick, after foodTick has refreshed population.
 */
export function seedAwardTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  const impl = player as Player & {
    _peakTerritory: number;
    _peakPopulation: number;
    _farmSeedsAwarded: number;
    _settlementsAwarded: number;
    _farmSeeds: number;
    _settlementSeeds: number;
  };

  // Farm seeds ∝ peak territory (linear).
  impl._peakTerritory = Math.max(impl._peakTerritory, player.numTilesOwned());
  const farmTotal = Math.floor(impl._peakTerritory / f.farmSeedTilesPerSeed);
  if (farmTotal > impl._farmSeedsAwarded) {
    impl._farmSeeds += farmTotal - impl._farmSeedsAwarded;
    impl._farmSeedsAwarded = farmTotal;
  }

  // Settlement seeds from peak population, up the n^k ladder.
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
  }
}
