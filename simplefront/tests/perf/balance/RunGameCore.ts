/**
 * The PORTABLE half of the balance run core — no `fs`, no `path`, no `crypto`,
 * so it runs unchanged in a browser worker.
 *
 * That split exists because the sim is moving onto the GPU, and Node has no
 * WebGPU (the `webgpu` npm package is stale Dawn bindings, not a foundation).
 * A GPU-resident sim can therefore only be exercised under headless Chromium —
 * which the injection harness already proves works. Rather than write a second
 * runner for the browser and watch the two drift, the metrics, sampling,
 * scaling fit and config overrides live HERE, once, and each host supplies only
 * the map bytes:
 *
 *   RunGame.ts                     Node   — reads sidecars off disk
 *   src/client/economy/BalanceGame.worker.ts   browser — fetches them
 *
 * Comparability is the entire point of the harness, so one implementation of
 * the numbers is not a stylistic preference — two would silently diverge and
 * every cross-host comparison would be meaningless.
 */
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
import { createNationsForGame } from "../../../src/core/game/NationCreation";
import {
  genTerrainFromBin,
  MapManifest,
} from "../../../src/core/game/TerrainMapLoader";
import { UserSettings } from "../../../src/core/game/UserSettings";
import { GameRunner } from "../../../src/core/GameRunner";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import { GameConfig, GameStartInfo } from "../../../src/core/Schemas";
import { simpleHash } from "../../../src/core/Util";

const MAX_SPAWN_TURNS = 1000;

// ── Spec ──

export interface RunSpec {
  map: GameMapType;
  seed: string;
  ticks: number;
  bots: number;
  nations: number;
  sampleEvery: number;
  difficulty: Difficulty;
  overrides: Partial<FoodConfig>;
}

