import { Game, Player, Unit, UnitType } from "../../game/Game";

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
export function foodTick(mg: Game, player: Player): void {
  const f = mg.config().food();

  // ── Production: farms are the engine; raw land is a marginal, sublinear
  // harvest (fertilitySum^exponent) so expansion alone cannot feed a nation.
  // Every player also works one "ghost" farmland (baseFarmFertility) — the
  // starting infrastructure that exists without a building on the map.
  let farmFertility = f.baseFarmFertility;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    // District bonus: contiguous farm belts out-produce scattered plots.
    const district = 1 + sameTypeNeighborPlots(mg, farm) * f.adjacencyBonus;
    farmFertility += mg.layer("crop", farm.tile()) * farm.level() * district;
  }
  const landMilli = Math.floor(
    Math.pow(player.fertilitySum(), f.landHarvestExponent) *
      f.landHarvestMilli,
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

  // ── Apply net flow to the stock; deficit beyond storage starves ─────────
  const impl = player as Player & { _foodMilli: bigint };
  let stock = impl._foodMilli + BigInt(productionMilli - consumptionMilli);
  let deficitMilli = 0;
  if (stock < 0n) {
    deficitMilli = Number(-stock);
    stock = 0n;
  }

  // ── Storage: overflow is lost, then the remainder decays ────────────────
  const capMilli =
    BigInt(
      f.baseStorage + Math.floor(barnCapacity(mg, player) * f.storagePerBarn),
    ) * 1000n;
  if (stock > capMilli) {
    stock = capMilli;
  }
  stock -= (stock * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
  impl._foodMilli = stock;

  // ── Growth throttled by surplus, or starvation on deficit ───────────────
  // Three regimes: surplus → grow (scaled up to full at surplusForFullGrowth
  // above break-even); covered deficit → stagnate (reserves feed people, they
  // don't multiply); uncovered deficit → starve.
  let starved = 0;
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
  } else if (productionMilli > consumptionMilli) {
    const surplusRatio =
      (productionMilli - consumptionMilli) / Math.max(1, consumptionMilli);
    const surplusFactor = Math.min(1, surplusRatio / f.surplusForFullGrowth);
    // Settlement districts: clustered towns grow population faster.
    const growth =
      mg.config().troopIncreaseRate(player) *
      surplusFactor *
      (1 + settlementDistrictAvg(mg, player) * f.adjacencyBonus);
    player.addTroops(growth);
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
}

/** Barn levels weighted by their district (adjacency) multiplier. */
function barnCapacity(mg: Game, player: Player): number {
  const bonus = mg.config().food().adjacencyBonus;
  let capacity = 0;
  for (const barn of player.units(UnitType.Barn)) {
    if (barn.isUnderConstruction()) continue;
    capacity +=
      barn.level() * (1 + sameTypeNeighborPlots(mg, barn) * bonus);
  }
  return capacity;
}

/** Average settlement adjacency (0..4) — the town-cluster growth factor. */
function settlementDistrictAvg(mg: Game, player: Player): number {
  let sum = 0;
  let count = 0;
  for (const s of player.units(UnitType.Settlement)) {
    if (s.isUnderConstruction()) continue;
    sum += sameTypeNeighborPlots(mg, s);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}
