/**
 * Food-shed GPU spike, part 1: dump a REAL food-shed from a real game so the
 * WESL flood can be diffed against it rather than against a re-implementation.
 *
 * Runs a seeded headless game, picks the player with the most territory, and
 * writes that player's flood INPUTS (owned-and-passable mask, per-tile farm
 * maturity) alongside the CPU's OUTPUTS (nearest-farm cell, step distance) as
 * raw binary planes plus a small JSON manifest.
 *
 *   npx tsx tests/perf/balance/ShedReference.ts --map verdantia --ticks 900 --out <dir>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import {
  foodShedField,
  foodShedPotential,
} from "../../../src/core/execution/utils/FoodShed";
import { supplyField } from "../../../src/core/execution/utils/SupplyField";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  Player,
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

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

class RefConfig extends Config {
  constructor(gc: GameConfig) {
    super(gc, new UserSettings(), false);
  }
  override isReplay(): boolean {
    return false;
  }
}

async function main(): Promise<void> {
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  const log = console.log;
  console.log = () => {};

  const mapName = arg("map", "verdantia");
  const ticks = Number(arg("ticks", "900"));
  const seed = arg("seed", "shedref");
  const outDir = arg("out", path.join(PROJECT_ROOT, "shed-ref"));

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
    new RefConfig(gameConfig),
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
  const gmap = game.map();
  const alive: Player[] = game.players().filter((p) => p.isAlive());
  if (alive.length === 0) throw new Error("no living player");

  // INPUT 1: per-tile owner smallID, masked by the flood's gate (land, passable
  // and owned) — exactly the predicate the CPU BFS applies before stepping onto
  // a tile, generalised from "owned by THIS player" to "owned by someone", so a
  // single dispatch can flood every nation inside its own borders at once.
  const owner = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    const o = gmap.ownerID(t);
    if (o === 0) continue;
    if (!gmap.isLand(t) || gmap.isImpassable(t)) continue;
    owner[t] = o;
  }
  // INPUT 2: seed maturity per farm tile, for EVERY player (max when two farms
  // share a tile, matching the CPU's seeding rule). 0 marks "not a farm".
  const farmMaturity = new Float32Array(n);
  let farmCount = 0;
  for (const p of alive) {
    const smallID = p.smallID();
    for (const farm of p.units(UnitType.Farmland)) {
      if (farm.isUnderConstruction()) continue;
      const t = Number(farm.tile());
      if (gmap.ownerID(t) !== smallID) continue;
      const m = p.farmMaturity(t) / 1000;
      if (farmMaturity[t] === 0) farmCount += 1;
      farmMaturity[t] = Math.max(farmMaturity[t], m);
    }
  }

  // INPUT 3: the military supply sources — the Core plus every completed
  // Settlement standing on its owner's ground (SupplyField.recompute's
  // `addSource` predicate).
  const supplyNode = new Uint32Array(n);
  let nodeCount = 0;
  for (const p of alive) {
    const smallID = p.smallID();
    const core = p.core();
    if (core !== null && gmap.ownerID(core) === smallID) {
      if (supplyNode[Number(core)] === 0) nodeCount += 1;
      supplyNode[Number(core)] = 1;
    }
    for (const node of p.units(UnitType.Settlement)) {
      if (node.isUnderConstruction()) continue;
      const t = Number(node.tile());
      if (gmap.ownerID(t) !== smallID) continue;
      if (supplyNode[t] === 0) nodeCount += 1;
      supplyNode[t] = 1;
    }
  }

  // OUTPUT: every player's own fields, computed by the real implementations and
  // merged into one plane each. Tiles belong to exactly one player, so the
  // per-player fields cannot collide.
  const cell = new Int32Array(n).fill(-1);
  const potential = new Float32Array(n);
  const supplyDist = new Int32Array(n).fill(-1);
  let shedTiles = 0;
  let supplyTiles = 0;
  for (const p of alive) {
    const shed = foodShedField(game, p);
    for (const t of shed.tiles) {
      cell[t] = shed.cellAt(t);
      potential[t] = foodShedPotential(game, shed, t);
    }
    shedTiles += shed.tiles.length;
    const supply = supplyField(game, p);
    for (const [t, d] of supply.dist) supplyDist[t] = d;
    supplyTiles += supply.dist.size;
  }
  const subject = alive.reduce((a, b) =>
    b.numTilesOwned() > a.numTilesOwned() ? b : a,
  );

  fs.mkdirSync(outDir, { recursive: true });
  const write = (name: string, view: ArrayBufferView) =>
    fs.writeFileSync(
      path.join(outDir, name),
      Buffer.from(view.buffer, view.byteOffset, view.byteLength),
    );
  write("owner.bin", owner);
  write("farmMaturity.bin", farmMaturity);
  write("cell.bin", cell);
  write("potential.bin", potential);
  write("supplyNode.bin", supplyNode);
  write("supplyDist.bin", supplyDist);
  const f = game.config().food();
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        map: mapName,
        width,
        height,
        seed,
        ticks: game.ticks(),
        players: alive.length,
        largest: subject.displayName(),
        largestTiles: subject.numTilesOwned(),
        farms: farmCount,
        shedTiles,
        supplyNodes: nodeCount,
        supplyTiles,
        supplyRadius: f.supplyRadius,
        supplyDecayPower: f.supplyDecayPower,
        supplyCutoff: Math.ceil(f.supplyRadius * 3),
        foodShedRadius: f.foodShedRadius,
        foodShedPower: f.foodShedPower,
        cutoff: Math.ceil(f.foodShedRadius * 3),
      },
      null,
      2,
    ),
  );
  log(
    `${mapName} ${width}x${height} tick=${game.ticks()} players=${alive.length} ` +
      `farms=${farmCount} shedTiles=${shedTiles} ` +
      `cutoff=${Math.ceil(f.foodShedRadius * 3)} → ${outDir}`,
  );
}

void main();
