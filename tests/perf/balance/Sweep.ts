/**
 * Sweep driver for the balance harness.
 *
 * Runs a parameter space of food-economy configs as seeded headless bot
 * games, in parallel, and reports the parameter → metric mapping: which
 * knobs move which signal, which configurations land inside a target band,
 * and a diverse handful of those exported as playable presets.
 *
 *   npx tsx tests/perf/balance/Sweep.ts tests/perf/balance/sweeps/example.yaml
 *
 * Options:
 *   --out <dir>        results directory (default tests/perf/balance/out/<name>)
 *   --concurrency <n>  parallel games (default cores − 2)
 *   --resume           reuse results.jsonl rows from a previous invocation
 *   --dry-run          expand the space and print the plan, run nothing
 *   --no-presets       skip writing preset files
 *   --samples <n>      override the config's sample budget
 *
 * Outputs, all under the results directory:
 *   results.jsonl      one row per cell (params + aggregated metrics)
 *   report.md          markdown tables, also printed to stdout
 *   report.html        self-contained interactive report
 * plus presets in resources/food-presets/ when `presets:` is set.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { FoodPreset } from "../../../src/core/configuration/FoodPreset";
import { Difficulty } from "../../../src/core/game/Game";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import {
  aggregate,
  METRIC_KEYS,
  PROJECT_ROOT,
  RunMetrics,
  RunSpec,
  simFingerprint,
} from "./RunGame";
import {
  bandRanges,
  CellResult,
  objectiveValue,
  orderFront,
  paretoFront,
  rankCells,
  selectDiverse,
  selectFrontSpread,
  sensitivities,
  solutionsOf,
} from "./sweep/Analyze";
import { runBrowserPool } from "./sweep/BrowserPool";
import {
  nonDefaultOverrides,
  overridesOf,
  parseSweepConfig,
  resolveMapName,
  Scalar,
  SweepDefinition,
} from "./sweep/Config";
import { cellsFrom, nextGeneration, truncate } from "./sweep/Evolve";
import { Job, JobOutcome, runPool } from "./sweep/Pool";
import {
  clearPresets,
  PRESET_DIR,
  presetSlug,
  writePreset,
} from "./sweep/Presets";
import { htmlReport, markdownReport } from "./sweep/Report";
import { Cell, expandSpace } from "./sweep/Space";

// ── CLI ──

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Seeds are shared across every cell, so cells are compared paired. */
function seedName(i: number): string {
  return `bal-${i}`;
}

function specFor(def: SweepDefinition, cell: Cell, seedIndex: number): RunSpec {
  const p = cell.params;
  const num = (key: string, fallback: number): number =>
    typeof p[key] === "number" ? (p[key] as number) : fallback;
  return {
    map: p.map === undefined ? def.run.map : resolveMapName(String(p.map)),
    seed: seedName(seedIndex),
    ticks: num("ticks", def.run.ticks),
    bots: num("bots", def.run.bots),
    nations: num("nations", def.run.nations),
    sampleEvery: num("sample", def.run.sample),
    difficulty:
      p.difficulty === undefined
        ? def.run.difficulty
        : (String(p.difficulty) as Difficulty),
    overrides: overridesOf(p),
  };
}

/** Which metrics headline the report: whatever the config targets, then the
 *  standard snowball signals, deduped and capped so tables stay readable. */
function headlineMetrics(def: SweepDefinition): string[] {
  const wanted = [
    ...def.targets.map((t) => t.metric),
    ...def.constraints.map((c) => c.metric),
    "mean_finalGini",
    "mean_finalLeaderShare",
    "mean_finalAlive",
    "mean_totalStarved",
    "mean_urbanAreaTotal",
  ];
  return [...new Set(wanted)].slice(0, 7);
}

