import { Game, Player, UnitType } from "../../game/Game";

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

  // ── Production: owned fertility + Farmland bonuses ──────────────────────
  let farmFertility = 0;
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    farmFertility += mg.layer("crop", farm.tile()) * f.farmlandFertilityMult;
  }
  const productionMilli = Math.floor(
    (player.fertilitySum() + farmFertility) * f.productionPerFertilityMilli,
  );

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
    BigInt(f.baseStorage + barnLevels(player) * f.storagePerBarn) * 1000n;
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
    const unfed = deficitMilli / f.idleConsumptionMilli;
    starved = Math.min(
      player.troops(),
      Math.ceil(unfed * f.starvationDeathFraction),
    );
    player.removeTroops(starved);
  } else if (productionMilli > consumptionMilli) {
    const surplusRatio =
      (productionMilli - consumptionMilli) / Math.max(1, consumptionMilli);
    const surplusFactor = Math.min(1, surplusRatio / f.surplusForFullGrowth);
    const growth = mg.config().troopIncreaseRate(player) * surplusFactor;
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

function barnLevels(player: Player): number {
  let levels = 0;
  for (const barn of player.units(UnitType.Barn)) {
    if (barn.isUnderConstruction()) continue;
    levels += barn.level();
  }
  return levels;
}
