import {
  Execution,
  Game,
  GameType,
  Player,
  PlayerInfo,
  PlayerType,
  SpawnArea,
  TribalStructures,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { simpleHash } from "../Util";
import { PlayerExecution } from "./PlayerExecution";
import { TribeExecution } from "./TribeExecution";
import { getSpawnTiles } from "./Util";

type Spawn = { center: TileRef; tiles: TileRef[] };

export class SpawnExecution implements Execution {
  private random: PseudoRandom;
  active: boolean = true;
  private mg: Game;
  private static readonly MAX_SPAWN_TRIES = 1_000;

  constructor(
    gameID: GameID,
    private playerInfo: PlayerInfo,
    public tile?: TileRef,
  ) {
    this.random = new PseudoRandom(
      simpleHash(playerInfo.id) + simpleHash(gameID),
    );
  }

  init(mg: Game, ticks: number) {
    this.mg = mg;
  }

  tick(ticks: number) {
    this.active = false;

    let player: Player | null = null;
    if (this.mg.hasPlayer(this.playerInfo.id)) {
      player = this.mg.player(this.playerInfo.id);
    } else {
      player = this.mg.addPlayer(this.playerInfo);
    }

    // Security: If random spawn is enabled, prevent players from re-rolling their spawn location
    if (this.mg.config().isRandomSpawn() && player.hasSpawned()) {
      return;
    }

    player.tiles().forEach((t) => player.relinquish(t));
    const spawn = this.getSpawn(
      this.mg.config().isRandomSpawn() ? undefined : this.tile,
    );

    if (!spawn) {
      console.warn(`SpawnExecution: cannot spawn ${this.playerInfo.name}`);
      return;
    }

    spawn.tiles.forEach((t) => {
      player.conquer(t);
    });

    if (!player.hasSpawned()) {
      this.mg.addExecution(new PlayerExecution(player));
      if (player.type() === PlayerType.Bot) {
        this.mg.addExecution(new TribeExecution(player));
      }
    }

    player.setSpawnTile(spawn.center);

    if (this.mg.hasLayers()) {
      this.placeStarterKit(player, spawn.center);
    }

    if (
      this.mg.config().gameConfig().gameType === GameType.Singleplayer &&
      this.playerInfo.playerType === PlayerType.Human
    ) {
      // In singleplayer, spawn ends when player selects
      // a spawn location.
      this.mg.endSpawnPhase();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  /**
   * Tribal starter kit (add-tile-painted-structures): settling paints a 2×2
   * homestead — one Settlement and three Farmland plots — centered on the
   * spawn. Free: the food stake is reset afterward, so the kit never eats
   * the opening budget. Re-spawns (spawn-phase re-clicks) rebuild the kit
   * at the new location.
   */
  private placeStarterKit(player: Player, center: TileRef): void {
    // Re-spawn: clear any previous kit before painting the new one.
    for (const u of player.units(...TribalStructures.types)) {
      u.delete(false);
    }

    const mg = this.mg;
    const cx = mg.x(center);
    const cy = mg.y(center);
    const valid = (t: TileRef) =>
      mg.isLand(t) &&
      !mg.isImpassable(t) &&
      mg.owner(t) === player &&
      mg.plotAt(t) === undefined;

    // Preferred: the 2×2 block at the spawn center; fallback: nearest owned
    // tiles (spawn blobs are contiguous, so this rarely triggers).
    const slots: TileRef[] = [];
    for (const [x, y] of [
      [cx, cy],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx + 1, cy + 1],
    ]) {
      if (slots.length >= 4) break;
      if (mg.isValidCoord(x, y)) {
        const t = mg.ref(x, y);
        if (valid(t)) slots.push(t);
      }
    }
    if (slots.length < 4) {
      const byDist = [...player.tiles()]
        .filter((t) => valid(t) && !slots.includes(t))
        .sort(
          (a, b) => mg.manhattanDist(a, center) - mg.manhattanDist(b, center),
        );
      slots.push(...byDist.slice(0, 4 - slots.length));
    }

    const kit: UnitType[] = [
      UnitType.Settlement,
      UnitType.Farmland,
      UnitType.Farmland,
      UnitType.Farmland,
    ];
    for (let i = 0; i < slots.length && i < kit.length; i++) {
      player.buildUnit(kit[i], slots[i], {});
    }

    // The kit is free: restore the opening stake buildUnit just charged.
    player.removeFood(player.food());
    player.addFood(BigInt(mg.config().food().startingFood));
  }

  private getSpawn(center?: TileRef): Spawn | undefined {
    if (center !== undefined) {
      const tiles = getSpawnTiles(this.mg, center, false);

      if (!tiles.length) {
        return;
      }

      return { center, tiles };
    }

    const spawnArea = this.getTeamSpawnArea();
    let tries = 0;

    while (tries < SpawnExecution.MAX_SPAWN_TRIES) {
      tries++;

      const center = this.randTile(spawnArea);

      if (
        !this.mg.isLand(center) ||
        this.mg.hasOwner(center) ||
        this.mg.isBorder(center)
      ) {
        continue;
      }

      const isOtherPlayerSpawnedNearby = this.mg
        .allPlayers()
        .filter((player) => player.id() !== this.playerInfo.id)
        .some((player) => {
          const spawnTile = player.spawnTile();

          if (spawnTile === undefined) {
            return false;
          }

          return (
            this.mg.manhattanDist(spawnTile, center) <
            this.mg.config().minDistanceBetweenPlayers()
          );
        });

      if (isOtherPlayerSpawnedNearby) {
        continue;
      }

      const tiles = getSpawnTiles(this.mg, center, true);
      if (!tiles) {
        // if some of the spawn tile is outside of the land, we want to find another spawn tile
        continue;
      }

      return { center, tiles };
    }

    return;
  }

  private randTile(area?: SpawnArea): TileRef {
    if (area) {
      const x = this.random.nextInt(area.x, area.x + area.width);
      const y = this.random.nextInt(area.y, area.y + area.height);
      return this.mg.ref(x, y);
    }
    const x = this.random.nextInt(0, this.mg.width());
    const y = this.random.nextInt(0, this.mg.height());
    return this.mg.ref(x, y);
  }

  private getTeamSpawnArea(): SpawnArea | undefined {
    const player = this.mg.player(this.playerInfo.id);
    const team = player.team();
    if (team === null) {
      return undefined;
    }
    return this.mg.teamSpawnArea(team);
  }
}
