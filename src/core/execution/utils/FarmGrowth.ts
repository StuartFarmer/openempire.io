import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { simpleHash } from "../../Util";
import { isFallow, PlayerFoodShed } from "./FoodShed";

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

/** Water access in [0, 1+wShore] — groundwater plane plus river/coast edge.
 *  Boosts the SPREAD RATE only (fields race along rivers); the establishment
 *  ceiling stays the Liebig suitability. */
export function waterAccess(mg: Game, tile: TileRef): number {
  const f = mg.config().food();
  const map = mg.map();
  const waterN = mg.layer("water", tile) / 255;
  const shore = map.isShoreline(tile) || map.isOceanShore(tile) ? 1 : 0;
  return waterN + f.wShore * shore;
}

/** Per-player plot-growth credit, keyed by nucleus tile. Process-local like
 *  the shed/supply caches (rebuilt empty on reload — pacing state, not truth). */
const patchCredits = new WeakMap<Player, Map<TileRef, number>>();

/**
 * Advance the player's FIELDS one tick (call once per player per tick from
 * the food tick) — the farm CA (rework-settlement-ecology §1b). Two phases
 * over the maturity plane, both reading start-of-tick state:
 *
 *   RIPEN — nuclei and CLAIMED tiles (m ≥ fieldClaimMilli) climb the
 *   Gompertz curve toward their climate suitability, or senesce down to it,
 *   exactly as single plots always have. FALLOW tiles (ranked by the shed's
 *   last refresh but left unstaffed — the labor coverage gate) instead
 *   senesce, dying OUTRIGHT below the claim threshold: lose your farmers
 *   and the field dies back plot by plot. Tiles claimed since the last
 *   refresh are in grace (they ripen; the next refresh judges them).
 *
 *   PLOTS (playtest rework 2026-07-15) — fields grow one 1×1 tilled plot
 *   at a time (every structure is a single tile; the client paints claimed
 *   tiles with the same tilled-soil pattern as the Farmland plot), never a
 *   diffusing front. Each nucleus accrues credit equal to its field's
 *   summed TILLED maturity per tick (capped at fieldPatchDriveCapMilli — a
 *   riper, larger field readies its next plot sooner, but never
 *   machine-guns them); at fieldPatchCostMilli it places ONE plot on a
 *   seeded weighted-random frontier tile (weight = suitability × water
 *   access), always claim-viable (suitability ≥ the claim threshold —
 *   desert never gets a plot). Placement is LABOR-GATED: only when the
 *   field's residents have spare hands for one more tile — labor caps
 *   field SIZE at the moment of expansion.
 */
