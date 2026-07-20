import { Game, Player, UnitType } from "../../game/Game";

/**
 * The simplified food tick (simplify-food-economy, food-economy spec). Runs
 * once per player per tick from PlayerExecution via urbanTick.
 *
 * One national pool, one logistic population:
 *   1. Farms produce: farmOutputMilli × avgOwnedFertility(footprint) ×
 *      fertilityBonus per completed Farmland (farm-growth spec).
 *   2. Everyone eats idleConsumptionMilli — deployed troops included, at the
 *      same rate (war costs people via combat, never food).
 *   3. A shortfall drains the pool to zero BEFORE anyone starves — the
 *      granary is the famine buffer.
 *   4. The pool caps at granaryBase + granaryPerFarm × farms.
 *   5. Population moves toward min(foodCapacity, housing) on a single
 *      logistic: growth below target, faster linear decline above target
 *      while the pool is empty. One milli-credit accumulator.
 *
 * Units: integer milli-food (1000 milli = 1 displayed food); the pool is a
 * bigint, per-tick flows are Numbers (far below 2^53).
 */

/** Per-tick production of one completed Farmland, in milli-food:
 *  farmOutputMilli × (Σ fertility over its WORKED tiles / (255 ×
 *  (2·farmRadius+1)²)) × fertilityBonus. This is PER worked tile — the
 *  `(2·farmRadius+1)²` is only the reference normalization, not a cap
 *  (unbound-organic-growth): a field grown beyond the reference footprint
 *  yields proportionally MORE than farmOutputMilli. The field's growth IS the
 *  production ramp. */
export function farmProductionMilli(
  mg: Game,
  player: Player,
  farmTile: number,
): number {
  const f = mg.config().food();
  const r = Math.max(0, Math.floor(f.farmRadius));
  const side = 2 * r + 1;
  const area = side * side;
  let fertSum = 0; // in fertility bytes (0..255)
  for (const t of player.fieldTiles(farmTile)) {
    fertSum += mg.fertility(t);
  }
  return Math.floor(
    (f.farmOutputMilli * fertSum * f.fertilityBonus) / (255 * area),
  );
}

/** Total per-tick production across the player's completed farms (milli). */
export function totalProductionMilli(mg: Game, player: Player): number {
  let sum = 0;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    sum += farmProductionMilli(mg, player, farm.tile());
  }
  return sum;
}

export function foodTick(mg: Game, player: Player): number {
  const f = mg.config().food();
  const impl = player as Player & {
    _foodMilli: bigint;
    _popCreditMilli: number;
  };

  // ── Production + farm count ──────────────────────────────────────────
  let farms = 0;
  let productionMilli = 0;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    farms++;
    productionMilli += farmProductionMilli(mg, player, farm.tile());
  }

  // ── Population (troops ARE people; deployed cohorts eat the same) ────
  let deployed = 0;
  for (const attack of player.outgoingAttacks()) deployed += attack.troops();
  for (const boat of player.units(UnitType.TransportShip)) {
    deployed += boat.troops();
  }
  const pop = player.troops() + deployed;
  const consumptionMilli = Math.floor(pop * f.idleConsumptionMilli);

  // ── The pool: production in, consumption out, buffer, cap ────────────
  let pool = impl._foodMilli + BigInt(productionMilli - consumptionMilli);
  if (pool < 0n) pool = 0n;
  const capMilli = BigInt(f.granaryBase + f.granaryPerFarm * farms) * 1000n;
  if (pool > capMilli) pool = capMilli;
  impl._foodMilli = pool;

  // ── One logistic toward min(food capacity, housing) ──────────────────
  const capacity = Math.floor(
    productionMilli / Math.max(1, f.idleConsumptionMilli),
  );
  const housing = mg.config().maxTroops(player);
  const target = Math.min(capacity, housing);
  const surplusRatio =
    consumptionMilli > 0 ? productionMilli / consumptionMilli : 1;

  let deltaMilli = 0;
  if (pop < target) {
    deltaMilli = Math.round(
      f.popGrowthRate * pop * (1 - pop / Math.max(1, target)) * 1000,
    );
  } else if (pop > target && pool <= 0n) {
    // Famine: only when the granary is empty — the war chest buys time.
    deltaMilli = -Math.round(f.popDeclineRate * (pop - target) * 1000);
  }
  impl._popCreditMilli += deltaMilli;
  let whole = Math.trunc(impl._popCreditMilli / 1000);
  impl._popCreditMilli -= whole * 1000;
  if (whole > 0) {
    player.addTroops(whole);
  } else if (whole < 0) {
    whole = -Math.min(player.troops(), -whole);
    if (whole < 0) player.removeTroops(-whole);
  }

  const newPop = pop + whole;

  // ── HUD readout (display units) ──────────────────────────────────────
  const flow = (
    player as Player & {
      _foodFlow: {
        production: number;
        consumption: number;
        starvedTroops: number;
        capacity: number;
        population: number;
      };
    }
  )._foodFlow;
  flow.production = Math.floor(productionMilli / 1000);
  flow.consumption = Math.floor(consumptionMilli / 1000);
  flow.starvedTroops = whole < 0 ? -whole : 0;
  flow.capacity = capacity;
  flow.population = newPop;

  // The nation dies when its whole population is gone (exact-zero rule).
  if (newPop <= 0 && player.hasSpawned() && player.isAlive()) {
    for (const t of Array.from(player.tiles())) player.relinquish(t);
  }

  return surplusRatio;
}