function progressLine(done: number, total: number, startedAt: number): string {
  const elapsed = (performance.now() - startedAt) / 1000;
  const rate = done / Math.max(elapsed, 0.001);
  const eta = rate > 0 ? (total - done) / rate : 0;
  const width = 28;
  const filled = Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `  ${bar} ${done}/${total} games · ${rate.toFixed(1)}/s · elapsed ${mmss(elapsed)} · eta ${mmss(eta)}`;
}

// ── resume ──

interface StoredRow {
  cellId: string;
  /** Content hash of src/core when this row was measured (see simFingerprint). */
  sim: string;
  /** Which nsga2 generation first evaluated this cell; 0 for other methods. */
  generation: number;
  params: Record<string, Scalar>;
  swept: Record<string, Scalar>;
  seeds: string[];
  perSeed: Record<string, number>[];
  hashes: (number | null)[];
  metrics: Record<string, number>;
  errors: string[];
}

/**
 * Reusable rows from a previous invocation. Rows measured against a different
 * `src/core` are dropped, not reused: mixing results from two versions of the
 * sim into one report would be indistinguishable from a real effect.
 */
function loadPrevious(
  file: string,
  sim: string,
): { rows: Map<string, StoredRow>; stale: number } {
  const rows = new Map<string, StoredRow>();
  let stale = 0;
  if (!fs.existsSync(file)) return { rows, stale };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const row = JSON.parse(line) as StoredRow;
      if (row.cellId === undefined || row.errors?.length !== 0) continue;
      if (row.sim !== sim) {
        stale++;
        continue;
      }
      rows.set(row.cellId, row);
    } catch {
      // A truncated final line from an interrupted run — ignore it.
    }
  }
  return { rows, stale };
}

