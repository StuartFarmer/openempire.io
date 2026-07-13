import { Game, Player, Unit, UnitType } from "../../game/Game";
import {
  probeDistance,
  supplyField,
  supplyQuality,
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
  // farm, not free food). The spawn starter kit provides the first farms.
  let farmFertility = 0;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    // District bonus: contiguous farm belts out-produce scattered plots.
    const district = 1 + sameTypeNeighborPlots(mg, farm) * f.adjacencyBonus;
    // Supply-line term: frontier farms far from any Settlement/Barn
    // underperform until the district's logistics catch up.
    const quality = supplyQuality(mg, supply, farm.tile());
    farmFertility +=
      mg.layer("crop", farm.tile()) * farm.level() * district * quality;
  }
  const landMilli = Math.floor(
    Math.pow(player.fertilitySum(), f.landHarvestExponent) * f.landHarvestMilli,
  );
  // farmFertility carries fractional district multipliers — floor before
  // the value flows into bigint stock math.
  const productionMilli =
    landMilli + Math.floor(farmFertility * f.farmProductionMilli);

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

  // ── Growth throttled by the population share's surplus, or starvation ───
  // Three regimes: surplus → grow (scaled up to full at surplusForFullGrowth
  // above break-even) — the surplus is eaten by growth, never banked;
  // covered deficit → stagnate (reserves feed people, they don't multiply);
  // uncovered deficit → starve.
  let starved = 0;
  let surplusFactor = 0;
  if (deficitMilli > 0) {
    // Starvation hits the WHOLE population proportionally — idle pool,
    // troops deployed in attacks, and troops on boats. Deployed troops must
    // not be a famine shelter: without this, "attack with everything" was
    // starvation-immune (and conquered land on top).
    const total = idle + fighting + moving;
    const unfed = deficitMilli / f.idleConsumptionMilli;
    starved = Math.min(total, Math.ceil(unfed * f.starvationDeathFraction));
    if (total > 0 && starved > 0) {
      player.removeTroops(Math.round((starved * idle) / total));
      for (const attack of player.outgoingAttacks()) {
        const share = Math.round((starved * attack.troops()) / total);
        attack.setTroops(Math.max(0, attack.troops() - share));
      }
      for (const boat of player.units(UnitType.TransportShip)) {
        const share = Math.round((starved * boat.troops()) / total);
        boat.setTroops(Math.max(0, boat.troops() - share));
      }
    }
  } else if (netMilli > 0) {
    const surplusRatio = netMilli / Math.max(1, consumptionMilli);
    surplusFactor = Math.min(1, surplusRatio / f.surplusForFullGrowth);
    // Population fills toward the cap (set by the urban sprawl) on surplus.
    player.addTroops(mg.config().troopIncreaseRate(player) * surplusFactor);
  }

  // Expose the breakdown (display units) for the client/stats.
  const flow = (
    player as Player & {
      _foodFlow: {
        production: number;
        consumption: number;
        starvedTroops: number;
      };
    }
  )._foodFlow;
  flow.production = Math.floor(productionMilli / 1000);
  flow.consumption = Math.floor(consumptionMilli / 1000);
  flow.starvedTroops = starved;

  // The food surplus fraction (0..1) drives urban-sprawl growth (see
  // UrbanGrowth.urbanTick); 0 on break-even or deficit.
  return surplusFactor;
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
