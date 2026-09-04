/**
 * Shell conduit-volume probe: runs one seeded headless bot game and reports,
 * per sample window, how much the sim ships to the renderer each tick (the
 * packed delta channels ShellSim.worker forwards) alongside tick cost and the
 * game's own scale (alive nations, population, damaged tiles).
 *
 * Used to diagnose the late-game shell slowdown and the burn/ash dropout:
 *   npx tsx tests/perf/balance/ShellDeltaProbe.ts --map spqr --ticks 12000
 */
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
} from "../../../src/core/game/Game";
import { createGame } from "../../../src/core/game/GameImpl";
import { GameUpdateViewData } from "../../../src/core/game/GameUpdates";
import { decodeLayers } from "../../../src/core/game/MapLayers";
import { createNationsForGame } from "../../../src/core/game/NationCreation";
import { genTerrainFromBin } from "../../../src/core/game/TerrainMapLoader";
import { UserSettings } from "../../../src/core/game/UserSettings";
import { GameRunner } from "../../../src/core/GameRunner";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import { GameConfig, GameStartInfo } from "../../../src/core/Schemas";
import { simpleHash } from "../../../src/core/Util";
import { NodeGameMapLoader } from "../fullgame/NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

class ProbeConfig extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}

async function main(): Promise<void> {
  console.debug = () => {};
  console.error = () => {};
  console.warn = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "spqr");
  const ticks = Number(arg("ticks", "12000"));
  const bots = Number(arg("bots", "50"));
  const nationCount = Number(arg("nations", "0"));
  const sample = Number(arg("sample", "500"));
  const seed = arg("seed", "probe");

  const map = GameMapType[
    Object.keys(GameMapType).find(
      (k) => k.toLowerCase() === mapName.toLowerCase(),
    ) as keyof typeof GameMapType
  ] as GameMapType;

  const gameConfig: GameConfig = {
    gameMap: map,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: Difficulty.Medium,
    nations: nationCount === 0 ? "default" : nationCount,
    donateGold: false,
    donateTroops: false,
    bots,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const gameStart: GameStartInfo = {
    gameID: seed,
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };

  const mapLoader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  const mapData = mapLoader.getMapData(map);
  const manifest = await mapData.manifest();
  const layers =
    manifest.layers === true && mapData.layersBin !== undefined
      ? decodeLayers(
          await mapData.layersBin(),
          manifest.map.width,
          manifest.map.height,
        )
      : null;
  const gameMap = await genTerrainFromBin(
    manifest.map,
    await mapData.mapBin(),
    layers,
  );
  const miniGameMap = await genTerrainFromBin(
    manifest.map4x,
    await mapData.map4xBin(),
  );
  const random = new PseudoRandom(simpleHash(seed));
  const nations = createNationsForGame(
    gameStart,
    manifest.nations,
    manifest.additionalNations ?? [],
    0,
    random,
  );
  const game = createGame(
    [],
    nations,
    gameMap,
    miniGameMap,
    new ProbeConfig(gameConfig),
    manifest.teamGameSpawnAreas,
  );

  let gu: GameUpdateViewData | null = null;
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    (u) => {
      if (!("errMsg" in u)) gu = u;
    },
  );
  runner.init();

  let turn = 0;
  const runTick = (): number => {
    runner.addTurn({ turnNumber: turn++, intents: [] });
    const t0 = performance.now();
    runner.executeNextTick();
    return performance.now() - t0;
  };
  while (game.inSpawnPhase()) runTick();

  log(
    `map=${mapName} ${manifest.map.width}x${manifest.map.height} nations=${nations.length} bots=${bots}`,
  );
  log(
    "tick | ms/tick | owner | density | damage | field | burns | maxBurn | alive | pop | tiles | dmgTiles",
  );

  let acc = {
    ms: 0,
    owner: 0,
    density: 0,
    damage: 0,
    field: 0,
    burns: 0,
    maxBurn: 0,
    n: 0,
  };
  for (let i = 0; i < ticks; i++) {
    const ms = runTick();
    const u = gu as GameUpdateViewData | null;
    const burns = u?.packedBurns?.length ?? 0;
    acc.ms += ms;
    acc.owner += (u?.packedTileUpdates?.length ?? 0) / 2;
    acc.density += u?.packedDensityUpdates?.length ?? 0;
    acc.damage += u?.packedDamageUpdates?.length ?? 0;
    acc.field += u?.packedFieldUpdates?.length ?? 0;
    acc.burns += burns;
    acc.maxBurn = Math.max(acc.maxBurn, burns);
    acc.n += 1;
    if ((i + 1) % sample === 0) {
      const players = game.players().filter((p) => p.isAlive());
      let pop = 0;
      let tiles = 0;
      for (const p of players) {
        pop += p.foodFlow().population;
        tiles += p.numTilesOwned();
      }
      const dmgTiles = Array.from(game.tileDamageEntries()).length;
      const avg = (v: number) => (v / acc.n).toFixed(0);
      log(
        [
          game.ticks(),
          (acc.ms / acc.n).toFixed(1),
          avg(acc.owner),
          avg(acc.density),
          avg(acc.damage),
          avg(acc.field),
          avg(acc.burns),
          acc.maxBurn,
          players.length,
          Math.round(pop),
          tiles,
          dmgTiles,
        ].join(" | "),
      );
      acc = {
        ms: 0,
        owner: 0,
        density: 0,
        damage: 0,
        field: 0,
        burns: 0,
        maxBurn: 0,
        n: 0,
      };
    }
  }
}

void main();
