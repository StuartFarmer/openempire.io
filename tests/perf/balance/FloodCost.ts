/**
 * What do the two floods actually COST the CPU, as a game grows?
 *
 * This is the denominator for the GPU port. Level A (fields on the GPU,
 * consumers on the CPU) pays a FLAT per-tick round trip — upload the changed
 * planes, dispatch over the whole grid, read the results back — measured at
 * 18.7 ms/tick on spqr and independent of how much territory exists, because
 * the dispatch covers all 2048x1024 tiles either way.
 *
 * The CPU work it replaces is the opposite: proportional to owned land, and
 * therefore ~0 early and largest exactly when the framerate complaint appears.
 * So the port is worth it only past the tick where these two lines cross, and
 * this probe finds that tick instead of assuming it.
 *
 * One refresh cadence rebuilds every alive player's field exactly once
 * (`supplyRefreshTicks`, staggered per player), so a cadence's cost divided by
 * the period is the per-tick amortised cost that Level A would be removing.
 *
 *   npx tsx tests/perf/balance/FloodCost.ts --map spqr --checkpoints 500,1500,2500,3500
 */
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import { foodShedField } from "../../../src/core/execution/utils/FoodShed";
import { supplyField } from "../../../src/core/execution/utils/SupplyField";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  Player,
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

class CostConfig extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}

const median = (xs: number[]): number =>
  xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Force a full rebuild for every alive player and time it — one cadence. */
function cadenceCost(
  game: ReturnType<typeof createGame>,
  alive: Player[],
  reps: number,
): { shed: number; supply: number; tiles: number } {
  const shedMs: number[] = [];
  const supplyMs: number[] = [];
  for (let r = 0; r < reps; r++) {
    let t0 = performance.now();
    for (const p of alive) {
      const s = foodShedField(game, p) as unknown as { lastCalcTick: number };
      s.lastCalcTick = -1;
      foodShedField(game, p);
    }
    shedMs.push(performance.now() - t0);

    t0 = performance.now();
    for (const p of alive) {
      const s = supplyField(game, p) as unknown as { lastCalcTick: number };
      s.lastCalcTick = -1;
      supplyField(game, p);
    }
    supplyMs.push(performance.now() - t0);
  }
  let tiles = 0;
  for (const p of alive) tiles += p.numTilesOwned();
  return { shed: median(shedMs), supply: median(supplyMs), tiles };
}

async function main(): Promise<void> {
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "spqr");
  const seed = arg("seed", "floodcost");
  const reps = Number(arg("reps", "3"));
  const checkpoints = arg("checkpoints", "500,1500,2500,3500")
    .split(",")
    .map(Number)
    .sort((a, b) => a - b);

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
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 40,
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
  const loader = new NodeGameMapLoader(
    path.join(PROJECT_ROOT, "resources/maps"),
  );
  const data = loader.getMapData(map);
  const manifest = await data.manifest();
  const { width, height } = manifest.map;
  const layers = decodeLayers(await data.layersBin!(), width, height);
  const gameMap = await genTerrainFromBin(
    manifest.map,
    await data.mapBin(),
    layers,
  );
  const mini = await genTerrainFromBin(manifest.map4x, await data.map4xBin());
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
    mini,
    new CostConfig(gameConfig),
    manifest.teamGameSpawnAreas,
  );
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    () => {},
  );
  runner.init();
  let turn = 0;
  const tick = (): number => {
    const t0 = performance.now();
    runner.addTurn({ turnNumber: turn++, intents: [] });
    runner.executeNextTick();
    return performance.now() - t0;
  };
  while (game.inSpawnPhase()) tick();

  const period = Math.max(1, game.config().food().supplyRefreshTicks);
  log(`map=${mapName} ${width}x${height}  refresh period=${period} ticks`);
  log(
    "The last column is what Level A removes from the CPU, against the flat\n" +
      "18.7 ms/tick round trip it adds.\n",
  );
  log(
    "tick | alive | owned tiles | tick ms | shed/cadence | supply/cadence | floods ms/tick",
  );

  let at = 0;
  for (const cp of checkpoints) {
    const tickMs: number[] = [];
    while (at < cp) {
      tickMs.push(tick());
      at += 1;
    }
    const alive: Player[] = game.players().filter((p) => p.isAlive());
    const c = cadenceCost(game, alive, reps);
    const perTick = (c.shed + c.supply) / period;
    log(
      [
        String(cp).padStart(4),
        String(alive.length).padStart(5),
        c.tiles.toLocaleString().padStart(11),
        median(tickMs.slice(-200)).toFixed(1).padStart(7),
        c.shed.toFixed(1).padStart(12),
        c.supply.toFixed(1).padStart(14),
        perTick.toFixed(2).padStart(14),
      ].join(" | "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
