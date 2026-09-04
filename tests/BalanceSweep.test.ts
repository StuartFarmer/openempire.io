/**
 * The balance sweep driver's pure parts: the config format, the parameter
 * space it expands to, and the analysis that turns finished runs into
 * "these six configurations hit your target".
 *
 * The simulation half is covered by the harness itself (BalanceRun's
 * --check-repro); nothing here starts a game.
 */
import { describe, expect, it } from "vitest";
import { Difficulty, GameMapType } from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { simFingerprint } from "../tests/perf/balance/RunGame";
import {
  bandRanges,
  CellResult,
  crowdingDistance,
  dominates,
  nonDominatedSort,
  paretoFront,
  rankCells,
  selectDiverse,
  selectFrontSpread,
  sensitivities,
  solutionsOf,
  targetScore,
} from "../tests/perf/balance/sweep/Analyze";
import { parseSweepConfig } from "../tests/perf/balance/sweep/Config";
import {
  cellsFrom,
  nextGeneration,
  truncate,
} from "../tests/perf/balance/sweep/Evolve";
import { expandSpace } from "../tests/perf/balance/sweep/Space";
import { parseYaml, YamlError } from "../tests/perf/balance/sweep/Yaml";

// ── YAML subset ──

describe("parseYaml", () => {
  it("parses nested maps, lists, flow collections and comments", () => {
    const doc = parseYaml(`
# leading comment
name: urban-flatten
method: random
samples: 60
run:
  map: verdantia
  ticks: 3000        # trailing comment
  difficulty: Medium
parameters:
  wCong: {min: 1.0, max: 2.6}
  popPerDensity: {values: [180, 220, 300]}
  urbanGrowthRate:
    distribution: log_uniform
    min: 0.002
targets:
  - metric: mean_finalGini
    goal: 0.42
    tolerance: 0.05
  - metric: mean_finalAlive
    min: 15
enabled: false
`);
    expect(doc).toEqual({
      name: "urban-flatten",
      method: "random",
      samples: 60,
      run: { map: "verdantia", ticks: 3000, difficulty: "Medium" },
      parameters: {
        wCong: { min: 1, max: 2.6 },
        popPerDensity: { values: [180, 220, 300] },
        urbanGrowthRate: { distribution: "log_uniform", min: 0.002 },
      },
      targets: [
        { metric: "mean_finalGini", goal: 0.42, tolerance: 0.05 },
        { metric: "mean_finalAlive", min: 15 },
      ],
      enabled: false,
    });
  });

  it("keeps a '#' that is not a comment, and unquotes strings", () => {
    expect(parseYaml(`a: foo#bar\nb: "x: y"\nc: 'it''s'`)).toEqual({
      a: "foo#bar",
      b: "x: y",
      c: "it's",
    });
  });

  it("distinguishes numbers from number-ish strings", () => {
    expect(parseYaml("a: 1e3\nb: 0x10\nc: -0.5\nd: 1.2.3\ne: null")).toEqual({
      a: 1000,
      b: "0x10",
      c: -0.5,
      d: "1.2.3",
      e: null,
    });
  });

  it("reports the line number for malformed input", () => {
    expect(() => parseYaml("a: 1\nb\n", "s.yaml")).toThrow(/s\.yaml:2/);
    expect(() => parseYaml("a: 1\na: 2\n")).toThrow(/duplicate key "a"/);
    expect(() => parseYaml("a: {b: 1\n")).toThrow(YamlError);
    expect(() => parseYaml("a:\n\tb: 1\n")).toThrow(/tabs/);
  });
});

// ── config validation ──

const BASE = `
name: t
run:
  map: verdantia
  seeds: 1
`;

