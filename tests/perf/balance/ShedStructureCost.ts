/**
 * Stage 3, final piece: what do the shed's DATA STRUCTURES cost?
 *
 * `PlayerFoodShed` hands the economy `Map<TileRef, number>` (cellOf, potential)
 * and `Set<TileRef>` (tilled, ranked). Every consumer of those is a random
 * access, a `.size`, a mask test, or one accumulation grouped by cell — none of
 * them needs a hash table. They could all be typed-array planes.
 *
 * That matters twice over:
 *   - it is the prerequisite for a GPU port (the hybrid died on rebuilding a Map
 *     from a plane, at 16.8 ms against a 20.8 ms CPU baseline), and
 *   - if hash tables are what the CPU is spending its time on, replacing them is
 *     a straight CPU win with no GPU involved.
 *
 * So measure the structures themselves at real sizes, on a real shed.
 *
 *   npx tsx tests/perf/balance/ShedStructureCost.ts --map spqr --ticks 2500
 */
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import { foodShedField } from "../../../src/core/execution/utils/FoodShed";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  Player,
} from "../../../src/core/game/Game";
import { createGame } from "../../../src/core/game/GameImpl";
import { TileRef } from "../../../src/core/game/GameMap";
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

async function main(): Promise<void> {
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "spqr");
  const ticks = Number(arg("ticks", "2500"));
  const seed = arg("seed", "shedcost");
  const reps = Number(arg("reps", "5"));

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
  const tick = () => {
    runner.addTurn({ turnNumber: turn++, intents: [] });
    runner.executeNextTick();
  };
  while (game.inSpawnPhase()) tick();
  for (let i = 0; i < ticks; i++) tick();

  const n = width * height;
  // Every alive player's shed, which is what one refresh cadence rebuilds.
  const alive: Player[] = game.players().filter((p) => p.isAlive());
  const entries: [TileRef, number][] = [];
  const tilledTiles: TileRef[] = [];
  for (const p of alive) {
    const shed = foodShedField(game, p);
    for (const t of shed.tiles) entries.push([t, shed.cellAt(t)]);
    for (const t of shed.tilled) tilledTiles.push(t);
  }
  log(
    `map=${mapName} ${width}x${height} tick=${game.ticks()} players=${alive.length}`,
  );
  log(`shed tiles=${entries.length}  tilled tiles=${tilledTiles.length}`);

  // ── BUILD: the two shapes recompute could produce.
  const mapBuild: number[] = [];
  const planeBuild: number[] = [];
  const setBuild: number[] = [];
  const maskBuild: number[] = [];
  for (let r = 0; r < reps; r++) {
    let t0 = performance.now();
    const asMap = new Map<TileRef, number>();
    for (const [t, c] of entries) asMap.set(t, c);
    mapBuild.push(performance.now() - t0);

    t0 = performance.now();
    const asPlane = new Int32Array(n).fill(-1);
    for (const [t, c] of entries) asPlane[t] = c;
    planeBuild.push(performance.now() - t0);

    t0 = performance.now();
    const asSet = new Set<TileRef>();
    for (const t of tilledTiles) asSet.add(t);
    setBuild.push(performance.now() - t0);

    t0 = performance.now();
    const asMask = new Uint8Array(n);
    for (const t of tilledTiles) asMask[t] = 1;
    maskBuild.push(performance.now() - t0);

    // Defeat dead-code elimination.
    if (asMap.size + asPlane.length + asSet.size + asMask.length === -1) {
      log("unreachable");
    }
  }

  // ── READ: random access, which is what the consumers actually do.
  const asMap = new Map<TileRef, number>();
  for (const [t, c] of entries) asMap.set(t, c);
  const asPlane = new Int32Array(n).fill(-1);
  for (const [t, c] of entries) asPlane[t] = c;
  const probes = entries.map(([t]) => t);
  const mapRead: number[] = [];
  const planeRead: number[] = [];
  for (let r = 0; r < reps; r++) {
    let acc = 0;
    let t0 = performance.now();
    for (const t of probes) acc += asMap.get(t) ?? 0;
    mapRead.push(performance.now() - t0);

    t0 = performance.now();
    for (const t of probes) acc += asPlane[t];
    planeRead.push(performance.now() - t0);
    if (acc === -1) log("unreachable");
  }

  const ratio = (a: number, b: number): string =>
    `${(a / Math.max(b, 1e-9)).toFixed(1)}×`;
  const mb = median(mapBuild);
  const pb = median(planeBuild);
  const sb = median(setBuild);
  const kb = median(maskBuild);
  const mr = median(mapRead);
  const pr = median(planeRead);
  log("");
  log(
    `build cellOf   Map ${mb.toFixed(2)} ms   plane ${pb.toFixed(2)} ms   → ${ratio(mb, pb)} cheaper`,
  );
  log(
    `build tilled   Set ${sb.toFixed(2)} ms   mask  ${kb.toFixed(2)} ms   → ${ratio(sb, kb)} cheaper`,
  );
  log(
    `read  ${probes.length} lookups  Map ${mr.toFixed(2)} ms   plane ${pr.toFixed(2)} ms   → ${ratio(mr, pr)} cheaper`,
  );
  log("");
  log(
    `one refresh cadence rebuilds cellOf + potential + tilled + ranked;` +
      ` on the two per-tile Maps alone that is ${(2 * mb).toFixed(1)} ms of hashing` +
      ` against ${(2 * pb).toFixed(1)} ms of plane writes.`,
  );
}

void main();
