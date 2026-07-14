import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";

/**
 * Farm maturation (openspec add-urban-core-growth, growth-model.md Part 1).
 * A Farmland is a seed that ripens IN PLACE, driven by the climate on its tile
 * — the player picks where, the terrain decides how fast. Grounded in:
 *
 *   - GDD (McMaster & Wilhelm 1997): temperature → development RATE. f_temp is
 *     0 below a base temp, ramps to 1 across an optimal band, and falls off in
 *     extreme heat — a band, not a monotone.
 *   - AquaCrop Ks (Raes et al. 2009): water stress is a coefficient in [0,1] —
 *     1 above an upper-moisture threshold, 0 at wilting, linear between. f_water
 *     runs over the water (hydrology) + humidity layers.
 *   - FAO land evaluation: the ground's own suitability class → f_soil = cropN.
 *   - Liebig's Law of the Minimum: the three combine as their MIN (shortest
 *     stave), so one bad factor can't be bought back by surplus in another.
 *   - Gompertz: maturity climbs a sigmoid (slow start, long asymptotic finish),
 *     gated by suitability; a hostile tile SENESCES a farm (maturity decays).
 *
 * All math is a pure function of the integer layer bytes, so it is
 * deterministic across clients (same float ops, same order).
 */

/** GDD temperature-band factor in [0,1] from the normalised temperature. */
function tempFactor(
  tN: number,
  f: {
    tempBaseN: number;
    tempOptLoN: number;
    tempOptHiN: number;
    tempMaxN: number;
  },
): number {
  if (tN <= f.tempBaseN || tN >= f.tempMaxN) return 0;
  if (tN < f.tempOptLoN) {
    return (tN - f.tempBaseN) / (f.tempOptLoN - f.tempBaseN);
  }
  if (tN <= f.tempOptHiN) return 1;
  // Optimal-high → max: heat stress ramps development back down to 0.
  return (f.tempMaxN - tN) / (f.tempMaxN - f.tempOptHiN);
}

/** AquaCrop water-stress coefficient Ks in [0,1] from the moisture signal. */
function waterFactor(
  mN: number,
  f: { waterWiltN: number; waterFullN: number },
): number {
  if (mN <= f.waterWiltN) return 0;
  if (mN >= f.waterFullN) return 1;
  return (mN - f.waterWiltN) / (f.waterFullN - f.waterWiltN);
}

/**
 * Climate suitability of a tile for farming in [0,1] — Liebig's min of the
 * temperature (GDD), water (AquaCrop Ks), and soil (FAO crop-fertility) staves.
 */
export function climateSuitability(mg: Game, tile: TileRef): number {
  const f = mg.config().food();
  const tN = mg.layer("temperature", tile) / 255;
  const humN = mg.layer("humidity", tile) / 255;
  const watN = mg.layer("water", tile) / 255;
  const cropN = mg.layer("crop", tile) / 255;
  const moisture = f.humidityWeight * humN + (1 - f.humidityWeight) * watN;
  return Math.min(
    tempFactor(tN, f),
    waterFactor(moisture, f),
    cropN, // f_soil — the land's own fertility class
  );
}

/** Gompertz growth slope M·ln(1/M), peaking near M = 1/e. Zero at the ends. */
function gompertzSlope(m: number): number {
  if (m <= 0) return 0;
  if (m >= 1) return 0;
  return m * Math.log(1 / m);
}

/**
 * Advance every Farmland's maturity one tick (call once per player per tick
 * from the food tick). A newly-built farm starts at a small seed so the
 * Gompertz slope is non-zero; suitable climate ripens it, hostile climate
 * senesces it back down.
 */
export function farmTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  const seed = f.farmSeedMilli;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const tile = farm.tile();
    // Battle-worn ground (rework-settlement-ecology): a damaged tile freezes
    // its farm — no ripening, no senescence — until it fully heals.
    if (mg.tileDamage(tile) > 0) continue;
    let mMilli = player.farmMaturity(tile);
    if (mMilli <= 0) mMilli = seed; // just planted
    const m = mMilli / 1000;
    const suit = climateSuitability(mg, tile);
    const drive = suit - m;
    // Grow on the Gompertz curve (slow start, long saturation); when the tile
    // can no longer support the current maturity (climate worsened, poor soil),
    // SENESCE on a separate linear decline toward suitability — AquaCrop's
    // canopy-decline coefficient (CDC) is distinct from its growth coefficient,
    // and unlike the Gompertz slope, decline does not stall at full maturity.
    const delta =
      drive >= 0
        ? f.farmGrowthRate * gompertzSlope(m)
        : f.farmSenesceRate * drive; // drive < 0 → negative step
    const next = m + delta;
    // Cap the step at the remaining gap so a farm settles at its suitability.
    const settled = drive >= 0 ? Math.min(next, suit) : Math.max(next, suit);
    player.setFarmMaturity(tile, Math.round(settled * 1000));
  }
}