// ── main ──

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (configPath === undefined || configPath.startsWith("--")) {
    console.error(
      "usage: npx tsx tests/perf/balance/Sweep.ts <config.yaml> [options]\n" +
        "       see tests/perf/balance/sweeps/ for example configs",
    );
    process.exit(1);
  }
  if (!fs.existsSync(configPath)) {
    console.error(`sweep config not found: ${configPath}`);
    process.exit(1);
  }

  const def = parseSweepConfig(
    fs.readFileSync(configPath, "utf8"),
    path.basename(configPath),
  );
  const samplesOverride = opt("samples");
  if (samplesOverride !== undefined) def.samples = Number(samplesOverride);

  const outDir =
    opt("out") ?? path.join(PROJECT_ROOT, "tests/perf/balance/out", def.name);
  const concurrency =
    Number(opt("concurrency") ?? def.concurrency) ||
    Math.max(1, os.cpus().length - 2);
  // --gpu runs every game in headless Chromium instead of a forked child.
  // Node has no WebGPU, so once the sim is GPU-resident this is the only host
  // that can run a sweep at all. Identical contract; see sweep/BrowserPool.ts.
  const useGpu = process.argv.includes("--gpu");
  const pool = useGpu ? runBrowserPool : runPool;

  const sweptNames = def.params
    .filter((p) => p.kind !== "fixed")
    .map((p) => p.name);
  const pinned = def.params.filter((p) => p.kind === "fixed");

  // nsga2 seeds generation 0 with a random draw of `population` cells; the
  // other methods enumerate their whole space up front.
  const evolving = def.method === "nsga2";
  const initialCells = evolving
    ? expandSpace({ ...def, method: "random", samples: def.population })
    : expandSpace(def);
  const plannedCells = evolving
    ? def.population * def.generations
    : initialCells.length;

  console.log(`sweep "${def.name}" · ${def.method}`);
  console.log(
    `  space: ${sweptNames.length ? sweptNames.join(", ") : "(nothing swept)"}` +
      (pinned.length
        ? ` · pinned ${pinned.map((p) => `${p.name}=${p.value}`).join(", ")}`
        : ""),
  );
  console.log(
    `  run:   ${def.run.map} · ${def.run.ticks} ticks · ${def.run.nations} nations + ${def.run.bots} bots · ${def.run.difficulty}`,
  );
  if (def.objectives.length > 0) {
    console.log(
      `  goal:  ${def.objectives
        .map(
          (o) =>
            `${o.goal === "maximize" ? "↑" : "↓"} ${o.metric}` +
            (o.tolerance > 0 ? ` (±${o.tolerance})` : ""),
        )
        .join(" · ")}`,
    );
  }
  console.log(
    evolving
      ? `  jobs:  ${def.population} population × ${def.generations} generations × ${def.run.seeds} seeds ≈ ${plannedCells * def.run.seeds} games · concurrency ${concurrency}`
      : `  jobs:  ${initialCells.length} cells × ${def.run.seeds} seeds = ${initialCells.length * def.run.seeds} games · concurrency ${concurrency}`,
  );
  if (def.method === "random" && initialCells.length < def.samples) {
    console.log(
      `  note:  ${def.samples - initialCells.length} duplicate samples dropped (the space is smaller than the sample budget)`,
    );
  }

  if (flag("dry-run")) {
    console.log("\n  first cells:");
    for (const c of initialCells.slice(0, 10)) {
      console.log(`    ${JSON.stringify(c.swept)}`);
    }
    if (initialCells.length > 10) {
      console.log(`    … ${initialCells.length - 10} more`);
    }
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const resultsFile = path.join(outDir, "results.jsonl");
  const sim = simFingerprint();
  const restored = flag("resume")
    ? loadPrevious(resultsFile, sim)
    : { rows: new Map<string, StoredRow>(), stale: 0 };
  const previous = restored.rows;
  if (previous.size > 0) {
    console.log(`  resume: reusing ${previous.size} completed cells`);
  }
  if (restored.stale > 0) {
    console.log(
      `  resume: discarding ${restored.stale} cells measured against a different src/core ` +
        `(sim ${sim}) — they will be re-run`,
    );
  }

  // ── evaluation ──
  //
  // Every cell ever evaluated, keyed by id. Shared across generations so an
  // offspring that lands on an already-measured point costs nothing, and so
  // --resume works identically for a one-shot sweep and an evolved one.
  const evaluated = new Map<string, CellResult>();
  const generation = new Map<string, number>();
  const startedAt = performance.now();
  const isTTY = process.stdout.isTTY === true;
  let gamesRun = 0;

  async function evaluate(cells: Cell[], gen: number): Promise<CellResult[]> {
    const pending: Cell[] = [];
    for (const cell of cells) {
      if (!generation.has(cell.id)) generation.set(cell.id, gen);
      if (evaluated.has(cell.id)) continue;
      const prev = previous.get(cell.id);
      if (prev !== undefined) {
        evaluated.set(cell.id, {
          cell,
          metrics: prev.metrics,
          perSeed: prev.perSeed,
          seeds: prev.seeds,
          hashes: prev.hashes,
          errors: prev.errors,
        });
        continue;
      }
      pending.push(cell);
    }

    const collected = new Map<
      string,
      {
        cell: Cell;
        perSeed: RunMetrics[];
        seeds: string[];
        hashes: (number | null)[];
        errors: string[];
      }
    >();
    const jobs: Job[] = [];
    for (const cell of pending) {
      collected.set(cell.id, {
        cell,
        perSeed: [],
        seeds: [],
        hashes: [],
        errors: [],
      });
      for (let s = 0; s < def.run.seeds; s++) {
        jobs.push({
          jobId: jobs.length,
          cellId: cell.id,
          spec: specFor(def, cell, s),
        });
      }
    }

    if (jobs.length > 0) {
      const prefix = evolving ? `  gen ${gen + 1}/${def.generations} ` : "  ";
      await pool(jobs, {
        concurrency,
        onResult: (outcome: JobOutcome) => {
          const entry = collected.get(outcome.job.cellId);
          if (entry === undefined) return;
          entry.seeds.push(outcome.job.spec.seed);
          if (outcome.error !== null || outcome.metrics === null) {
            entry.errors.push(outcome.error ?? "unknown failure");
            return;
          }
          entry.perSeed.push(outcome.metrics as unknown as RunMetrics);
          entry.hashes.push(outcome.hash);
        },
        onProgress: (done, total) => {
          const line =
            prefix + progressLine(done, total, startedAt).trimStart();
          if (isTTY) process.stdout.write(`\r${line}   `);
          else if (done === total || done % 25 === 0) console.log(line);
        },
      });
      if (isTTY) process.stdout.write("\n");
      gamesRun += jobs.length;
    }

    for (const cell of pending) {
      const entry = collected.get(cell.id)!;
      evaluated.set(cell.id, {
        cell,
        metrics:
          entry.perSeed.length > 0
            ? aggregate(entry.perSeed)
            : ({} as Record<string, number>),
        perSeed: entry.perSeed as unknown as Record<string, number>[],
        seeds: entry.seeds,
        hashes: entry.hashes,
        errors: entry.errors,
      });
    }
    return cells.map((c) => evaluated.get(c.id)!);
  }

  console.log("");
  let population = await evaluate(initialCells, 0);

  if (evolving) {
    // NSGA-II: breed from the current front, evaluate, keep the best μ.
    const rand = new PseudoRandom(def.seed ^ 0x5eed);
    for (let gen = 1; gen < def.generations; gen++) {
      const parents = population.filter((r) => r.errors.length === 0);
      if (parents.length < 2) {
        console.log(
          `  stopping at generation ${gen}: too few surviving cells to breed from`,
        );
        break;
      }
      const children = nextGeneration(
        parents,
        def.objectives,
        def.params,
        rand,
        def.population,
        new Set(evaluated.keys()),
      );
      if (children.length === 0) {
        console.log(
          `  stopping at generation ${gen}: the search has converged (no new cells)`,
        );
        break;
      }
      const childCells = cellsFrom(children, def.params, evaluated.size);
      const childResults = await evaluate(childCells, gen);
      population = truncate(
        [...parents, ...childResults.filter((r) => r.errors.length === 0)],
        def.population,
        def.objectives,
      );
      const front = paretoFront(population, def.objectives);
      console.log(
        `  gen ${gen + 1}/${def.generations}: front ${front.length} of ${population.length} · ` +
          def.objectives
            .map((o) => {
              const best = Math.max(...front.map((r) => objectiveValue(r, o)));
              return `${o.metric.replace(/^mean_/, "")} best ${(o.goal === "minimize" ? -best : best).toFixed(3)}`;
            })
            .join(" · "),
      );
    }
  }
  const wallMs = Math.round(performance.now() - startedAt);

  // Everything ever evaluated, oldest first — the whole search history.
  const results = [...evaluated.values()].sort(
    (a, b) =>
      (generation.get(a.cell.id) ?? 0) - (generation.get(b.cell.id) ?? 0) ||
      a.cell.index - b.cell.index,
  );
  fs.writeFileSync(
    resultsFile,
    `${results
      .map((r) =>
        JSON.stringify({
          cellId: r.cell.id,
          sim,
          generation: generation.get(r.cell.id) ?? 0,
          params: r.cell.params,
          swept: r.cell.swept,
          seeds: r.seeds,
          perSeed: r.perSeed,
          hashes: r.hashes,
          metrics: r.metrics,
          errors: r.errors,
        } satisfies StoredRow),
      )
      .join("\n")}\n`,
  );

  // ── analysis ──
  const usable = results.filter((r) => r.errors.length === 0);
  if (usable.length === 0) {
    console.error("\nevery cell failed — first error:");
    console.error(results[0]?.errors[0] ?? "(none recorded)");
    process.exitCode = 1;
    return;
  }
  const headline = headlineMetrics(def);
  // Constraints gate the candidate pool in both modes; targets and objectives
  // are two ways of choosing from what survives them.
  const feasible = solutionsOf(usable, def.targets, def.constraints);
  const multi = def.objectives.length > 0;

  // Single-objective (or pure target-band) mode: rank by distance to band,
  // pick a spread in PARAMETER space. Multi-objective mode: the front is the
  // answer, pick a spread along it in OBJECTIVE space.
  const front = multi
    ? orderFront(paretoFront(feasible, def.objectives), def.objectives)
    : [];
  const ranked = multi
    ? [...front, ...feasible.filter((r) => !front.includes(r))]
    : rankCells(usable, def.targets);
  const inBand = multi ? front : feasible;
  const picked = multi
    ? selectFrontSpread(front, def.solutions, def.objectives)
    : selectDiverse(feasible, def.solutions, def.targets);
  const sensitivity = sensitivities(
    usable,
    METRIC_KEYS.map((k) => `mean_${k}`),
  );
  const ranges = bandRanges(picked);

  // ── presets ──
  const solutionRefs = picked.map((r) => ({
    cellId: r.cell.id,
    preset: null as string | null,
  }));
  if (def.presetPrefix !== null && !flag("no-presets") && picked.length > 0) {
    clearPresets(def.presetPrefix);
    picked.forEach((r, i) => {
      const name = presetSlug(def.presetPrefix!, i);
      const preset: FoodPreset = {
        name,
        description:
          `${def.name} ${multi ? "front point" : "solution"} ${i + 1}/${picked.length} — ` +
          (multi ? def.objectives : def.targets)
            .map(
              (o) =>
                `${o.metric.replace(/^mean_/, "")} ${r.metrics[o.metric]?.toFixed(3)}`,
            )
            .join(", "),
        source: `sweep ${def.name} · cell ${r.cell.id}`,
        overrides: nonDefaultOverrides(overridesOf(r.cell.params)),
        metrics: Object.fromEntries(
          headline.map((m) => [m, Number((r.metrics[m] ?? 0).toFixed(4))]),
        ),
        run: {
          map: String(specFor(def, r.cell, 0).map),
          ticks: specFor(def, r.cell, 0).ticks,
          nations: specFor(def, r.cell, 0).nations,
          bots: specFor(def, r.cell, 0).bots,
          difficulty: String(specFor(def, r.cell, 0).difficulty),
          seeds: def.run.seeds,
        },
      };
      writePreset(preset);
      solutionRefs[i].preset = name;
    });
  }

  // ── reports ──
  const input = {
    def,
    results,
    ranked,
    inBand,
    solutions: picked,
    solutionRefs,
    sensitivity,
    ranges,
    headlineMetrics: headline,
    wallMs,
    jobCount: results.length * def.run.seeds,
    resumedCells: previous.size,
    freshGames: gamesRun,
    generationOf: generation,
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
  };
  const md = markdownReport(input);
  fs.writeFileSync(path.join(outDir, "report.md"), md);
  fs.writeFileSync(path.join(outDir, "report.html"), htmlReport(input));

  // Show repo-relative paths when the output lives in the repo, absolute
  // otherwise — a wall of "../../.." helps nobody.
  const show = (p: string): string => {
    const rel = path.relative(PROJECT_ROOT, p);
    return rel.startsWith("..") ? p : rel;
  };
  console.log("");
  console.log(md);
  console.log(`results:  ${show(resultsFile)}`);
  console.log(`report:   ${show(path.join(outDir, "report.html"))}`);
  if (solutionRefs.some((s) => s.preset !== null)) {
    console.log(
      `presets:  ${solutionRefs
        .filter((s) => s.preset !== null)
        .map((s) => s.preset)
        .join(", ")} → ${show(PRESET_DIR)}/`,
    );
    console.log(
      `          play one from the in-game tuning panel, or re-run it with ` +
        `--preset ${solutionRefs[0].preset}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
