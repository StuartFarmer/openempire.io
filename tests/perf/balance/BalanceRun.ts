/**
 * Balance harness for the tribal food economy (openspec
 * add-tribal-food-economy, capability balance-harness).
 *
 * Runs N seeded, headless bot games (real Config + nations + bots, the same
 * assembly as FullGamePerf) on a layered map and emits per-game time series
 * of the snowball signals:
 *
 *   - leader territory share and territory Gini over time
 *   - total population, food stock, production/consumption, starvation
 *   - time to first elimination, alive counts, final leader share
 *
 * Food knobs are overridable per invocation so a sweep (values × seeds) can
 * be scripted. Deterministic: same seed + same overrides ⇒ identical output
 * (verify with --check-repro).
 *
 * Usage:
 *   npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 3 \
 *       [--ticks 3000] [--bots 40] [--sample 50] [--seed-prefix bal] \
 *       [--override starvationDeathFraction=0.05]... [--out balance.json] \
 *       [--check-repro]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Config, FoodConfig } from "../../../src/core/configuration/Config";
import { Executor } from "../../../src/core/execution/ExecutionManager";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  Player,
  UnitType,
} from "../../../src/core/game/Game";
import { createGame } from "../../../src/core/game/GameImpl";
import { GameUpdateType, HashUpdate } from "../../../src/core/game/GameUpdates";
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
const MAX_SPAWN_TURNS = 1000;

// ── CLI ──

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function collectOverrides(): Partial<FoodConfig> {
  const overrides: Record<string, number> = {};
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--override") {
      const [key, value] = (process.argv[i + 1] ?? "").split("=");
      if (!key || value === undefined || Number.isNaN(Number(value))) {
        throw new Error(`bad --override "${process.argv[i + 1]}"`);
      }
      overrides[key] = Number(value);
    }
  }
  return overrides as Partial<FoodConfig>;
}

function resolveMap(name: string): GameMapType {
  const key = Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) throw new Error(`unknown map: ${name}`);
  return GameMapType[key as keyof typeof GameMapType];
}

// ── Config with food-knob overrides ──

class SweepConfig extends Config {
  private merged: FoodConfig | null = null;
  constructor(
    gameConfig: GameConfig,
    userSettings: UserSettings | null,
    isReplay: boolean,
    private overrides: Partial<FoodConfig>,
  ) {
    super(gameConfig, userSettings, isReplay);
  }
  override food(): FoodConfig {
    this.merged ??= { ...super.food(), ...this.overrides };
    return this.merged;
  }
}

// ── Metrics ──

interface Sample {
  tick: number;
  alive: number;
  leaderShare: number;
  gini: number;
  totalTroops: number;
  totalFood: number;
  production: number;
  consumption: number;
  starved: number;
}

interface RunResult {
  seed: string;
  spawnTurns: number;
  series: Sample[];
  firstElimTick: number | null;
  finalLeaderShare: number;
  finalAlive: number;
  /** Structure counts across alive players at the end of the run. */
  structures: Record<string, number>;
  stateHash: number | null;
}

function gini(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (i + 1) * sorted[i];
  }
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function sampleGame(tick: number, players: Player[]): Sample {
  const alive = players.filter((p) => p.isAlive());
  const tiles = alive.map((p) => p.numTilesOwned());
  const totalTiles = tiles.reduce((a, b) => a + b, 0);
  let production = 0;
  let consumption = 0;
  let starved = 0;
  let totalFood = 0;
  for (const p of alive) {
    const flow = p.foodFlow();
    production += flow.production;
    consumption += flow.consumption;
    starved += flow.starvedTroops;
    totalFood += Number(p.food());
  }
  return {
    tick,
    alive: alive.length,
    leaderShare: totalTiles === 0 ? 0 : Math.max(0, ...tiles) / totalTiles,
    gini: gini(tiles),
    totalTroops: alive.reduce((a, p) => a + p.troops(), 0),
    totalFood,
    production,
    consumption,
    starved,
  };
}

// ── One run ──

