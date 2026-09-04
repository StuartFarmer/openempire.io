/**
 * Per-tick sim profiler (rework-settlement-ecology perf pass): runs one
 * seeded headless bot game and reports tick execution time BY TICK PHASE
 * (tick mod supplyRefreshTicks) to expose cadence-aligned spikes — the
 * "framerate dips every cycle" bug.
 *
 *   npx tsx tests/perf/balance/TickProfile.ts [--map verdantia]
 *       [--ticks 1200] [--nations 25] [--bots 100] [--seed prof]
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

class ProfConfig extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}

async function main(): Promise<void> {
  console.debug = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "verdantia");
  const ticks = Number(arg("ticks", "1200"));
  const bots = Number(arg("bots", "100"));
  const nationCount = Number(arg("nations", "25"));
  const seed = arg("seed", "prof");

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
    nations: nationCount,
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

  const config = new ProfConfig(gameConfig);
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
    config,
    manifest.teamGameSpawnAreas,
  );
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    () => {},
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

  const period = 10; // legacy cadence bucketing (supply refresh is gone)
  const byPhase: number[][] = Array.from({ length: period }, () => []);
  const all: { tick: number; ms: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    const tick = game.ticks();
    const ms = runTick();
    byPhase[tick % period].push(ms);
    all.push({ tick, ms });
  }

  const stats = (xs: number[]) => {
    const s = xs.slice().sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return {
      mean: mean.toFixed(1),
      p50: s[(s.length / 2) | 0].toFixed(1),
      p95: s[(s.length * 0.95) | 0].toFixed(1),
      max: s[s.length - 1].toFixed(1),
    };
  };

  log(`map=${mapName} ticks=${ticks} period=${period}`);
  log(`phase (tick mod ${period}) → ms stats:`);
  for (let ph = 0; ph < period; ph++) {
    log(`  phase ${ph}: ${JSON.stringify(stats(byPhase[ph]))}`);
  }
  const worst = all.sort((a, b) => b.ms - a.ms).slice(0, 10);
  log(
    `worst ticks: ${worst.map((w) => `t${w.tick}=${w.ms.toFixed(0)}ms(ph${w.tick % period})`).join(" ")}`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
