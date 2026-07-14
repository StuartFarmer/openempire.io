import { FoodConfig } from "../../configuration/Config";
import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { climateSuitability } from "./FarmGrowth";
import { PlayerSupply } from "./SupplyField";
import { urbanSuitability } from "./UrbanGrowth";

/**
 * The economy model (openspec add-greedy-economy-planner): pure marginal-value
 * math for the bot economy, derived at call time from Config.food() and the
 * map layers — so re-tuning a knob re-tunes every bot with no code changes.
 *
 * One common currency: POPULATION-TICKS over a horizon derived from the farm
 * ramp. The sim's chain is closed-form — production / idleConsumptionMilli is
 * the population births approach (FoodEconomy), population / popPerDensity is
 * the city footprint (UrbanGrowth) — so people-fed and food-cost convert
 * exactly, and farm vs settlement vs barn vs build-nothing are comparable.
 *
 * The model reuses the sim's own functions (climateSuitability, the supply
 * field, urbanSuitability) rather than re-deriving them, so it can never
 * disagree with the simulation it predicts.
 */

/**
 * A farm's Gompertz asymptote is its climate suitability, but the closed-form
 * time-to-maturity diverges as the target nears 1 (ln 1 = 0) — treat a farm as
 * "ripe" at this fraction of full maturity for ramp purposes.
 */
const MATURITY_RIPE = 0.95;

/**
 * The one policy constant (design D4): a Barn is insurance, wanted only when
 * the banked share is actually accruing — stock at this fraction of the cap.
 */
export const STOCK_ACCRUAL_FRACTION = 0.75;

/**
 * Sentinel score for the barn insurance action: strictly positive so it beats
 * "build nothing", strictly below any positive growth score (insurance never
 * outranks growth — design D4).
 */
export const BARN_INSURANCE_SCORE = Number.MIN_VALUE;

/**
 * Planning horizon in ticks: twice the SLOWEST possible farm ramp (a
 * perfect-suitability tile ripening to MATURITY_RIPE), from the same closed
 * form as farmRampTicks (design D1). Long enough that every farm spends at
 * least half the horizon mature — so steady yield dominates ramp time — and
 * short enough that producing sooner still beats producing marginally more
 * later. Derived, not tuned: ~100 ticks at default knobs.
 */
export function planningHorizonTicks(f: FoodConfig): number {
  return Math.round(2 * farmRampTicks(f, 1));
}

/** Milli-food → population-ticks: one person eats idleConsumptionMilli/tick. */
export function milliFoodToPopTicks(f: FoodConfig, milli: number): number {
  return milli / f.idleConsumptionMilli;
}

/**
 * Ticks for a fresh farm to ripen, in closed form. The sim advances maturity
 * by farmGrowthRate · M·ln(1/M) per tick (FarmGrowth), the discretization of
 * the Gompertz ODE whose exact solution is M(t) = exp(ln(m₀)·e^(−rt)); solving
 * for the time to reach the target maturity gives
 * t = ln( ln(m₀) / ln(target) ) / r — no tick simulation needed.
 */
export function farmRampTicks(f: FoodConfig, suitability: number): number {
  const m0 = f.farmSeedMilli / 1000;
  const target = Math.min(suitability, MATURITY_RIPE);
  if (target <= m0) return 0;
  return Math.log(Math.log(m0) / Math.log(target)) / f.farmGrowthRate;
}

/** Same-type completed plots owned by `player` on the 4 edge-adjacent tiles. */
export function neighborPlotCount(
  mg: Game,
  player: Player,
  tile: TileRef,
  type: UnitType,
): number {
  const x = mg.x(tile);
  const y = mg.y(tile);
  let count = 0;
  for (const [ex, ey] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]) {
    if (!mg.isValidCoord(ex, ey)) continue;
    const plot = mg.plotAt(mg.ref(ex, ey));
    if (plot !== undefined && plot.type() === type && plot.owner() === player) {
      count++;
    }
  }
  return count;
}

/**
 * Steady-state yield of a Farmland at `tile`, in milli-food/tick: maturity
 * converges to climate suitability (Gompertz up / senescence down, both capped
 * there), so long-run yield is exactly the sim's harvest formula
 * (FoodEconomy.ts) evaluated at M = suitability.
 */
export function farmSteadyYieldMilli(
  mg: Game,
  player: Player,
  tile: TileRef,
): number {
  const f = mg.config().food();
  const suit = climateSuitability(mg, tile);
  const cropN = mg.layer("crop", tile) / 255;
  const district =
    1 +
    neighborPlotCount(mg, player, tile, UnitType.Farmland) * f.adjacencyBonus;
  return suit * cropN * district * f.farmYieldMilli;
}