async function runOne(
  map: GameMapType,
  seed: string,
  ticks: number,
  bots: number,
  nationCount: number,
  sampleEvery: number,
  overrides: Partial<FoodConfig>,
  difficulty: Difficulty,
): Promise<RunResult> {
  const gameConfig: GameConfig = {
    gameMap: map,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty,
    // Generated maps carry no manifest nations — request procedural ones.
    // Nations (not plain bots) are what exercise the tribal build behavior.
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

  const config = new SweepConfig(gameConfig, null, false, overrides);
  // Build maps fresh per run: loadTerrainMap caches GameMapImpl instances,
  // whose mutable tile state would leak the previous run's game into the
  // next and break same-seed reproducibility.
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

  let lastHash: HashUpdate | undefined;
  let fatalError: string | undefined;
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    (gu) => {
      if ("errMsg" in gu) {
        fatalError = `${gu.errMsg}\n${gu.stack ?? ""}`;
        return;
      }
      const hashes = gu.updates[GameUpdateType.Hash] as HashUpdate[];
      if (hashes.length > 0) lastHash = hashes[hashes.length - 1];
    },
  );
  runner.init();

  let turnNumber = 0;
  const runTick = (): boolean => {
    runner.addTurn({ turnNumber: turnNumber++, intents: [] });
    return runner.executeNextTick() && fatalError === undefined;
  };

  while (game.inSpawnPhase()) {
    if (turnNumber >= MAX_SPAWN_TURNS) {
      throw new Error("spawn phase did not end");
    }
    if (!runTick()) throw new Error(`spawn phase error:\n${fatalError}`);
  }
  const spawnTurns = turnNumber;

  const spawnedCount = game.players().filter((p) => p.isAlive()).length;
  const series: Sample[] = [];
  let firstElimTick: number | null = null;
  for (let i = 0; i < ticks; i++) {
    if (!runTick()) throw new Error(`tick ${game.ticks()}:\n${fatalError}`);
    if (i % sampleEvery === 0 || i === ticks - 1) {
      const s = sampleGame(game.ticks(), game.players());
      series.push(s);
      if (firstElimTick === null && s.alive < spawnedCount) {
        firstElimTick = s.tick;
      }
    }
  }

  const last = series[series.length - 1];
  // Urban-core-growth census: built area is the density field, not plots.
  const structures: Record<string, number> = {};
  let urbanAreaTotal = 0;
  let urbanAreaMax = 0;
  let cities = 0;
  let topP: Player | null = null;
  let topPop = -1;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const a = p.urbanArea();
    urbanAreaTotal += a;
    urbanAreaMax = Math.max(urbanAreaMax, a);
    if (p.troops() > topPop) {
      topPop = p.troops();
      topP = p;
    }
    if (p.core() !== null) cities++;
  }
  structures.UrbanAreaTotal = Math.round(urbanAreaTotal);
  structures.UrbanAreaMax = Math.round(urbanAreaMax);
  structures.MaxCityKm2 = Math.round(game.config().urbanAreaKm2(urbanAreaMax));
  structures.Cities = cities;
  // Diagnostic: is the top nation's "sprawl" grown tiles or just settlement
  // seeds? Settlements each seed one tile; grown = urbanArea − settlements.
  if (topP !== null) {
    const settlements = topP
      .units(UnitType.Settlement)
      .filter(
        (u: { isUnderConstruction(): boolean }) => !u.isUnderConstruction(),
      ).length;
    const farms = topP
      .units(UnitType.Farmland)
      .filter(
        (u: { isUnderConstruction(): boolean }) => !u.isUnderConstruction(),
      ).length;
    structures.TopSettlements = settlements;
    structures.TopFarms = farms;
    structures.TopCityTiles = Math.round(topP.urbanArea());
    structures.TopPopulation = topP.troops();
    structures.TopCapacity = topP.foodFlow().capacity;
  }
  return {
    seed,
    spawnTurns,
    series,
    firstElimTick,
    finalLeaderShare: last.leaderShare,
    finalAlive: last.alive,
    structures,
    stateHash: lastHash?.hash ?? null,
  };
}

// ── Main ──

async function main(): Promise<void> {
  console.debug = () => {};
  const consoleLog = console.log;
  console.log = () => {}; // silence engine chatter; restored for the report

  const map = resolveMap(arg("map", "verdantia")!);
  const runs = Number(arg("runs", "3"));
  const ticks = Number(arg("ticks", "3000"));
  const bots = Number(arg("bots", "40"));
  const nationCount = Number(arg("nations", "20"));
  const sampleEvery = Number(arg("sample", "50"));
  const seedPrefix = arg("seed-prefix", "bal")!;
  const difficultyArg = arg("difficulty", "Medium")!;
  const difficulty = (Object.values(Difficulty) as string[]).includes(
    difficultyArg,
  )
    ? (difficultyArg as Difficulty)
    : (() => {
        throw new Error(`unknown difficulty: ${difficultyArg}`);
      })();
  const out = arg("out");
  const overrides = collectOverrides();
  const checkRepro = process.argv.includes("--check-repro");

  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) {
    const seed = `${seedPrefix}-${i}`;
    results.push(
      await runOne(
        map,
        seed,
        ticks,
        bots,
        nationCount,
        sampleEvery,
        overrides,
        difficulty,
      ),
    );
    consoleLog(
      `run ${seed}: alive ${results[i].finalAlive}, leader ${(results[i].finalLeaderShare * 100).toFixed(1)}%, ` +
        `gini ${results[i].series[results[i].series.length - 1].gini.toFixed(3)}, firstElim ${results[i].firstElimTick ?? "—"}, hash ${results[i].stateHash}\n` +
        `  structures: ${JSON.stringify(results[i].structures)}`,
    );
  }

  if (checkRepro) {
    const again = await runOne(
      map,
      `${seedPrefix}-0`,
      ticks,
      bots,
      nationCount,
      sampleEvery,
      overrides,
      difficulty,
    );
    const same = JSON.stringify(again) === JSON.stringify(results[0]);
    consoleLog(`repro check: ${same ? "IDENTICAL" : "MISMATCH"}`);
    if (!same) process.exitCode = 1;
  }

  const finals = results.map((r) => r.finalLeaderShare);
  const summary = {
    map: arg("map", "verdantia"),
    ticks,
    bots,
    overrides,
    meanFinalLeaderShare: finals.reduce((a, b) => a + b, 0) / finals.length,
    maxFinalLeaderShare: Math.max(...finals),
    meanFinalGini:
      results.reduce((a, r) => a + r.series[r.series.length - 1].gini, 0) /
      results.length,
    totalStarved: results.reduce(
      (a, r) => a + r.series.reduce((x, s) => x + s.starved, 0),
      0,
    ),
  };
  consoleLog(`summary: ${JSON.stringify(summary, null, 2)}`);

  if (out) {
    fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
    consoleLog(`wrote ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
