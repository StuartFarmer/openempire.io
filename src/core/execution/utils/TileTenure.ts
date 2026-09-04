import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { climateSuitability } from "./FarmGrowth";

/**
 * Tile stability (openspec rework-settlement-ecology, design.md §2): a
 * DEMAND-GATED tenure clock. One clock, many consumers:
 *
 *   - A city tile ages only while the city is pushing its housing limit
 *     (population ≥ tenureSaturationRatio × total housing) — growth is pulled
 *     by pressure, not granted by time. A half-empty city doesn't age.
 *   - A Farmland tile ages only once its maturity has settled at the tile's
 *     climate ceiling (the farm is doing all this ground allows).
 *   - Combat damage pauses the clock; ownership flips hard-reset it and
 *     vacancy decays it slowly (both in GameImpl — the ledger lives there).
 *
 * Consumers read tenure through the saturating curve g = tn/(tn + half):
 * steep early, plateau late, so age never compounds without bound. Current
 * consumers: per-tile housing (tenureCapacityBonus → maxTroops and the
 * footprint target) and nucleus growth pacing (old capitals have gravity).
 */

/**
 * Density render byte for an EMPTY URBAN LOT (rework-persistent-tiles-and-burn):
 * a tile that has been vacated by recession/conquest but keeps its Urban zone.
 * Reserved value 1 — density is binary (a full tile renders ≥ 140, wild is 0),
 * so 1 unambiguously means "developed ground, no house, regrows in place." The
 * plot shaders read this to draw a cleared lot instead of wild terrain.
 */
export const EMPTY_URBAN_LOT_BYTE = 1;

/** Saturating tenure curve g ∈ [0,1): 0 at raw land, ½ at tenureHalfTicks. */
export function tenureCurve(mg: Game, tenureMilli: number): number {
  const halfMilli = mg.config().food().tenureHalfTicks * 1000;
  if (tenureMilli <= 0) return 0;
  return tenureMilli / (tenureMilli + halfMilli);
}

/** Housing multiplier of a city tile: 1 (young) → tenureCapMultMax (old). */
export function tenureCapMult(mg: Game, tenureMilli: number): number {
  const f = mg.config().food();
  return 1 + (f.tenureCapMultMax - 1) * tenureCurve(mg, tenureMilli);
}

/**
 * Render byte for a city tile: fill fraction shaded by age, so young suburbs
 * draw dim and old cores bright (task 2.4 — stability must be visible).
 * Single source of truth for both setDensity and the aging tick.
 */
export function urbanRenderByte(
  people: number,
  full: number,
  g: number,
): number {
  return Math.round((people / full) * 255 * (0.55 + 0.45 * g));
}

/**
 * Advance the player's tenure clocks one tick (call from urbanTick, after
 * foodTick has set foodFlow().population). Also maintains the player's
 * tenure housing bonus (Σ over city tiles of (capMult−1)·popPerDensity) and
 * emits density render deltas as tiles visibly age.
 */
export function tenureTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  const full = f.popPerDensity;

  // The demand gate: is the population pressing against its housing?
  const housing =
    f.basePopulation +
    Math.round(player.urbanArea()) * full +
    player.tenureCapacityBonus();
  const saturated =
    player.foodFlow().population >= housing * f.tenureSaturationRatio;

  let bonus = 0;
  for (const [tile, people] of player.densityEntries()) {
    if (people < full) continue; // only full city tiles hold the clock
    let tn = mg.tileTenure(tile);
    if (saturated && mg.tileDamage(tile) === 0) {
      const prevByte = urbanRenderByte(people, full, tenureCurve(mg, tn));
      tn += 1000; // one tick of tenure, in milli
      mg.setTileTenure(tile, tn);
      const byte = urbanRenderByte(people, full, tenureCurve(mg, tn));
      if (byte !== prevByte) mg.recordDensityUpdate(tile, byte);
    }
    bonus += Math.floor((tenureCapMult(mg, tn) - 1) * full);
  }
  setTenureCapacityBonus(player, bonus);

  // Farms age once settled at their climate ceiling (and healed): tenure
  // will feed local storage capacity (task 4).
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const tile = farm.tile();
    if (mg.tileDamage(tile) > 0) continue;
    const m = player.farmMaturity(tile);
    if (m <= 0) continue;
    const suitMilli = Math.round(climateSuitability(mg, tile) * 1000);
    if (suitMilli > 0 && m >= suitMilli) {
      mg.setTileTenure(tile, mg.tileTenure(tile) + 1000);
    }
  }
}

function setTenureCapacityBonus(player: Player, bonus: number): void {
  (player as Player & { _tenureCapacityBonus: number })._tenureCapacityBonus =
    bonus;
}

/** Growth-pace multiplier from the nucleus (Core) tile's tenure. */
export function nucleusPaceBoost(mg: Game, nucleus: TileRef | null): number {
  if (nucleus === null) return 1;
  const f = mg.config().food();
  return 1 + f.wNucleusTenure * tenureCurve(mg, mg.tileTenure(nucleus));
}
