import { FoodConfig } from "../../configuration/Config";
import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { climateSuitability } from "./FarmGrowth";
import { PlayerFoodShed } from "./FoodShed";
import { PlayerSupply } from "./SupplyField";
import { urbanSuitability } from "./UrbanGrowth";
import { foodRunwayTicks } from "./WarIntel";

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
  return suit * cropN * f.fieldTileYieldMilli;
}

/** Chebyshev radius a nucleus is scored over — roughly the field a young
 *  district grows before labor binds. Scoring only; spread is unbounded. */
const FIELD_SCOUT_RADIUS = 3;

/** Chebyshev radius housed people are counted over when judging a farm
 *  site's labor pool — a scoring approximation of the shed-cell Voronoi
 *  pool (the real pool is re-partitioned at each shed refresh). Scoring
 *  only, like FIELD_SCOUT_RADIUS. */
const LABOR_SCOUT_RADIUS = 6;

/** Chebyshev radius scanned for rival territory when discounting a seed
 *  site (design.md §7 D-DP4). Scoring only. */
const SAFETY_SCOUT_RADIUS = 5;

export interface FieldRoom {
  /** Claim-viable, spreadable tiles in the scout window (site included). */
  tiles: number;
  /** Steady yield of that room fully grown and staffed, milli-food/tick:
   *  Σ suit·cropN · fieldTileYieldMilli — each tile priced by the sim's own
   *  harvest formula at maturity = suitability. */
  yieldMilli: number;
}

/**
 * The field a nucleus at `tile` can grow (rework-settlement-ecology §7
 * D-DP1): yield-weighted spreadable room — owned, wild (unclaimed, unpaved,
 * unbuilt), claim-viable land within FIELD_SCOUT_RADIUS. Gated on the site
 * itself holding a claim at all: maturity settles AT suitability, so a
 * nucleus whose ground can't reach fieldClaimMilli senesces below the
 * threshold and never seeds a field. Zero room on such dead ground — the
 * derived replacement for a fixed fertility floor, still knob-driven.
 */
export function fieldRoomYield(
  mg: Game,
  player: Player,
  tile: TileRef,
): FieldRoom {
  const f = mg.config().food();
  const own = climateSuitability(mg, tile);
  if (own * 1000 < f.fieldClaimMilli) return { tiles: 0, yieldMilli: 0 };
  const map = mg.map();
  const x0 = mg.x(tile);
  const y0 = mg.y(tile);
  let tiles = 0;
  let yieldMilli = 0;
  for (let dy = -FIELD_SCOUT_RADIUS; dy <= FIELD_SCOUT_RADIUS; dy++) {
    for (let dx = -FIELD_SCOUT_RADIUS; dx <= FIELD_SCOUT_RADIUS; dx++) {
      if (!mg.isValidCoord(x0 + dx, y0 + dy)) continue;
      const t = mg.ref(x0 + dx, y0 + dy);
      if (mg.owner(t) !== player) continue;
      if (!map.isLand(t) || map.isImpassable(t)) continue;
      if (player.density(t) > 0) continue; // city ground
      if (player.isFieldTile(t)) continue; // already fielded
      if (mg.plotAt(t) !== undefined) continue;
      const suit = climateSuitability(mg, t);
      if (suit * 1000 < f.fieldClaimMilli) continue; // spread never claims it
      tiles++;
      yieldMilli += suit * (mg.layer("crop", t) / 255) * f.fieldTileYieldMilli;
    }
  }
  return { tiles, yieldMilli };
}

/** Housed people within LABOR_SCOUT_RADIUS of `tile` — the labor a farm
 *  site can draw on today (rural/camp population is deliberately excluded:
 *  a field belongs by a town, and the camp follows the granaries). */