export function farmTick(mg: Game, player: Player, shed: PlayerFoodShed): void {
  const f = mg.config().food();
  const claim = f.fieldClaimMilli;

  // A freshly-built nucleus starts at a small seed so the Gompertz slope
  // M·ln(1/M) is non-zero and the field can begin ripening.
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    if (player.farmMaturity(farm.tile()) <= 0) {
      player.setFarmMaturity(farm.tile(), f.farmSeedMilli);
    }
  }

  // Phase 1 — RIPEN. Collect the claimed tiles per shed cell along the way
  // (the patch phase's credit stream and frontier source).
  const fieldTilesByCell = new Map<TileRef, TileRef[]>();
  for (const [tile, mMilli] of player.farmMaturityEntries()) {
    // Battle-worn ground (rework-settlement-ecology): a damaged tile freezes
    // its farm — no ripening, no senescence — until healed.
    if (mg.tileDamage(tile) > 0) continue;
    const claimed = mMilli >= claim;
    if (claimed && isFallow(shed, tile)) {
      // Unstaffed: the tile senesces; under the claim threshold it DIES
      // OUTRIGHT (establishment cleared) — reversion is decisive, not a
      // hover at the boundary.
      const next = mMilli - Math.max(1, f.farmSenesceRate * mMilli);
      player.setFarmMaturity(tile, next < claim ? 0 : next);
      continue;
    }
    if (claimed) {
      const cell = shed.cellOf.get(tile) ?? tile;
      let tiles = fieldTilesByCell.get(cell);
      if (tiles === undefined) {
        tiles = [];
        fieldTilesByCell.set(cell, tiles);
      }
      tiles.push(tile);
    } else if (mg.plotAt(tile)?.type() !== UnitType.Farmland) {
      continue; // sub-claim remnant with no nucleus: inert until it is wild
    }
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

  // Phase 2 — PATCHES: one 2×2 tilled plot at a time, per nucleus.
  let credits = patchCredits.get(player);
  if (credits === undefined) {
    credits = new Map();
    patchCredits.set(player, credits);
  }
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const nucleus = farm.tile();
    // The credit stream: the field's summed TILLED maturity (start-of-tick
    // snapshot from the shed), capped so mature fields pace, not spray.
    let output = 0;
    for (const tile of fieldTilesByCell.get(nucleus) ?? []) {
      if (shed.tilled.has(tile) || !shed.ranked.has(tile)) {
        output += player.farmMaturity(tile);
      }
    }
    output = Math.min(f.fieldPatchDriveCapMilli, output);
    if (output <= 0) continue;
    const credit = (credits.get(nucleus) ?? 0) + output;
    if (credit < f.fieldPatchCostMilli) {
      credits.set(nucleus, credit);
      continue;
    }
    // Labor surplus gate: the field's residents must have spare hands for
    // one more tile, or the plot waits for people (size ← labor).
    const residents = shed.peopleByFarm.get(nucleus) ?? 0;
    const acreage = (fieldTilesByCell.get(nucleus) ?? []).length;
    if (residents < (acreage + 1) * f.farmersPerFieldTile) {
      credits.set(nucleus, f.fieldPatchCostMilli); // ready, waiting for people
      continue;
    }
    const placed = placePatch(
      mg,
      player,
      shed,
      nucleus,
      fieldTilesByCell.get(nucleus) ?? [],
    );
    // No eligible frontier (desert, borders, the city): hold at ready.
    credits.set(
      nucleus,
      placed ? credit - f.fieldPatchCostMilli : f.fieldPatchCostMilli,
    );
  }
  // Sweep credits of dead nuclei.
  for (const cell of Array.from(credits.keys())) {
    if (mg.plotAt(cell)?.type() !== UnitType.Farmland) credits.delete(cell);
  }
}

/**
 * Place ONE 1×1 tilled plot on the field's frontier: candidates are the
 * wild 4-neighbors of the field's tiles (owned, passable, undamaged,
 * unclaimed by either automaton, and claim-viable), picked by seeded
 * weighted random on suitability × water access. The plot pops in at the
 * claim threshold and ripens toward its suitability from there.
 */
function placePatch(
  mg: Game,
  player: Player,
  shed: PlayerFoodShed,
  nucleus: TileRef,
  fieldTiles: TileRef[],
): boolean {
  const f = mg.config().food();
  const claim = f.fieldClaimMilli;
  const map = mg.map();
  const smallID = player.smallID();

  const eligible = (t: TileRef): boolean => {
    if (map.ownerID(t) !== smallID) return false; // borders bound fields
    if (!map.isLand(t) || map.isImpassable(t)) return false;
    if (player.density(t) > 0) return false; // city — first claim holds
    if (mg.plotAt(t) !== undefined) return false;
    if (mg.tileDamage(t) > 0) return false; // scarred ground refuses
    if (player.farmMaturity(t) > 0) return false; // already field ground
    // Ground the shed judged fallow this refresh is off-limits until
    // re-ranked — don't re-plot land the pool just failed to staff.
    if (shed.ranked.has(t)) return false;
    // Claim-viable: a plot whose ground settles below the claim threshold
    // would senesce straight back to wild — never place it.
    return climateSuitability(mg, t) * 1000 >= claim;
  };

  const nbuf: TileRef[] = [0, 0, 0, 0];
  const candidates: TileRef[] = [];
  const weights: number[] = [];
  const seen = new Set<TileRef>();
  for (const ft of fieldTiles) {
    const k = map.neighbors4(ft, nbuf);
    for (let i = 0; i < k; i++) {
      const t = nbuf[i];
      if (seen.has(t)) continue;
      seen.add(t);
      if (!eligible(t)) continue;
      const weight =
        climateSuitability(mg, t) * (1 + f.wFieldWater * waterAccess(mg, t));
      if (weight <= 0) continue;
      candidates.push(t);
      weights.push(weight);
    }
  }
  if (candidates.length === 0) return false;

  const rand = new PseudoRandom(
    simpleHash(`patch:${player.id()}:${mg.ticks()}:${nucleus}`),
  );
  let total = 0;
  for (const w of weights) total += w;
  let r = rand.nextFloat(0, total);
  let pick = candidates.length - 1;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = i;
      break;
    }
  }
  player.setFarmMaturity(candidates[pick], claim);
  return true;
}
