import {
  cityDevelopmentEligibility,
  cityDevelopmentState,
} from "../../core/development/CityDevelopmentExecution";
import type { PaintedResourceSnapshot } from "../../core/execution/utils/PaintedEconomy";
import type { Game, Player } from "../../core/game/Game";
import type { GameImpl } from "../../core/game/GameImpl";
import type { CityDevelopmentUpdate } from "../../core/game/GameUpdates";
import type { ShellUrbanSummary } from "./ShellSimProtocol";

/** Reads the same owned housing, population and legal candidates as construction. */
export function cityDevelopmentSummary(
  game: Game,
  player: Player,
  resources: PaintedResourceSnapshot,
): ShellUrbanSummary | undefined {
  const model = cityDevelopmentState(player)?.model;
  if (!model) return undefined;
  const housing = resources.troopCapacity,
    population = resources.totalTroops;
  const occupancy = housing > 0 ? population / housing : null;
  const pressure =
    occupancy === null
      ? population > 0
        ? 1
        : 0
      : Math.max(
          0,
          Math.min(
            1,
            (occupancy - model.config.targetOccupancy) /
              (1 - model.config.targetOccupancy),
          ),
        );
  const eligible = cityDevelopmentEligibility(game, player);
  const candidates = model.candidates(
    eligible,
    Infinity,
    model.growthTiles(player.smallID()),
  );
  const upgradeBlocked =
    !candidates.some((c) => c.kind === "densify") &&
    [...model.ownedDevelopedTiles(player.smallID())].some(
      (tile) => eligible(tile) && model.level(tile) < 100,
    );
  const status =
    !player.hasSpawned() || game.inSpawnPhase()
      ? "waiting"
      : !housing && (!candidates.length || !population)
        ? "no-housing"
        : !player.isAlive()
          ? "waiting"
          : !pressure
            ? "vacancies"
            : !model.config.rate
              ? "disabled"
              : !candidates.length
                ? "no-space"
                : "construction";
  return {
    population,
    idle: resources.idleTroops,
    deployed: resources.deployedTroops,
    housing,
    occupancy,
    birthsPerSecond: (resources.troopGain * 1000) / game.config().msPerTick(),
    pressure,
    status,
    upgradeBlocked,
  };
}

/** Worker-owned observer. No drains or simulation mutations. */
export class CityDevelopmentUpdates {
  private previous = new Map<number, number>();
  private initial = true;
  private seed = 0;
  private revision = -1;

  read(game: Game): CityDevelopmentUpdate | undefined {
    const model = (game as GameImpl).cityDevelopment;
    if (!model) return undefined;
    if (this.initial) this.seed = model.deterministicState().seed;
    const changes = this.initial ? null : model.changesSince(this.revision);
    const out: number[] = [];
    const present = changes === null ? new Set<number>() : null;
    for (const tile of changes ?? model.developedTiles()) {
      present?.add(tile);
      const level = model.level(tile),
        owner = game.owner(tile).smallID();
      const state = level + owner * 128;
      if (this.previous.get(tile) === state) continue;
      this.previous.set(tile, state);
      out.push(tile, level, owner, game.magnitude(tile));
    }
    if (present)
      for (const tile of this.previous.keys()) {
        if (present.has(tile)) continue;
        this.previous.delete(tile);
        out.push(tile, 0, game.owner(tile).smallID(), game.magnitude(tile));
      }
    this.revision = model.developmentRevision;
    if (!this.initial && !out.length) return undefined;
    const reset = this.initial;
    this.initial = false;
    return {
      reset,
      width: game.width(),
      height: game.height(),
      seed: this.seed,
      tiles: Uint32Array.from(out),
    };
  }
}
