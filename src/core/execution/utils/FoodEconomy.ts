import { Game, Player, Unit, UnitType } from "../../game/Game";
import { farmTick } from "./FarmGrowth";
import {
  probeDistance,
  supplyField,
  supplyQualityFromDistance,
} from "./SupplyField";

/**
 * Count same-type, same-owner plots on the 4 edge-adjacent tiles. The
 * district bonus multiplier is 1 + count × Config.food().adjacencyBonus.
 */
export function sameTypeNeighborPlots(mg: Game, plot: Unit): number {
  const x = mg.x(plot.tile());
  const y = mg.y(plot.tile());
  let count = 0;
  for (const [ex, ey] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]) {
    if (!mg.isValidCoord(ex, ey)) continue;
    const neighbor = mg.plotAt(mg.ref(ex, ey));
    if (
      neighbor !== undefined &&
      neighbor.type() === plot.type() &&
      neighbor.owner() === plot.owner()
    ) {
      count++;
    }
  }
  return count;
}

/**
 * The Tribal-age food tick (see openspec add-tribal-food-economy). Runs once
 * per player per tick from PlayerExecution, only on layered maps
 * (game.hasLayers()). Fixed order — production, consumption, storage
 * overflow + decay, growth/starvation — so the flow is deterministic and
 * every stage's knobs live in Config.food().
 *
 * Units: flows are computed in milli-food (1000 milli = 1 displayed food) as
 * Numbers, applied to the player's bigint milli stock. Number math here is
 * safe: per-tick flows are far below 2^53.
 */