export interface Sample {
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

/** One (perimeter, area, population) observation of one nation at one tick —
 *  the raw material of the geometric scaling law (design.md §6). */
export interface ScalingObs {
  tick: number;
  area: number;
  border: number;
  pop: number;
  troops: number;
}

export interface RunResult {
  seed: string;
  spawnTurns: number;
  series: Sample[];
  /** Per-nation scaling observations, one per alive nation per sample tick. */
  scaling: ScalingObs[];
  firstElimTick: number | null;
  finalLeaderShare: number;
  finalAlive: number;
  /** Structure counts across alive players at the end of the run. */
  structures: Record<string, number>;
  stateHash: number | null;
  /** Wall-clock cost. Excluded from determinism comparisons. */
  wallMs: number;
}

// ── Config with food-knob overrides ──

export class SweepConfig extends Config {
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

// ── Map bytes cache ──

export interface MapBytes {
  manifest: MapManifest;
  terrain: Uint8Array;
  mini: Uint8Array;
  /** Read-only in GameMapImpl, so safe to share across runs. */
  layers: Uint8Array | null;
}

// ── Metrics ──

/**
 * OLS log-log fit of A ∝ P^k over the observations (x = ln border,
 * y = ln area): the empirical area↔perimeter exponent — the anti-snowball
 * basis (rework-settlement-ecology, design.md §6). Specks are filtered so
 * one-tile nations don't drown the signal.
 */
export function fitScaling(obs: ScalingObs[]): {
  k: number;
  r2: number;
  n: number;
} {
  const pts = obs.filter((o) => o.area >= 30 && o.border >= 4);
  const n = pts.length;
  if (n < 8) return { k: NaN, r2: NaN, n };
  let sx = 0,
    sy = 0;
  for (const o of pts) {
    sx += Math.log(o.border);
    sy += Math.log(o.area);
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const o of pts) {
    const dx = Math.log(o.border) - mx;
    const dy = Math.log(o.area) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { k: NaN, r2: NaN, n };
  const k = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { k, r2, n };
}

export function gini(values: number[]): number {
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

export async function runGameWith(
  spec: RunSpec,
  bytes: MapBytes,
): Promise<RunResult> {
  const t0 = performance.now();
  const gameConfig: GameConfig = {
    gameMap: spec.map,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: spec.difficulty,
    // Generated maps carry no manifest nations — request procedural ones.
    // Nations (not plain bots) are what exercise the tribal build behavior.
    nations: spec.nations,
    donateGold: false,
    donateTroops: false,
    bots: spec.bots,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const gameStart: GameStartInfo = {
    gameID: spec.seed,
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };

  const config = new SweepConfig(gameConfig, null, false, spec.overrides);
  const manifest = bytes.manifest;
  const gameMap = await genTerrainFromBin(
    manifest.map,
    bytes.terrain.slice(),
    bytes.layers,
  );
  const miniGameMap = await genTerrainFromBin(
    manifest.map4x,
    bytes.mini.slice(),
  );
  const random = new PseudoRandom(simpleHash(spec.seed));
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
  const scaling: ScalingObs[] = [];
  let firstElimTick: number | null = null;
  for (let i = 0; i < spec.ticks; i++) {
    if (!runTick()) throw new Error(`tick ${game.ticks()}:\n${fatalError}`);
    if (i % spec.sampleEvery === 0 || i === spec.ticks - 1) {
      const s = sampleGame(game.ticks(), game.players());
      series.push(s);
      if (firstElimTick === null && s.alive < spawnedCount) {
        firstElimTick = s.tick;
      }
      // Scaling-law observations: one (P, A, pop) point per alive nation.
      for (const p of game.players()) {
        if (!p.isAlive()) continue;
        scaling.push({
          tick: game.ticks(),
          area: p.numTilesOwned(),
          border: p.borderTiles().size,
          pop: p.foodFlow().population,
          troops: p.troops(),
        });
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
  structures.Cities = cities;
  // Diagnostic: is the top nation's "sprawl" grown tiles or just settlement
  // seeds? Settlements each seed one tile; grown = urbanArea − settlements.
  if (topP !== null) {
    const built = (type: UnitType) =>
      topP!
        .units(type)
        .filter(
          (u: { isUnderConstruction(): boolean }) => !u.isUnderConstruction(),
        ).length;
    structures.TopSettlements = built(UnitType.Settlement);
    structures.TopFarms = built(UnitType.Farmland);
    structures.TopCityTiles = Math.round(topP.urbanArea());
    structures.TopPopulation = topP.troops();
    structures.TopCapacity = topP.foodFlow().capacity;
  }
  return {
    seed: spec.seed,
    spawnTurns,
    series,
    scaling,
    firstElimTick,
    finalLeaderShare: last.leaderShare,
    finalAlive: last.alive,
    structures,
    stateHash: lastHash?.hash ?? null,
    wallMs: Math.round(performance.now() - t0),
  };
}

// ── Flat metric record (the sweep's y-axis vocabulary) ──

/**
 * Every number a sweep can target, constrain, or plot. Flat and finite by
 * construction so `target: {metric: ...}` in a sweep config can name any of
 * them and the report can treat them uniformly.
 */
export interface RunMetrics {
  finalLeaderShare: number;
  peakLeaderShare: number;
  /**
   * How far the top position fell back from its high-water mark
   * (peakLeaderShare − finalLeaderShare): the comeback signal. Zero means
   * whoever got ahead stayed ahead; large means a runaway leader was pushed
   * back down. Computed per run rather than by differencing two aggregates,
   * so `max_`/`std_` mean what they look like they mean.
   *
   * Note the peak and the final leader need not be the same player — this is
   * concentration falling, not one nation's personal decline.
   */
  leaderDrawdown: number;
  finalGini: number;
  peakGini: number;
  finalAlive: number;
  /** Censored at the run horizon when nobody was eliminated. */
  firstElimTick: number;
  /** 1 when nobody was eliminated, so censored rows can be excluded. */
  elimCensored: number;
  totalStarved: number;
  finalTotalTroops: number;
  finalTotalFood: number;
  finalProduction: number;
  finalConsumption: number;
  scalingExponent: number;
  scalingR2: number;
  urbanAreaTotal: number;
  urbanAreaMax: number;
  cities: number;
  topPopulation: number;
  topFarms: number;
  topSettlements: number;
  topCityTiles: number;
  topCapacity: number;
  wallMs: number;
}

export const METRIC_KEYS = [
  "finalLeaderShare",
  "peakLeaderShare",
  "leaderDrawdown",
  "finalGini",
  "peakGini",
  "finalAlive",
  "firstElimTick",
  "elimCensored",
  "totalStarved",
  "finalTotalTroops",
  "finalTotalFood",
  "finalProduction",
  "finalConsumption",
  "scalingExponent",
  "scalingR2",
  "urbanAreaTotal",
  "urbanAreaMax",
  "cities",
  "topPopulation",
  "topFarms",
  "topSettlements",
  "topCityTiles",
  "topCapacity",
  "wallMs",
] as const satisfies readonly (keyof RunMetrics)[];

export function metricsOf(r: RunResult, horizonTicks: number): RunMetrics {
  const last = r.series[r.series.length - 1];
  const fit = fitScaling(r.scaling);
  const s = r.structures;
  const peakLeaderShare = Math.max(...r.series.map((x) => x.leaderShare));
  return {
    finalLeaderShare: last.leaderShare,
    peakLeaderShare,
    leaderDrawdown: peakLeaderShare - last.leaderShare,
    finalGini: last.gini,
    peakGini: Math.max(...r.series.map((x) => x.gini)),
    finalAlive: last.alive,
    firstElimTick: r.firstElimTick ?? horizonTicks,
    elimCensored: r.firstElimTick === null ? 1 : 0,
    totalStarved: r.series.reduce((a, x) => a + x.starved, 0),
    finalTotalTroops: last.totalTroops,
    finalTotalFood: last.totalFood,
    finalProduction: last.production,
    finalConsumption: last.consumption,
    scalingExponent: Number.isFinite(fit.k) ? fit.k : 0,
    scalingR2: Number.isFinite(fit.r2) ? fit.r2 : 0,
    urbanAreaTotal: s.UrbanAreaTotal ?? 0,
    urbanAreaMax: s.UrbanAreaMax ?? 0,
    cities: s.Cities ?? 0,
    topPopulation: s.TopPopulation ?? 0,
    topFarms: s.TopFarms ?? 0,
    topSettlements: s.TopSettlements ?? 0,
    topCityTiles: s.TopCityTiles ?? 0,
    topCapacity: s.TopCapacity ?? 0,
    wallMs: r.wallMs,
  };
}

/**
 * Collapse a cell's per-seed metrics into `mean_*` / `max_*` / `std_*` fields.
 * `std_` is the across-seed spread: a config that only hits the target on one
 * lucky seed is not a solution, and this is how the report can say so.
 */
export function aggregate(rows: RunMetrics[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of METRIC_KEYS) {
    const vs = rows.map((r) => r[key]);
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const variance =
      vs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vs.length;
    out[`mean_${key}`] = mean;
    out[`max_${key}`] = Math.max(...vs);
    out[`min_${key}`] = Math.min(...vs);
    out[`std_${key}`] = Math.sqrt(variance);
  }
  return out;
}

export const AGGREGATED_METRIC_KEYS: string[] = METRIC_KEYS.flatMap((k) => [
  `mean_${k}`,
  `max_${k}`,
  `min_${k}`,
  `std_${k}`,
]);
