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
 * For a scripted parameter space rather than one config at a time, see the
 * sweep driver: `npx tsx tests/perf/balance/Sweep.ts <config.yaml>`.
 *
 * Usage:
 *   npx tsx tests/perf/balance/BalanceRun.ts --map verdantia --runs 3 \
 *       [--ticks 3000] [--bots 40] [--sample 50] [--seed-prefix bal] \
 *       [--override starvationDeathFraction=0.05]... [--out balance.json] \
 *       [--preset resources/food-presets/flat-a.json] [--check-repro]
 */
import fs from "fs";
import { FoodConfig } from "../../../src/core/configuration/Config";
import { Difficulty, GameMapType } from "../../../src/core/game/Game";
import { fitScaling, runGame, RunResult } from "./RunGame";
import { loadPresetOverrides } from "./sweep/Presets";

// ── CLI ──

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function collectOverrides(): Partial<FoodConfig> {
  const overrides: Record<string, number> = {};
  const preset = arg("preset");
  if (preset !== undefined) {
    Object.assign(overrides, loadPresetOverrides(preset));
  }
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

export function resolveMap(name: string): GameMapType {
  const key = Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) throw new Error(`unknown map: ${name}`);
  return GameMapType[key as keyof typeof GameMapType];
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

  const spec = (seed: string) => ({
    map,
    seed,
    ticks,
    bots,
    nations: nationCount,
    sampleEvery,
    difficulty,
    overrides,
  });

  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) {
    const seed = `${seedPrefix}-${i}`;
    results.push(await runGame(spec(seed)));
    consoleLog(
      `run ${seed}: alive ${results[i].finalAlive}, leader ${(results[i].finalLeaderShare * 100).toFixed(1)}%, ` +
        `gini ${results[i].series[results[i].series.length - 1].gini.toFixed(3)}, firstElim ${results[i].firstElimTick ?? "—"}, hash ${results[i].stateHash}\n` +
        `  structures: ${JSON.stringify(results[i].structures)}`,
    );
  }

  if (checkRepro) {
    const again = await runGame(spec(`${seedPrefix}-0`));
    // wallMs is the one field that legitimately varies between two identical
    // runs, so it is excluded from the comparison.
    const strip = (r: RunResult) => JSON.stringify({ ...r, wallMs: 0 });
    const same = strip(again) === strip(results[0]);
    consoleLog(`repro check: ${same ? "IDENTICAL" : "MISMATCH"}`);
    if (!same) process.exitCode = 1;
  }

  // The geometric scaling law (design.md §6): fit A ∝ P^k per run and over
  // the pooled observations. The pooled k is the scalingExponent candidate.
  const allObs = results.flatMap((r) => r.scaling);
  const pooled = fitScaling(allObs);
  for (const r of results) {
    const f = fitScaling(r.scaling);
    consoleLog(
      `scaling ${r.seed}: k=${f.k.toFixed(3)} (R²=${f.r2.toFixed(3)}, n=${f.n})`,
    );
  }
  consoleLog(
    `scaling POOLED: A ∝ P^${pooled.k.toFixed(3)} ` +
      `(R²=${pooled.r2.toFixed(3)}, n=${pooled.n}) — scalingExponent candidate`,
  );

  const finals = results.map((r) => r.finalLeaderShare);
  const summary = {
    scalingExponent: Number(pooled.k.toFixed(3)),
    scalingR2: Number(pooled.r2.toFixed(3)),
    scalingN: pooled.n,
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
