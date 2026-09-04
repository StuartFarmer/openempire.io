/**
 * How many DISTRICTS does a real game actually have?
 *
 * `MAX_CELLS` (the dense-slot cap in the economy field system) was set to 16384
 * as a guess, and a guess is a bad thing for a cap whose overflow silently drops
 * districts from the ledger. A district is a completed Farmland nucleus, so this
 * counts them across alive players through a full game on the largest map.
 *
 *   npx tsx tests/perf/balance/DistrictCount.ts --map spqr --checkpoints 2000,5000,9000
 */
import path from "path";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
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

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
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

const MAP = arg("map", "spqr");
const checkpoints = arg("checkpoints", "2000,5000,9000")
  .split(",")
  .map(Number)
  .sort((a, b) => a - b);
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
  gameID: "districts",
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
const random = new PseudoRandom(simpleHash("districts"));
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
const tick = (): void => {
  runner.addTurn({ turnNumber: turn++, intents: [] });
  runner.executeNextTick();
};
while (game.inSpawnPhase()) tick();

log(`map=${MAP} ${width}x${height}`);
log("tick | alive | districts | max per player");
let at = 0;
for (const cp of checkpoints) {
  while (at < cp) {
    tick();
    at += 1;
  }
  let total = 0;
  let max = 0;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    let mine = 0;
    for (const u of p.units(UnitType.Farmland)) {
      if (!u.isUnderConstruction()) mine += 1;
    }
    total += mine;
    if (mine > max) max = mine;
  }
  const alive = game.players().filter((p) => p.isAlive()).length;
  log(
    `${String(cp).padStart(4)} | ${String(alive).padStart(5)} | ${String(total).padStart(9)} | ${String(max).padStart(14)}`,
  );
}