export function residentsNear(mg: Game, player: Player, tile: TileRef): number {
  const x0 = mg.x(tile);
  const y0 = mg.y(tile);
  let people = 0;
  for (let dy = -LABOR_SCOUT_RADIUS; dy <= LABOR_SCOUT_RADIUS; dy++) {
    for (let dx = -LABOR_SCOUT_RADIUS; dx <= LABOR_SCOUT_RADIUS; dx++) {
      if (!mg.isValidCoord(x0 + dx, y0 + dy)) continue;
      people += player.density(mg.ref(x0 + dx, y0 + dy));
    }
  }
  return people;
}

/**
 * Score of planting a farm NUCLEUS at `tile` in population-ticks (design.md
 * §7 D-DP1): the field it can grow, capped by the labor that will till it.
 * `residents / farmersPerFieldTile` is the coverage gate inverted — the
 * tiles that pool can staff — and the capped field is priced at the room's
 * average tile yield. Ramp-discounted with the same Gompertz closed form as
 * every other score, so farm and settlement candidates share one currency.
 */
export function farmDistrictScore(
  mg: Game,
  player: Player,
  tile: TileRef,
  residents: number,
): number {
  const f = mg.config().food();
  const room = fieldRoomYield(mg, player, tile);
  if (room.yieldMilli <= 0) return 0;
  const laborTiles = residents / f.farmersPerFieldTile;
  const laborYieldMilli = laborTiles * (room.yieldMilli / room.tiles);
  const steadyMilli = Math.min(room.yieldMilli, laborYieldMilli);
  const ramp = farmRampTicks(f, climateSuitability(mg, tile));
  const useful = Math.max(0, planningHorizonTicks(f) - ramp);
  return milliFoodToPopTicks(f, steadyMilli) * useful;
}

/**
 * Seeds are capital (design.md §7 D-DP4): conquest zeroes maturity and
 * tenure, combat damage freezes growth — a seed on the contested frontier
 * is a seed wasted. Factor in (0,1]: min Chebyshev distance to ANOTHER
 * player's tile within SAFETY_SCOUT_RADIUS, normalized; 1 when no rival is
 * near. Wilderness never discounts — expansion room is exactly where
 * districts belong.
 */
export function hostileBorderDiscount(
  mg: Game,
  player: Player,
  tile: TileRef,
): number {
  const x0 = mg.x(tile);
  const y0 = mg.y(tile);
  let nearest = Infinity;
  for (let dy = -SAFETY_SCOUT_RADIUS; dy <= SAFETY_SCOUT_RADIUS; dy++) {
    for (let dx = -SAFETY_SCOUT_RADIUS; dx <= SAFETY_SCOUT_RADIUS; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d >= nearest) continue;
      if (!mg.isValidCoord(x0 + dx, y0 + dy)) continue;
      const owner = mg.owner(mg.ref(x0 + dx, y0 + dy));
      if (owner.isPlayer() && owner !== player) nearest = d;
    }
  }
  if (!Number.isFinite(nearest)) return 1;
  return nearest / (SAFETY_SCOUT_RADIUS + 1);
}

/**
 * Marginal population-ticks a new town's worth of people (`popPerDensity`
 * residents — one full city tile) unlocks at an existing farm whose field
 * is labor-capped (design.md §7 D-DP3). Priced with the same district
 * function at both labor levels, so the relief is exactly the coverage the
 * sim would gain. Zero for a fully-staffed (room-bound) field.
 */
export function farmLaborRelief(
  mg: Game,
  player: Player,
  shed: PlayerFoodShed,
  farmTile: TileRef,
): number {
  const f = mg.config().food();
  const residents = shed.peopleByFarm.get(farmTile) ?? 0;
  return (
    farmDistrictScore(mg, player, farmTile, residents + f.popPerDensity) -
    farmDistrictScore(mg, player, farmTile, residents)
  );
}

/**
 * People the player's fields need at home (design.md §7/task 10): every
 * currently TILLED tile is worked at `farmersPerFieldTile`. Troops sent
 * past this line come straight out of the tilled set — margins go fallow,
 * production and food capacity follow. Deliberately the tilled set, not
 * every claim: it ratchets down when war has already shrunk the worked
 * field (protect what is worked; expansion takes the genuinely spare), and
 * grows back with peace. The AI's "farmers stay home" reserve.
 */
