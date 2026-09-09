import { foundCityDevelopment } from "../development/CityDevelopmentExecution";
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
import { attachPaintedAI } from "./PaintedAIExecution";
import { PlayerExecution } from "./PlayerExecution";
import { TribeExecution } from "./TribeExecution";
import { getSpawnTiles } from "./Util";
import { climateSuitability } from "./utils/FarmGrowth";
import { paintedAIState } from "./utils/PaintedAI";
import { paintedResources, paintedState } from "./utils/PaintedEconomy";

type Spawn = { center: TileRef; tiles: TileRef[] };

export class SpawnExecution implements Execution {
  private random: PseudoRandom;
  active: boolean = true;
  private mg: Game;
  private static readonly MAX_SPAWN_TRIES = 1_000;

  constructor(
    private gameID: GameID,
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

    // Stage 2 organic state persists beyond its active founder; replaying a
    // selected spawn must not mint another free level-one centre. Normal
    // SimpleFront selected-spawn rerolls remain unchanged.
    if (
      player.hasSpawned() &&
      (this.mg.config().isRandomSpawn() ||
        this.mg.config().cityDevelopment() !== null)
    ) {
      return;
    }

    const painted = this.mg.config().paintedEconomy();
    if (!painted) player.tiles().forEach((t) => player.relinquish(t));
    const spawn = this.getSpawn(
      this.mg.config().isRandomSpawn() ? undefined : this.tile,
    );

    if (!spawn) {
      console.warn(`SpawnExecution: cannot spawn ${this.playerInfo.name}`);
      return;
    }

    let kit = painted
      ? spawn.tiles
          .filter(
            (t) =>
              this.mg.isLand(t) &&
              !this.mg.isImpassable(t) &&
              this.mg.tileDamage(t) === 0 &&
              !this.mg.plotAt(t),
          )
          .sort(
            (a, b) =>
              this.mg.manhattanDist(a, spawn.center) -
                this.mg.manhattanDist(b, spawn.center) || a - b,
          )
          .slice(0, 2)
      : [];
    if (painted && this.mg.config().cityDevelopment() && kit.length === 2) {
      const centre = kit[0];
      const farm = spawn.tiles
        .filter(
          (tile) =>
            tile !== centre &&
            this.mg.isLand(tile) &&
            !this.mg.isImpassable(tile) &&
            this.mg.tileDamage(tile) === 0 &&
            !this.mg.plotAt(tile),
        )
        .sort(
          (a, b) =>
            Number(this.mg.manhattanDist(b, centre) >= 2) -
              Number(this.mg.manhattanDist(a, centre) >= 2) ||
            this.mg.manhattanDist(a, centre) -
              this.mg.manhattanDist(b, centre) ||
            a - b,
        )[0];
      if (farm !== undefined) kit = [centre, farm];
    }
    if (painted) {
      if (kit.length !== 2) return;
      player.tiles().forEach((t) => player.relinquish(t));
      Object.assign(paintedState(player), {
        farms: 0,
        cities: 0,
        foodCredit: 0,
        troopCredit: 0,
        pendingLandingTroops: 0,
        lastRefillTick: -1,
      });
    }

    spawn.tiles.forEach((t) => {
      player.conquer(t);
    });

    if (!player.hasSpawned()) {
      this.mg.addExecution(new PlayerExecution(player));
      if (player.type() === PlayerType.Bot && !painted) {
        this.mg.addExecution(new TribeExecution(player));
      }
    }

    player.setSpawnTile(spawn.center);

    if (painted) {
      player.setCore(kit[0]);
      foundCityDevelopment(this.mg, player, kit[0]);
      player.buildUnit(UnitType.Settlement, kit[0], {});
      player.buildUnit(UnitType.Farmland, kit[1], {});
      player.removeFoodMilli(player.foodMilli());
      const capacity = paintedResources(this.mg, player);
      player.addFoodMilli(
        BigInt(
          Math.min(
            painted.startingFood * 1000,
            Number(capacity.foodCapacityMilli),
          ),
        ),
      );
      player.setTroops(
        Math.min(painted.startingTroops, capacity.troopCapacity),
      );
      const ai = paintedAIState(player);
      if (ai)
        Object.assign(ai, {
          lastDecisionTick: -1,
          plotCursor: 0,
          borderCursor: 0,
          coastCursor: 0,
          campaign: null,
          pendingCoast: null,
          foodBlockedTicks: 0,
        });
      if (
        player.type() === PlayerType.Bot ||
        player.type() === PlayerType.Nation
      )
        attachPaintedAI(this.gameID, this.mg, player);
    } else this.foundCore(player, spawn.center);

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
   * Settle (add-urban-core-growth / rework-settlement-ecology §1): found
   * the urban Core AND one ripe farm NUCLEUS — the spawn kit is the same
   * founding pair the award ladder banks. Both grow themselves from here:
   * the city sprawls (UrbanGrowth) and the field spreads (FarmGrowth §1b).
   * Re-spawns re-found at the new location, clearing the old field + kit.
   */
  private foundCore(player: Player, center: TileRef): void {
    const mg = this.mg;

    // Re-spawn: clear any previous density field and starter plots.
    for (const [tile] of Array.from(player.densityEntries())) {
      player.setDensity(tile, 0);
    }
    for (const u of player.units(...TribalStructures.types)) {
      u.delete(false);
    }

    const valid = (t: TileRef) =>
      mg.isLand(t) && !mg.isImpassable(t) && mg.owner(t) === player;

    // Seed the Core on the best owned land at the spawn (prefer the center).
    let coreTile = center;
    if (!valid(coreTile)) {
      const nearest = [...player.tiles()]
        .filter(valid)
        .sort(
          (a, b) => mg.manhattanDist(a, center) - mg.manhattanDist(b, center),
        )[0];
      if (nearest !== undefined) coreTile = nearest;
    }
    player.setCore(coreTile);

    const simple = mg.config().simplePlotEconomy();
    if (simple !== null) {
      player.setDensity(coreTile, 0);
      player.buildUnit(UnitType.Settlement, coreTile, {});
    } else {
      // Seed the capital as one full city tile (popPerDensity people); the
      // demographic model grows or shrinks the footprint from there.
      player.setDensity(coreTile, mg.config().food().popPerDensity);
    }

    // Plant ONE starter farm nucleus (free) a few tiles OUT from the core —
    // the field grows itself from here (§1b) and belongs near the village,
    // not in it: the standoff leaves the young city a collar of wild land
    // to grow into before the spreading field arrives (first claim holds
    // between the automata). Sited on the BEST climate-suitability candidate:
    // maturity settles AT suitability, so a kit farm on hostile ground would
    // senesce below the claim threshold and never seed a field. It begins
    // already ripe, so it feeds from tick one AND starts spreading.
    const cx = mg.x(coreTile);
    const cy = mg.y(coreTile);
    let kitTile: TileRef | null = null;
    let kitSuit = -1;
    for (const [dx, dy] of [
      [3, 0],
      [0, 3],
      [-3, 0],
      [0, -3],
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2],
      [1, 0], // cramped spawns: better a close farm than none
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      if (!mg.isValidCoord(cx + dx, cy + dy)) continue;
      const t = mg.ref(cx + dx, cy + dy);
      if (!valid(t) || mg.plotAt(t) !== undefined) continue;
      const suit = climateSuitability(mg, t);
      if (suit > kitSuit) {
        kitSuit = suit;
        kitTile = t;
      }
    }
    // Tiny or obstructed spawn areas can miss every preferred offset.  A kit
    // farm is still part of the opening, so use the nearest remaining owned
    // legal tile in a stable order rather than silently omitting it.
    if (simple !== null) {
      kitTile ??=
        [...player.tiles()]
          .filter(
            (t) => t !== coreTile && valid(t) && mg.plotAt(t) === undefined,
          )
          .sort(
            (a, b) =>
              mg.manhattanDist(a, coreTile) - mg.manhattanDist(b, coreTile) ||
              a - b,
          )[0] ?? null;
    }
    if (kitTile !== null) {
      player.buildUnit(UnitType.Farmland, kitTile, {});
      if (simple === null) player.setFarmMaturity(kitTile, 1000);
    }

    if (simple !== null) {
      const seed = Math.floor(simple.capacityPerLevel * simple.seedFraction);
      player.setTroops(seed);
      player.removeFood(player.food());
      player.addFood(BigInt(seed));
      return;
    }

    // Reset the opening food stake (the kit is free).
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