describe("parseSweepConfig", () => {
  it("splits pinned knobs from swept axes and resolves run axes", () => {
    const def = parseSweepConfig(`${BASE}
parameters:
  supplyRadius: {value: 18}
  wCong: {values: [1, 2]}
`);
    expect(def.run.map).toBe(GameMapType.Verdantia);
    expect(def.run.difficulty).toBe(Difficulty.Medium);
    expect(def.params.find((p) => p.name === "supplyRadius")?.kind).toBe(
      "fixed",
    );
    expect(def.params.find((p) => p.name === "wCong")?.kind).toBe("values");
  });

  it("rejects an unknown knob and suggests the closest real one", () => {
    expect(() =>
      parseSweepConfig(`${BASE}\nparameters:\n  popPerDensty: {value: 1}\n`),
    ).toThrow(/unknown knob "popPerDensty".*popPerDensity/s);
  });

  it("rejects an unknown metric in a target", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\ntargets:\n  - metric: mean_finalGni\n    goal: 0.4\n`,
      ),
    ).toThrow(/unknown metric.*mean_finalGini/s);
  });

  it("gates a group off without deleting it", () => {
    const cfg = (enabled: boolean) => `${BASE}
parameters:
  wCong: {values: [1, 2]}
  starvation:
    enabled: ${enabled}
    parameters:
      minFedForLife: {values: [0.2, 0.4]}
`;
    expect(parseSweepConfig(cfg(true)).params.map((p) => p.name)).toEqual([
      "wCong",
      "minFedForLife",
    ]);
    expect(parseSweepConfig(cfg(false)).params.map((p) => p.name)).toEqual([
      "wCong",
    ]);
  });

  it("compiles goal/tolerance and min/max into the same band", () => {
    const def = parseSweepConfig(`${BASE}
targets:
  - metric: mean_finalGini
    goal: 0.4
    tolerance: 0.05
constraints:
  - metric: mean_finalAlive
    min: 15
`);
    expect(def.targets[0].metric).toBe("mean_finalGini");
    expect(def.targets[0].center).toBe(0.4);
    expect(def.targets[0].min).toBeCloseTo(0.35, 10);
    expect(def.targets[0].max).toBeCloseTo(0.45, 10);
    expect(def.constraints[0]).toMatchObject({ min: 15, max: Infinity });
  });

  it("refuses to grid-expand a continuous range", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\nmethod: grid\nparameters:\n  wCong: {min: 1, max: 2}\n`,
      ),
    ).toThrow(/cannot expand a min\/max range/);
  });

  it("rejects log distributions that start at zero", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\nmethod: random\nsamples: 2\nparameters:\n  wCong: {min: 0, max: 2, distribution: log_uniform}\n`,
      ),
    ).toThrow(/log distributions need min > 0/);
  });
});

// ── space expansion ──

describe("expandSpace", () => {
  it("expands a grid as the full cross product", () => {
    const def = parseSweepConfig(`${BASE}
method: grid
parameters:
  wCong: {values: [1, 2]}
  popPerDensity: {values: [180, 220, 300]}
  supplyRadius: {value: 18}
`);
    const cells = expandSpace(def);
    expect(cells).toHaveLength(6);
    // Pinned knobs ride along in params but are not sweep axes.
    expect(cells[0].params.supplyRadius).toBe(18);
    expect(Object.keys(cells[0].swept).sort()).toEqual([
      "popPerDensity",
      "wCong",
    ]);
    expect(new Set(cells.map((c) => c.id)).size).toBe(6);
  });

  it("samples the same cells for the same seed and different ones otherwise", () => {
    const cfg = (seed: number) => `${BASE}
method: random
samples: 12
seed: ${seed}
parameters:
  wCong: {min: 1.0, max: 2.6}
`;
    const a = expandSpace(parseSweepConfig(cfg(7))).map((c) => c.id);
    const b = expandSpace(parseSweepConfig(cfg(7))).map((c) => c.id);
    const c = expandSpace(parseSweepConfig(cfg(8))).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("honours distributions and stays inside the declared bounds", () => {
    const def = parseSweepConfig(`${BASE}
method: random
samples: 200
parameters:
  urbanGrowthRate:
    distribution: log_uniform
    min: 0.002
    max: 0.04
  supplyRadius:
    distribution: int
    min: 10
    max: 20
`);
    for (const cell of expandSpace(def)) {
      const g = cell.swept.urbanGrowthRate as number;
      const r = cell.swept.supplyRadius as number;
      expect(g).toBeGreaterThanOrEqual(0.002);
      expect(g).toBeLessThanOrEqual(0.04);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThanOrEqual(20);
    }
  });

  it("drops duplicate draws rather than running them twice", () => {
    const def = parseSweepConfig(`${BASE}
method: random
samples: 50
parameters:
  wCong: {values: [1, 2]}
`);
    expect(expandSpace(def)).toHaveLength(2);
  });

  it("refuses a grid that would explode", () => {
    const many = Array.from({ length: 200 }, (_, i) => i).join(", ");
    const def = `${BASE}
method: grid
parameters:
  wCong: {values: [${many}]}
  wFood: {values: [${many}]}
`;
    expect(() => expandSpace(parseSweepConfig(def))).toThrow(/cap 20,000/);
  });
});

// ── analysis ──

function cellResult(
  swept: Record<string, number>,
  metrics: Record<string, number>,
): CellResult {
  const id = Object.entries(swept)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return {
    cell: { id, index: 0, params: swept, swept },
    metrics,
    perSeed: [],
    seeds: [],
    hashes: [],
    errors: [],
  };
}

describe("sweep analysis", () => {
  const targets = [
    { metric: "mean_finalGini", min: 0.35, max: 0.45, center: 0.4 },
  ];
  const constraints = [
    { metric: "mean_finalAlive", min: 15, max: Infinity, center: null },
  ];

  it("scores cells by distance outside the band, zero when inside", () => {
    const inside = cellResult({ x: 1 }, { mean_finalGini: 0.4 });
    const edge = cellResult({ x: 2 }, { mean_finalGini: 0.45 });
    const outside = cellResult({ x: 3 }, { mean_finalGini: 0.6 });
    expect(targetScore(inside, targets)).toBe(0);
    expect(targetScore(edge, targets)).toBeGreaterThan(0); // tie-break only
    expect(targetScore(edge, targets)).toBeLessThan(0.01);
    expect(targetScore(outside, targets)).toBeGreaterThan(1);
    expect(rankCells([outside, edge, inside], targets)[0]).toBe(inside);
  });

  it("treats constraints as hard filters independent of the target", () => {
    const good = cellResult(
      { x: 1 },
      { mean_finalGini: 0.4, mean_finalAlive: 20 },
    );
    const dead = cellResult(
      { x: 2 },
      { mean_finalGini: 0.4, mean_finalAlive: 3 },
    );
    expect(solutionsOf([good, dead], targets, constraints)).toEqual([good]);
  });

  it("excludes failed cells from solutions", () => {
    const broken = cellResult(
      { x: 1 },
      { mean_finalGini: 0.4, mean_finalAlive: 20 },
    );
    broken.errors = ["boom"];
    expect(solutionsOf([broken], targets, constraints)).toEqual([]);
  });

  it("picks solutions that span the space rather than clustering", () => {
    // Nine cells all inside the band: eight clustered near x=1, one at x=10.
    const cells = [
      ...Array.from({ length: 8 }, (_, i) =>
        cellResult({ x: 1 + i * 0.01 }, { mean_finalGini: 0.4 }),
      ),
      cellResult({ x: 10 }, { mean_finalGini: 0.4 }),
    ];
    const picked = selectDiverse(cells, 2, targets);
    const xs = picked
      .map((p) => p.cell.swept.x as number)
      .sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(2);
    expect(xs[1]).toBe(10); // the outlier is chosen, not a ninth near-duplicate
  });

  it("reports the in-band span of each axis", () => {
    const cells = [
      cellResult({ x: 1, y: 5 }, {}),
      cellResult({ x: 3, y: 5 }, {}),
    ];
    expect(bandRanges(cells)).toEqual([
      { param: "x", lo: 1, hi: 3, values: [1, 3] },
      { param: "y", lo: 5, hi: 5, values: [5] },
    ]);
  });

  it("recovers the sign and rough size of a knob's effect", () => {
    // metric = 0.1 * x, so raising x by 1σ raises the metric by 0.1σ_x.
    const cells = Array.from({ length: 20 }, (_, i) =>
      cellResult({ x: i }, { mean_finalGini: 0.1 * i }),
    );
    const s = sensitivities(cells, ["mean_finalGini"]);
    expect(s).toHaveLength(1);
    expect(s[0].r).toBeCloseTo(1, 6);
    const sd = Math.sqrt(
      Array.from({ length: 20 }, (_, i) => (i - 9.5) ** 2).reduce(
        (a, b) => a + b,
        0,
      ) / 20,
    );
    expect(s[0].perSigma).toBeCloseTo(0.1 * sd, 6);
  });

  it("returns no sensitivities when there is nothing to fit", () => {
    expect(
      sensitivities(
        [cellResult({ x: 1 }, { mean_finalGini: 0.4 })],
        ["mean_finalGini"],
      ),
    ).toEqual([]);
  });
});

// ── multi-objective ──

const OBJ = (metric: string, goal: "maximize" | "minimize", tolerance = 0) => ({
  metric,
  goal,
  tolerance,
});

describe("Pareto analysis", () => {
  // Two objectives in direct tension: maximise gini, minimise survivors.
  const objectives = [
    OBJ("mean_finalGini", "maximize"),
    OBJ("mean_finalAlive", "minimize"),
  ];
  const cell = (x: number, gini: number, alive: number) =>
    cellResult({ x }, { mean_finalGini: gini, mean_finalAlive: alive });

  it("dominates only when at least as good on all and better on one", () => {
    const a = cell(1, 0.5, 10);
    const better = cell(2, 0.6, 8); // better on both
    const mixed = cell(3, 0.6, 12); // better gini, worse survivors
    const same = cell(4, 0.5, 10);
    expect(dominates(better, a, objectives)).toBe(true);
    expect(dominates(a, better, objectives)).toBe(false);
    expect(dominates(mixed, a, objectives)).toBe(false);
    expect(dominates(a, mixed, objectives)).toBe(false);
    expect(dominates(same, a, objectives)).toBe(false); // ties are not wins
  });

  it("treats differences inside the tolerance as ties", () => {
    const loose = [OBJ("mean_finalGini", "maximize", 0.05), objectives[1]];
    const a = cell(1, 0.5, 10);
    const b = cell(2, 0.52, 10); // better, but inside the noise margin
    expect(dominates(b, a, objectives)).toBe(true);
    expect(dominates(b, a, loose)).toBe(false);
  });

  it("keeps the non-dominated trade-offs and drops the beaten ones", () => {
    const cells = [
      cell(1, 0.6, 12), // high gini, many survivors  → front
      cell(2, 0.5, 8), //  low gini, few survivors    → front
      cell(3, 0.45, 14), // worse than both           → dominated
      cell(4, 0.55, 10), // front (a middle trade-off)
    ];
    const front = paretoFront(cells, objectives);
    expect(front.map((r) => r.cell.swept.x).sort()).toEqual([1, 2, 4]);
  });

  it("ranks dominated cells into deeper layers", () => {
    const cells = [cell(1, 0.6, 8), cell(2, 0.5, 10), cell(3, 0.4, 12)];
    expect(nonDominatedSort(cells, objectives)).toEqual([0, 1, 2]);
  });

  it("gives the extremes infinite crowding so they are never dropped", () => {
    const cells = [cell(1, 0.6, 12), cell(2, 0.55, 10), cell(3, 0.5, 8)];
    const d = crowdingDistance(cells, objectives);
    expect(d[0]).toBe(Infinity);
    expect(d[2]).toBe(Infinity);
    expect(d[1]).toBeGreaterThan(0);
    expect(d[1]).toBeLessThan(Infinity);
  });

  it("selects a spread along the front, keeping both extremes", () => {
    const front = [
      cell(1, 0.7, 16),
      cell(2, 0.68, 15),
      cell(3, 0.67, 14),
      cell(4, 0.5, 4),
    ];
    const picked = selectFrontSpread(front, 2, objectives);
    expect(picked.map((r) => r.cell.swept.x).sort()).toEqual([1, 4]);
  });

  it("returns no front when nothing is being optimised", () => {
    expect(paretoFront([cell(1, 0.5, 10)], [])).toEqual([]);
  });
});

describe("NSGA-II operators", () => {
  const objectives = [
    OBJ("mean_finalGini", "maximize"),
    OBJ("mean_finalAlive", "minimize"),
  ];
  const params = parseSweepConfig(`${BASE}
method: nsga2
population: 4
generations: 2
parameters:
  wCong: {min: 1.0, max: 3.0}
  popPerDensity: {values: [7000, 10000, 13000]}
objectives:
  - metric: mean_finalGini
    goal: maximize
`).params;

  const pop = [
    cellResult(
      { wCong: 1.2, popPerDensity: 7000 },
      { mean_finalGini: 0.6, mean_finalAlive: 8 },
    ),
    cellResult(
      { wCong: 2.8, popPerDensity: 13000 },
      { mean_finalGini: 0.5, mean_finalAlive: 6 },
    ),
    cellResult(
      { wCong: 2.0, popPerDensity: 10000 },
      { mean_finalGini: 0.3, mean_finalAlive: 20 },
    ),
    cellResult(
      { wCong: 1.6, popPerDensity: 7000 },
      { mean_finalGini: 0.55, mean_finalAlive: 9 },
    ),
  ];

  it("breeds children that respect every declared bound", () => {
    const kids = nextGeneration(
      pop,
      objectives,
      params,
      new PseudoRandom(1),
      12,
      new Set(),
    );
    expect(kids.length).toBe(12);
    for (const kid of kids) {
      expect(kid.wCong).toBeGreaterThanOrEqual(1);
      expect(kid.wCong).toBeLessThanOrEqual(3);
      expect([7000, 10000, 13000]).toContain(kid.popPerDensity);
    }
  });

  it("never re-proposes an already-evaluated cell", () => {
    const seen = new Set(["popPerDensity=7000,wCong=1.2"]);
    const kids = nextGeneration(
      pop,
      objectives,
      params,
      new PseudoRandom(2),
      8,
      seen,
    );
    const ids = kids.map(
      (k) => `popPerDensity=${k.popPerDensity},wCong=${k.wCong}`,
    );
    expect(ids).not.toContain("popPerDensity=7000,wCong=1.2");
    expect(new Set(ids).size).toBe(ids.length); // and no internal duplicates
  });

  it("is reproducible for a given seed", () => {
    const run = (seed: number) =>
      JSON.stringify(
        nextGeneration(
          pop,
          objectives,
          params,
          new PseudoRandom(seed),
          6,
          new Set(),
        ),
      );
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it("keeps the front when truncating a bloated population", () => {
    const kept = truncate(pop, 2, objectives);
    expect(kept).toHaveLength(2);
    // The dominated cell (gini 0.3 with 20 survivors) must be the one cut.
    expect(kept.map((r) => r.cell.swept.wCong)).not.toContain(2.0);
  });

  it("numbers generated cells and derives their ids from swept axes only", () => {
    const cells = cellsFrom(
      [{ wCong: 1.5, popPerDensity: 7000, supplyRadius: 10 }],
      params,
      7,
    );
    expect(cells[0].index).toBe(7);
    expect(cells[0].id).toBe("popPerDensity=7000,wCong=1.5");
    expect(cells[0].params.supplyRadius).toBe(10);
  });
});

describe("multi-objective config", () => {
  it("rejects nsga2 without objectives", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\nmethod: nsga2\nparameters:\n  wCong: {min: 1, max: 2}\n`,
      ),
    ).toThrow(/needs at least one entry under "objectives"/);
  });

  it("rejects an unknown goal direction", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\nobjectives:\n  - metric: mean_finalGini\n    goal: bigger\n`,
      ),
    ).toThrow(/goal must be "maximize" or "minimize"/);
  });

  it("rejects the same metric listed twice", () => {
    expect(() =>
      parseSweepConfig(
        `${BASE}\nobjectives:\n  - metric: mean_finalGini\n    goal: maximize\n  - metric: mean_finalGini\n    goal: minimize\n`,
      ),
    ).toThrow(/listed twice/);
  });

  it("exposes leaderDrawdown as a targetable metric", () => {
    const def = parseSweepConfig(`${BASE}
objectives:
  - metric: mean_leaderDrawdown
    goal: maximize
`);
    expect(def.objectives[0].metric).toBe("mean_leaderDrawdown");
  });
});

describe("simFingerprint", () => {
  it("is a stable short hash of the simulation source", () => {
    const a = simFingerprint();
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(simFingerprint()).toBe(a); // cached, and stable within a process
  });
});