export function foodTick(mg: Game, player: Player): number {
  const f = mg.config().food();
  const supply = supplyField(mg, player);

  // ── Production: farms are the ONLY food source (landHarvestMilli
  // defaults to 0 — unfarmed land produces nothing; conquest wins tiles to
  // farm, not free food). Advance each farm's maturity first (climate-driven
  // Gompertz, growth-model.md Part 1), then harvest at the updated maturity:
  // a freshly planted farm yields almost nothing until it ripens, and a farm
  // in a hostile biome never reaches full yield.
  farmTick(mg, player);
  let farmYieldMilli = 0;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const tile = farm.tile();
    // District bonus: contiguous farm belts out-produce scattered plots.
    const district = 1 + sameTypeNeighborPlots(mg, farm) * f.adjacencyBonus;
    const maturity = player.farmMaturity(tile) / 1000; // AquaCrop canopy
    const soilN = mg.layer("crop", tile) / 255; // FAO fertility ceiling
    // yield = M · f_soil · farmYieldMilli (AquaCrop biomass→harvest collapsed).
    farmYieldMilli += maturity * soilN * district * f.farmYieldMilli;
  }
  const landMilli = Math.floor(
    Math.pow(player.fertilitySum(), f.landHarvestExponent) * f.landHarvestMilli,
  );
  const productionMilli = landMilli + Math.floor(farmYieldMilli);

  // ── Consumption: idle population < moving troops < fighting troops ──────
  // Attack and boat troops leave the player's troops() pool while deployed,
  // so the three groups are disjoint by construction.
  let fighting = 0;
  for (const attack of player.outgoingAttacks()) {
    // Supply-line attrition: a front that outruns its granaries LOSES
    // TROOPS — floor(troops × (1 − quality) × warSupplyAttrition) die this
    // tick, before the survivors eat at the base war rate. The front tile
    // may postdate the last field refresh, so probe back through owned
    // land for a distance; no front yet (or a cut-off beachhead) reads
    // Infinity → full attrition.
    const front = attack.frontTile();
    const frontDist =
      front === null ? Infinity : probeDistance(mg, player, supply, front);
    const quality = supplyQualityFromDistance(frontDist, f);
    const losses = Math.floor(
      attack.troops() * (1 - quality) * f.warSupplyAttrition,
    );
    if (losses > 0) {
      attack.setTroops(attack.troops() - losses);
    }
    fighting += attack.troops();
  }
  let moving = 0;
  for (const boat of player.units(UnitType.TransportShip)) {
    moving += boat.troops();
  }
  const idle = player.troops();
  const consumptionMilli = Math.floor(
    idle * f.idleConsumptionMilli +
      moving * f.moveConsumptionMilli +
      fighting * f.fightConsumptionMilli,
  );

  // ── Allocation split (add-food-allocation): the slider decides how much
  // of this tick's production is offered to the population; the rest banks.
  // At share 1.0 a growing population consumes everything and nothing ever
  // banks — banking is what the storage share is for.
  const share = player.foodPopulationShare();
  let popMilli = Math.floor(productionMilli * share);
  const storeMilli = productionMilli - popMilli;

  // ── Storage first: bank the storage share; overflow beyond the cap is
  // rebated to the population instead of rotting on the ground.
  const impl = player as Player & { _foodMilli: bigint };
  let stock = impl._foodMilli + BigInt(storeMilli);
  const capMilli =
    BigInt(
      f.baseStorage + Math.floor(barnCapacity(mg, player) * f.storagePerBarn),
    ) * 1000n;
  if (stock > capMilli) {
    popMilli += Number(stock - capMilli);
    stock = capMilli;
  }

  // ── Feed the population from its share; storage buffers any shortfall ───
  const netMilli = popMilli - consumptionMilli;
  let deficitMilli = 0;
  if (netMilli < 0) {
    const need = BigInt(-netMilli);
    const draw = stock < need ? stock : need;
    stock -= draw;
    deficitMilli = Number(need - draw);
  }

  // ── The banked remainder decays (grain rots) ────────────────────────────
  stock -= (stock * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
  impl._foodMilli = stock;

  // ── Demographics (add-urban-core-growth): the population is agents with an
  // average lifespan. Food modulates BIRTHS and DEATHS; the city footprint and
  // survival follow the LIVING population, not the food capacity. ───────────
  const pop = idle + fighting + moving; // total manpower
  const need = Math.max(1, consumptionMilli);
  // Food-supported population — how many mouths this production can feed. It is
  // the ceiling births approach (never overshoot).
  const capacity = Math.floor(productionMilli / f.idleConsumptionMilli);

  // fedRatio: fraction of the population's need met this tick (1 = fully fed).
  const fedRatio = Math.max(0, Math.min(1, 1 - deficitMilli / need));
  // surplusRatio: production vs need — >1 is surplus, which boosts births.
  const surplusRatio = productionMilli / need;

  const dem = player as Player & {
    _birthCredit: number;
    _deathCredit: number;
    _starveCredit: number;
  };
  const baseDeathFraction = 1 / f.avgLifespanTicks;

  // Old-age deaths take the CIVILIAN population (the idle pool). Deployed
  // soldiers are a transient consumed by war and famine, not by aging at the
  // front — a 10-second life must not evaporate an army in the field.
  dem._deathCredit += idle * baseDeathFraction;
  const oldAge = Math.min(idle, Math.floor(dem._deathCredit));
  dem._deathCredit -= oldAge;

  // Starvation kills EVERYONE (idle + deployed, no famine shelter) on TOP of old
  // age: as food falls the effective lifespan shortens — half food ⇒ half life
  // (double death), floored at minFedForLife so full starvation is finite.
  const starveFraction = Math.min(
    1,
    baseDeathFraction * (1 / Math.max(f.minFedForLife, fedRatio) - 1),
  );
  dem._starveCredit += pop * starveFraction;
  const starved = Math.min(pop, Math.floor(dem._starveCredit));
  dem._starveCredit -= starved;

  // Births: base rate, scaled 0→birthSurplusCap× by food surplus (0 at no food,
  // 1× at break-even, up to the cap at ≥200% food). New people join the idle
  // pool — but never breed past the food-supported population, so growth
  // approaches that ceiling and holds instead of overshooting into famine.
  const birthFactor = Math.max(0, Math.min(f.birthSurplusCap, surplusRatio));
  dem._birthCredit += pop * f.baseBirthRate * birthFactor;
  let births = Math.floor(dem._birthCredit);
  dem._birthCredit -= births;
  const headroom = Math.max(0, capacity - pop);
  if (births > headroom) {
    births = headroom;
    dem._birthCredit = 0; // the food ceiling, not banked credit, caps growth
  }

  // Apply old age to the idle pool, then starvation proportionally across the
  // whole population, then births to the idle pool.
  if (oldAge > 0) player.removeTroops(oldAge);
  if (starved > 0 && pop > 0) {
    player.removeTroops(Math.round((starved * idle) / pop));
    for (const attack of player.outgoingAttacks()) {
      const share = Math.round((starved * attack.troops()) / pop);
      attack.setTroops(Math.max(0, attack.troops() - share));
    }
    for (const boat of player.units(UnitType.TransportShip)) {
      const share = Math.round((starved * boat.troops()) / pop);
      boat.setTroops(Math.max(0, boat.troops() - share));
    }
  }
  if (births > 0) player.addTroops(births);

  // Living population after this tick's demographics.
  const newPop =
    player.troops() +
    player.outgoingAttacks().reduce((a, at) => a + at.troops(), 0) +
    player.units(UnitType.TransportShip).reduce((a, b) => a + b.troops(), 0);

  // Expose the breakdown (display units) for the client/stats.
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
  flow.starvedTroops = starved;
  flow.capacity = capacity;
  flow.population = newPop;

  // The nation dies out when its entire population is gone — even if it still
  // holds land. Its territory reverts to neutral (add-urban-core-growth).
  if (newPop <= 0 && player.hasSpawned() && player.isAlive()) {
    for (const t of Array.from(player.tiles())) player.relinquish(t);
  }

  return surplusRatio;
}

/** Barn levels weighted by their district (adjacency) multiplier. */
function barnCapacity(mg: Game, player: Player): number {
  const bonus = mg.config().food().adjacencyBonus;
  let capacity = 0;
  for (const barn of player.units(UnitType.Barn)) {
    if (barn.isUnderConstruction()) continue;
    capacity += barn.level() * (1 + sameTypeNeighborPlots(mg, barn) * bonus);
  }
  return capacity;
}
