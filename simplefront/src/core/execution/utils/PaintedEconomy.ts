import {
  advanceResource,
  capacityScaledGain,
  foodCapacityMilli,
  troopCapacity,
} from "../../configuration/PaintedEconomyConfig";
import {
  cityDevelopmentState,
  organicHousingCapacity,
  organicPopulationPerSecond,
  tickCityDevelopment,
} from "../../development/CityDevelopmentExecution";
import { Game, Player, UnitType } from "../../game/Game";
import {
  GameUpdateType,
  type PaintedActionUpdate,
} from "../../game/GameUpdates";
import type { PlayerImpl } from "../../game/PlayerImpl";

export function recordPaintedAction(
  game: Game,
  action: Omit<PaintedActionUpdate, "type">,
): void {
  if (game.config().paintedEconomy())
    game.addUpdate({ type: GameUpdateType.PaintedAction, ...action });
}

export interface PaintedEconomyState {
  farms: number;
  cities: number;
  foodCredit: number;
  troopCredit: number;
  pendingLandingTroops: number;
  lastRefillTick: number;
}
export interface PaintedResourceSnapshot {
  foodMilli: bigint;
  foodCapacityMilli: bigint;
  foodGainMilli: number;
  idleTroops: number;
  deployedTroops: number;
  totalTroops: number;
  troopCapacity: number;
  troopGain: number;
  farms: number;
  cities: number;
}

export function paintedState(player: Player): PaintedEconomyState {
  return (player as PlayerImpl)._paintedEconomy;
}

export function paintedResources(
  game: Game,
  player: Player,
): PaintedResourceSnapshot {
  const c = game.config().paintedEconomy();
  if (!c) throw new Error("Painted resources requested for a legacy economy");
  const s = paintedState(player);
  const food = player.foodMilli();
  const capacity = foodCapacityMilli(s.farms, c);
  const deployed =
    s.pendingLandingTroops +
    player.outgoingAttacks().reduce((sum, attack) => sum + attack.troops(), 0) +
    player
      .units(UnitType.TransportShip)
      .reduce((sum, boat) => sum + boat.troops(), 0);
  const total = player.troops() + deployed;
  const troopCap = game.config().cityDevelopment()
    ? organicHousingCapacity(game, player)
    : troopCapacity(s.cities, c);
  const organic = cityDevelopmentState(player);
  const active =
    player.isAlive() && player.hasSpawned() && !game.inSpawnPhase();
  return {
    foodMilli: food,
    foodCapacityMilli: capacity,
    foodGainMilli: active
      ? capacityScaledGain(
          Number(food),
          Number(capacity),
          c.foodBootstrapFraction,
          c.foodGrowthRate,
        )
      : 0,
    idleTroops: player.troops(),
    deployedTroops: deployed,
    totalTroops: total,
    troopCapacity: troopCap,
    troopGain: active
      ? organic
        ? organicPopulationPerSecond(game, player, total, troopCap) *
          (game.config().msPerTick() / 1000)
        : capacityScaledGain(
            total,
            troopCap,
            c.troopBootstrapFraction,
            c.troopGrowthRate,
          )
      : 0,
    farms: s.farms,
    cities: s.cities,
  };
}

export function reconcilePaintedCapacity(
  game: Game,
  player: Player,
  snapshot?: PaintedResourceSnapshot,
): void {
  if (!game.config().paintedEconomy()) return;
  const s = paintedState(player);
  snapshot ??= paintedResources(game, player);
  if (snapshot.foodMilli >= snapshot.foodCapacityMilli) {
    player.removeFoodMilli(snapshot.foodMilli - snapshot.foodCapacityMilli);
    s.foodCredit = 0;
  }
  if (snapshot.totalTroops >= snapshot.troopCapacity) s.troopCredit = 0;
}

export function changePlotOwner(
  game: Game,
  type: UnitType,
  before: Player | null,
  after: Player | null,
): void {
  if (
    !game.config().paintedEconomy() ||
    before === after ||
    (type !== UnitType.Settlement && type !== UnitType.Farmland)
  )
    return;
  const key = type === UnitType.Settlement ? "cities" : "farms";
  if (before) paintedState(before)[key]--;
  if (after) paintedState(after)[key]++;
  if (before) reconcilePaintedCapacity(game, before);
  if (after) reconcilePaintedCapacity(game, after);
}

export function payDispatch(
  game: Game,
  player: Player,
  troops: number,
  kind: "land" | "transport",
): boolean {
  const c = game.config().paintedEconomy();
  if (!c) return true;
  if (!Number.isSafeInteger(troops) || troops <= 0) {
    recordPaintedAction(game, {
      player: player.id(),
      kind,
      outcome: "rejected",
      reason: "invalid",
      spentMilli: 0n,
      troops: 0,
    });
    return false;
  }
  const cost =
    BigInt(troops) *
    (kind === "land"
      ? c.landDispatchMilliPerTroop
      : c.transportDispatchMilliPerTroop);
  if (player.foodMilli() < cost) {
    recordPaintedAction(game, {
      player: player.id(),
      kind,
      outcome: "rejected",
      reason: "unaffordable",
      spentMilli: 0n,
      troops,
    });
    return false;
  }
  const spentMilli = player.removeFoodMilli(cost);
  recordPaintedAction(game, {
    player: player.id(),
    kind,
    outcome: "committed",
    spentMilli,
    troops,
  });
  return spentMilli === cost;
}

export function tickPaintedEconomy(game: Game, player: Player): void {
  const c = game.config().paintedEconomy();
  if (!c || game.inSpawnPhase() || !player.hasSpawned() || !player.isAlive())
    return;
  const s = paintedState(player);
  if (s.lastRefillTick === game.ticks()) return;
  const snapshot = paintedResources(game, player);
  reconcilePaintedCapacity(game, player, snapshot);
  // Reconciliation only changes food and fractional credits. Housing, total
  // troops and the birth rate in this snapshot remain valid until construction.
  const foodMilli = player.foodMilli();
  const food = advanceResource(
    Number(foodMilli),
    Number(snapshot.foodCapacityMilli),
    s.foodCredit,
    c.foodBootstrapFraction * Number(snapshot.foodCapacityMilli),
    c.foodGrowthRate,
  );
  const troops = game.config().cityDevelopment()
    ? tickCityDevelopment(
        game,
        player,
        snapshot.totalTroops,
        s.troopCredit,
        snapshot,
      )
    : advanceResource(
        snapshot.totalTroops,
        snapshot.troopCapacity,
        s.troopCredit,
        c.troopBootstrapFraction * snapshot.troopCapacity,
        c.troopGrowthRate,
      );
  player.addFoodMilli(BigInt(food.amount) - foodMilli);
  player.addTroops(troops.amount - snapshot.totalTroops);
  s.foodCredit = food.credit;
  s.troopCredit = troops.credit;
  s.lastRefillTick = game.ticks();
}
