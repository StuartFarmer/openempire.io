/**
 * The denominator for LEVEL B — a bare driver to run under the V8 profiler.
 *
 * Level A moved the two FLOODS to the GPU and lost: a flat 18.7 ms/tick round
 * trip against CPU floods that top out at 15.5 ms even at total conquest
 * (`FloodCost.ts`). The conclusion was that the port has to be broad — the
 * CONSUMERS have to move too, so nothing comes back but small per-cell
 * aggregates. This measures what those consumers cost.
 *
 * WHY A PROFILER, and not a timing harness. The obvious approach — call
 * foodTick/farmTick/growUrbanArea for every player and time them — is WRONG,
 * and visibly so: it produced a "total" of 165 ms/tick against a real tick of
 * 108 ms. Those stages mutate state, so invoking them out of sequence and
 * repeatedly re-does work that the real tick does once (farmTick places another
 * patch every call). Any number a harness like that reports is inflated by an
 * unknown amount. The profiler measures the stages where they actually run, in
 * the order they actually run, exactly once.
 *
 *   rm -rf /tmp/prof
 *   node --cpu-prof --cpu-prof-dir=/tmp/prof --import tsx \
 *     tests/perf/balance/EconomyProfile.ts --map spqr --ticks 6000
 *   node .claude/skills/run-openfront/cpu-profile.mjs /tmp/prof/*.cpuprofile \
 *     foodTick farmTick growUrbanArea recompute urbanTick
 *
 * NOTE: profile with `--import tsx`, not the `tsx` binary — that spawns a child
 * process, so --cpu-prof profiles the parent and reports 100% idle.
 */
import path from "path";
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

const TICKS = Number(process.argv[process.argv.indexOf("--ticks") + 1] ?? 6000);
const MAP = process.argv[process.argv.indexOf("--map") + 1] ?? "spqr";

class C extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}
console.debug = () => {};
console.warn = () => {};
console.error = () => {};
const log = console.log;
console.log = () => {};

const map = GameMapType[
  Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === MAP.toLowerCase(),
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
  gameID: "prof",
  lobbyCreatedAt: 0,
  config: gameConfig,
  players: [],
};
const loader = new NodeGameMapLoader(
  path.join(process.cwd(), "resources/maps"),
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
const random = new PseudoRandom(simpleHash("prof"));
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
  new C(gameConfig),
  manifest.teamGameSpawnAreas,
);
const runner = new GameRunner(
  game,
  new Executor(game, gameStart.gameID, undefined),
  () => {},
);
runner.init();
let turn = 0;
const tick = () => {
  runner.addTurn({ turnNumber: turn++, intents: [] });
  runner.executeNextTick();
};
while (game.inSpawnPhase()) tick();
for (let i = 0; i < TICKS; i++) tick();
let tiles = 0;
for (const p of game.players()) if (p.isAlive()) tiles += p.numTilesOwned();
log(
  `ticked to ${game.ticks()}, alive ${game.players().filter((p) => p.isAlive()).length}, owned ${tiles}`,
);
