import { Execution, Game, Player, Structures, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { GameUpdateType, PaintResultUpdate } from "../game/GameUpdates";
import { recordPaintedAction } from "./utils/PaintedEconomy";

export function purchasePaintedTile(
  game: Game,
  player: Player,
  kind: "city" | "farm",
  tile: TileRef,
): "placed" | "duplicate" | "invalid" | "unaffordable" {
  const before = player.foodMilli();
  const result = purchase(game, player, kind, tile);
  if (result !== "duplicate")
    recordPaintedAction(game, {
      player: player.id(),
      kind,
      tile,
      outcome: result === "placed" ? "committed" : "rejected",
      ...(result === "placed" ? {} : { reason: result }),
      spentMilli: before - player.foodMilli(),
      troops: 0,
    });
  return result;
}

function purchase(
  game: Game,
  player: Player,
  kind: "city" | "farm",
  tile: TileRef,
): "placed" | "duplicate" | "invalid" | "unaffordable" {
  const c = game.config().paintedEconomy();
  const type = kind === "city" ? UnitType.Settlement : UnitType.Farmland;
  if (
    !c ||
    !player.hasSpawned() ||
    !player.isAlive() ||
    game.inSpawnPhase() ||
    !Number.isSafeInteger(tile) ||
    !game.isValidRef(tile) ||
    !game.isLand(tile) ||
    game.isImpassable(tile) ||
    game.owner(tile) !== player ||
    game.tileDamage(tile) > 0 ||
    game.config().isUnitDisabled(type)
  )
    return "invalid";
  const existing = game.plotAt(tile);
  if (existing) return existing.type() === type ? "duplicate" : "invalid";
  if (game.nearbyUnits(tile, 0, Structures.types, undefined, true).length > 0)
    return "invalid";
  const cost = kind === "city" ? c.cityCostMilli : c.farmCostMilli;
  if (player.foodMilli() < cost) return "unaffordable";
  player.buildUnit(type, tile, {});
  return "placed";
}

export class PaintTilesExecution implements Execution {
  private game: Game;
  private active = true;
  constructor(
    private player: Player,
    private kind: "city" | "farm",
    private tiles: readonly TileRef[],
  ) {}
  init(game: Game): void {
    this.game = game;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
  isActive(): boolean {
    return this.active;
  }
  tick(): void {
    this.active = false;
    if (!this.game.config().paintedEconomy() || this.tiles.length > 4096)
      return;
    const before = this.player.foodMilli();
    const result: PaintResultUpdate = {
      type: GameUpdateType.PaintResult,
      player: this.player.id(),
      kind: this.kind,
      placed: [],
      skipped: 0,
      spentMilli: 0n,
      stoppedUnaffordable: false,
    };
    for (const tile of new Set(this.tiles)) {
      const outcome = purchasePaintedTile(
        this.game,
        this.player,
        this.kind,
        tile,
      );
      if (outcome === "unaffordable") {
        result.stoppedUnaffordable = true;
        break;
      }
      if (outcome === "placed") result.placed.push(tile);
      else result.skipped++;
    }
    result.spentMilli = before - this.player.foodMilli();
    this.game.addUpdate(result);
  }
}