export function fieldStaffingNeed(
  mg: Game,
  player: Player,
  shed: PlayerFoodShed,
): number {
  return shed.tilled.size * mg.config().food().farmersPerFieldTile;
}

/**
 * How many MORE troops the player may deploy right now under the war-share
 * bound (task 10.6): total deployment (attacks + boats) never exceeds
 * maxWarShare of the LIVING population. Troops are people — the idle pool
 * is the farm labor and the demographic engine; the vanilla reserves are
 * fractions of maxTroops (housing), which a food-bound population sits far
 * below, so "troops − reserve" used to be nearly everyone. The share is of
 * the population, so a growing nation fields growing armies while always
 * keeping the majority home.
 */
/**
 * The war share after food-runway scaling (rework-ai-war-strategy D8): full
 * barns fight bigger wars, empty stores throttle deployment below the flat
 * cap — aggression as an economic readout. Both scales at 1 recover the
 * flat maxWarShare exactly.
 */
export function scaledWarShare(f: FoodConfig, player: Player): number {
  const runway = foodRunwayTicks(player);
  const runwayN =
    Math.min(runway, f.warShareRichRunwayTicks) /
    Math.max(1, f.warShareRichRunwayTicks);
  return (
    f.maxWarShare *
    (f.warShareLeanScale +
      (f.warShareRichScale - f.warShareLeanScale) * runwayN)
  );
}

export function deployableTroops(mg: Game, player: Player): number {
  const f = mg.config().food();
  let deployed = 0;
  for (const a of player.outgoingAttacks()) deployed += a.troops();
  for (const b of player.units(UnitType.TransportShip)) deployed += b.troops();
  const pop = player.troops() + deployed;
  // Runway-scaled share; still an absolute cap, never suspended.
  return Math.max(0, Math.floor(pop * scaledWarShare(f, player)) - deployed);
}

/**
 * Per-nucleus staffing already spoken for (design.md §7/task 10): the
 * lesser of the cell's people and its field's need. Subtracted from a
 * candidate site's resident count so the planner never counts the same
 * pool twice — without this, the best-scoring "new" district is one tile
 * away from the old one, and placing it just splits the Voronoi cell.
 */
export function committedStaffing(
  mg: Game,
  player: Player,
  shed: PlayerFoodShed,
): Map<TileRef, number> {
  const f = mg.config().food();
  const claim = f.fieldClaimMilli;
  const acres = new Map<TileRef, number>();
  for (const [tile, m] of player.farmMaturityEntries()) {
    if (m < claim) continue;
    const cell = shed.hasCell(tile) ? shed.cellAt(tile) : tile;
    acres.set(cell, (acres.get(cell) ?? 0) + 1);
  }
  const committed = new Map<TileRef, number>();
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const t = farm.tile();
    const need = ((acres.get(t) ?? 1) + 1) * f.farmersPerFieldTile;
    committed.set(t, Math.min(shed.peopleByFarm.get(t) ?? 0, need));
  }
  return committed;
}

/** Residents in labor reach of `tile` minus the staffing already committed
 *  to existing nuclei in the same window — the labor actually FREE for a
 *  new field there. */
export function effectiveResidents(
  mg: Game,
  player: Player,
  tile: TileRef,
  committed: ReadonlyMap<TileRef, number>,
): number {
  let taken = 0;
  for (const [farmTile, c] of committed) {
    const d = Math.max(
      Math.abs(mg.x(tile) - mg.x(farmTile)),
      Math.abs(mg.y(tile) - mg.y(farmTile)),
    );
    if (d <= LABOR_SCOUT_RADIUS) taken += c;
  }
  return Math.max(0, residentsNear(mg, player, tile) - taken);
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