/**
 * Score of building a Farmland at `tile` (population-ticks, design D2): the
 * people its steady yield feeds, over the horizon left after its ramp, minus
 * its food cost at the same conversion. Negative on soil/climate that can't
 * repay the cost — the derived replacement for a fixed fertility floor.
 */
export function farmScore(
  mg: Game,
  player: Player,
  tile: TileRef,
  costMilli: number,
): number {
  const f = mg.config().food();
  const yieldMilli = farmSteadyYieldMilli(mg, player, tile);
  const dPop = yieldMilli / f.idleConsumptionMilli;
  const suit = climateSuitability(mg, tile);
  const useful = Math.max(0, planningHorizonTicks(f) - farmRampTicks(f, suit));
  return dPop * useful - milliFoodToPopTicks(f, costMilli);
}

export interface UrbanRoom {
  /** Where the city is headed: food-supported people / popPerDensity. */
  targetTiles: number;
  /** Owned, urban-suitable, placeable tiles inside the current supply field. */
  roomTiles: number;
  /** max(0, target − room): tiles the city wants but cannot place. */
  deficit: number;
}

/**
 * Whether the city is (heading toward being) frontier-starved (design D3).
 * Population is never room-bound — births clamp to food capacity only — but
 * LAND is: city tiles are placed only inside the supply field. Room is counted
 * with the same eligibility the placement loop uses (owned, passable,
 * non-farm, not yet city, positive suitability); congestion is evaluated at
 * zero local density since we count room, not this tick's frontier.
 */
export function assessUrbanRoom(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
): UrbanRoom {
  const f = mg.config().food();
  const map = mg.map();
  const smallID = player.smallID();
  const targetTiles = Math.floor(player.foodFlow().capacity / f.popPerDensity);

  let roomTiles = 0;
  for (const [tile] of supply.dist) {
    if (map.ownerID(tile) !== smallID) continue;
    if (!map.isLand(tile) || map.isImpassable(tile)) continue;
    if (player.density(tile) >= f.popPerDensity) continue;
    if (mg.plotAt(tile)?.type() === UnitType.Farmland) continue;
    if (urbanSuitability(mg, player, supply, tile, 0) <= 0) continue;
    roomTiles++;
  }
  return {
    targetTiles,
    roomTiles,
    deficit: Math.max(0, targetTiles - roomTiles),
  };
}

/**
 * Score of founding a Settlement at `site` (population-ticks, design D3): the
 * new urban room it brings into supply reach — owned, suitable land within
 * supplyRadius of the site that the current field does not cover — capped at
 * the room deficit, valued at the people those tiles house over the horizon.
 * A radial estimate of the BFS field the sim will actually build; it only
 * orders candidates — the TRIGGER (deficit > 0) uses the real field.
 */
export function settlementScore(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
  site: TileRef,
  roomDeficit: number,
  costMilli: number,
): number {
  if (roomDeficit <= 0) return 0;
  const f = mg.config().food();
  const map = mg.map();
  const smallID = player.smallID();
  const R = Math.ceil(f.supplyRadius);
  const sx = mg.x(site);
  const sy = mg.y(site);

  let newRoom = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > R) continue; // walk distance, not box
      if (!mg.isValidCoord(sx + dx, sy + dy)) continue;
      const tile = mg.ref(sx + dx, sy + dy);
      if (supply.dist.has(tile)) continue; // already in supply reach
      if (map.ownerID(tile) !== smallID) continue;
      if (!map.isLand(tile) || map.isImpassable(tile)) continue;
      if (player.density(tile) >= f.popPerDensity) continue;
      if (mg.plotAt(tile)?.type() === UnitType.Farmland) continue;
      newRoom++;
    }
  }
  const housed = Math.min(roomDeficit, newRoom) * f.popPerDensity;
  return housed * planningHorizonTicks(f) - milliFoodToPopTicks(f, costMilli);
}

/**
 * Whether a Barn is wanted as insurance (design D4): storage should cover one
 * generation (avgLifespanTicks) of full population consumption — the window
 * within which starvation would otherwise hollow the nation — and the banked
 * share must actually be accruing (stock near the cap), else more cap is dead
 * weight. Insurance is scored BARN_INSURANCE_SCORE: above nothing, below any
 * positive growth action.
 */
export function wantsBarnInsurance(mg: Game, player: Player): boolean {
  const f = mg.config().food();
  let barnLevels = 0;
  for (const barn of player.units(UnitType.Barn)) {
    if (barn.isUnderConstruction()) continue;
    barnLevels += barn.level();
  }
  const cap = f.baseStorage + barnLevels * f.storagePerBarn; // display units
  const pop = player.foodFlow().population;
  const bufferTarget =
    (pop * f.idleConsumptionMilli * f.avgLifespanTicks) / 1000;
  if (cap >= bufferTarget) return false;
  const stock = Number(player.food());
  return stock >= STOCK_ACCRUAL_FRACTION * cap;
}
