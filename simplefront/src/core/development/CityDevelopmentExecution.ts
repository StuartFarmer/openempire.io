import { Structures, UnitType, type Game, type Player } from "../game/Game";
import type { TileRef } from "../game/GameMap";
import type { PlayerImpl } from "../game/PlayerImpl";
import { simpleHash } from "../Util";
import { GAME_POPULATION_SCALE } from "./CityDevelopmentConfig";
import type { CityDevelopmentAccount } from "./CityDevelopmentState";

export function cityDevelopmentState(
  player: Player,
): CityDevelopmentAccount | null {
  return (player as PlayerImpl)._cityDevelopment;
}

export function foundCityDevelopment(
  game: Game,
  player: Player,
  tile: TileRef,
): void {
  const state = cityDevelopmentState(player);
  if (!state) return;
  if (!cityDevelopmentEligibility(game, player)(tile))
    throw new Error("Found only on usable owned land.");
  state.model.found(tile);
}

export function cityDevelopmentEligibility(
  game: Game,
  player: Player,
): (tile: TileRef) => boolean {
  return (tile) =>
    game.owner(tile) === player &&
    game.isLand(tile) &&
    !game.isImpassable(tile) &&
    game.tileDamage(tile) === 0 &&
    game.nearbyUnits(
      tile,
      0,
      Structures.types,
      ({ unit }) => unit.type() !== UnitType.Settlement,
      true,
    ).length === 0;
}

export function organicHousingCapacity(game: Game, player: Player): number {
  const state = cityDevelopmentState(player);
  if (!state || !player.hasSpawned()) return 0;
  // A permanent player floor, not an additive bonus for each founding tile.
  return Math.max(
    10_000,
    GAME_POPULATION_SCALE *
      state.model.usableCapacity(
        (tile) => game.owner(tile) === player,
        state.model.ownedDevelopedTiles(player.smallID()),
      ),
  );
}

/** Game-facing births; both simulation ticks and HUD read the same scaled rate. */
export function organicPopulationPerSecond(
  game: Game,
  player: Player,
  population: number,
  housing: number,
): number {
  return (
    GAME_POPULATION_SCALE *
    (cityDevelopmentState(player)?.model.populationPerSecondFor(
      population / GAME_POPULATION_SCALE,
      housing / GAME_POPULATION_SCALE,
      (tile) => game.owner(tile) === player,
      cityDevelopmentState(player)!.model.ownedDevelopedTiles(player.smallID()),
    ) ?? 0)
  );
}

export function tickCityDevelopment(
  game: Game,
  player: Player,
  totalPopulation: number,
  birthCredit: number,
  resources?: { troopCapacity: number; troopGain: number },
): { amount: number; credit: number } {
  const state = cityDevelopmentState(player);
  if (!state) return { amount: totalPopulation, credit: 0 };
  const eligibility = cityDevelopmentEligibility(game, player);
  let housing =
    resources?.troopCapacity ?? organicHousingCapacity(game, player);
  const gain =
    resources?.troopGain ??
    organicPopulationPerSecond(game, player, totalPopulation, housing) *
      (game.config().msPerTick() / 1000);
  const accumulated = totalPopulation < housing ? birthCredit + gain : 0;
  const whole = Math.min(
    Math.max(0, housing - totalPopulation),
    Math.floor(accumulated),
  );
  const amount = totalPopulation + whole;

  state.elapsedMilliseconds += game.config().msPerTick();
  while (state.elapsedMilliseconds >= 250) {
    state.elapsedMilliseconds -= 250;
    housing = organicHousingCapacity(game, player);
    state.model.advanceConstructionStep(
      state,
      amount / GAME_POPULATION_SCALE,
      housing / GAME_POPULATION_SCALE,
      eligibility,
      state.model.growthTiles(player.smallID()),
    );
  }
  return { amount, credit: amount >= housing ? 0 : accumulated - whole };
}

export function isOrganicUrbanTile(player: Player, tile: TileRef): boolean {
  return (cityDevelopmentState(player)?.model.level(tile) ?? 0) > 0;
}

export function cityDevelopmentHash(player: Player): number {
  const state = cityDevelopmentState(player);
  if (!state) return 0;
  return simpleHash(
    JSON.stringify([state.randomState, state.elapsedMilliseconds]),
  );
}
