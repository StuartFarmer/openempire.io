/**
 * Sweep config: the file format, its validation, and the vocabulary the rest
 * of the driver speaks.
 *
 * Shape (see tests/perf/balance/sweeps/*.yaml for worked examples):
 *
 *   name: urban-flatten
 *   method: random          # grid | random
 *   samples: 120            # random only
 *   seed: 7                 # sampling seed — same seed ⇒ same cells
 *   concurrency: 10
 *
 *   run:                    # the fixed game axes; any of these may instead
 *     map: verdantia        # take a `values:` list to become a sweep axis
 *     ticks: 3000
 *     nations: 25
 *     bots: 40
 *     difficulty: Medium
 *     seeds: 3              # games per cell (across-seed spread matters)
 *     sample: 250
 *
 *   parameters:
 *     supplyRadius: {value: 18}                 # pinned, not swept
 *     popPerDensity: {values: [180, 220, 300]}  # explicit list
 *     wCong: {min: 1.0, max: 2.5}               # uniform range
 *     urbanGrowthRate:
 *       distribution: log_uniform
 *       min: 0.001
 *       max: 0.05
 *     starvation:            # a named group — gate the whole block off with
 *       enabled: false       # `enabled: false` instead of deleting it
 *       parameters:
 *         minFedForLife: {values: [0.2, 0.4]}
 *
 *   targets:                 # what "good" means; drives ranking + solutions
 *     - metric: mean_finalGini
 *       goal: 0.40
 *       tolerance: 0.05
 *   constraints:             # hard filters; a cell failing any is not a
 *     - metric: mean_finalAlive   # solution regardless of its target score
 *       min: 15
 *
 *   solutions: 6             # how many *diverse* in-band cells to export
 *   presets: flat            # preset filename prefix (omit to skip export)
 *
 * Multi-objective form — declare directions instead of a band and the report
 * becomes a Pareto front (the cells nothing else beats on every objective at
 * once). Works with any method; `nsga2` additionally evolves toward it:
 *
 *   method: nsga2
 *   population: 24           # cells per generation
 *   generations: 6           # total games = population × generations × seeds
 *   objectives:
 *     - metric: mean_finalGini
 *       goal: maximize
 *       tolerance: 0.01      # ≈ the across-seed spread; noise guard
 *     - metric: mean_finalAlive
 *       goal: minimize
 *   constraints:             # still hard filters, applied to the front
 *     - metric: mean_finalAlive
 *       min: 3
 */
import {
  FOOD_DEFAULTS,
  FOOD_TUNABLE_KEYS,
  FoodConfig,
} from "../../../../src/core/configuration/FoodConfig";
import { Difficulty, GameMapType } from "../../../../src/core/game/Game";
import { AGGREGATED_METRIC_KEYS } from "../RunGame";
import { parseYaml, YamlValue } from "./Yaml";

export type Distribution =
  | "uniform"
  | "log_uniform"
  | "q_uniform"
  | "q_log_uniform"
  | "int";

const DISTRIBUTIONS: Distribution[] = [
  "uniform",
  "log_uniform",
  "q_uniform",
  "q_log_uniform",
  "int",
];

export type Scalar = number | string;

export interface ParamSpec {
  /** Knob name (a FoodConfig key) or run axis (`map`, `ticks`, …). */
  name: string;
  /** Cosmetic grouping from a nested `parameters:` block. */
  group: string | null;
  /** True when this axis is a run axis rather than a food knob. */
  isRunAxis: boolean;
  kind: "fixed" | "values" | "range";
  value?: Scalar;
  values?: Scalar[];
  min?: number;
  max?: number;
  q?: number;
  distribution?: Distribution;
}

/** A metric interval. `goal`/`tolerance` and `min`/`max` both compile to one. */
export interface Band {
  metric: string;
  min: number;
  max: number;
  /** Present when authored as goal ± tolerance; used for ranking distance. */
  center: number | null;
}

/** A direction to push a metric in, for multi-objective search. */
export interface Objective {
  metric: string;
  goal: "maximize" | "minimize";
  /**
   * Margin below which two cells count as tied on this objective. Guards
   * against seed noise inventing a Pareto front out of nothing — set it to
   * about the across-seed spread (`std_<metric>`) you see in the report.
   */
  tolerance: number;
}

export interface RunAxes {
  map: GameMapType;
  ticks: number;
  nations: number;
  bots: number;
  difficulty: Difficulty;
  seeds: number;
  sample: number;
}

export interface SweepDefinition {
  name: string;
  method: "grid" | "random" | "nsga2";
  samples: number;
  seed: number;
  concurrency: number;
  run: RunAxes;
  /** Every swept or pinned axis, food knobs and run axes alike. */
  params: ParamSpec[];
  targets: Band[];
  constraints: Band[];
  /** Directions to optimise. Non-empty ⇒ the report is a Pareto front. */
  objectives: Objective[];
  /** nsga2 only: cells per generation, and how many generations to run. */
  population: number;
  generations: number;
  solutions: number;
  presetPrefix: string | null;
}

const RUN_AXIS_KEYS = [
  "map",
  "ticks",
  "nations",
  "bots",
  "difficulty",
  "seeds",
  "sample",
] as const;
type RunAxisKey = (typeof RUN_AXIS_KEYS)[number];

const RUN_DEFAULTS: RunAxes = {
  map: GameMapType.Verdantia,
  ticks: 3000,
  nations: 25,
  bots: 40,
  difficulty: Difficulty.Medium,
  seeds: 3,
  sample: 250,
};

// ── helpers ──

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

function didYouMean(name: string, candidates: readonly string[]): string {
  const ranked = candidates
    .map((c) => ({ c, d: levenshtein(name.toLowerCase(), c.toLowerCase()) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .filter((x) => x.d <= Math.max(3, name.length / 2));
  return ranked.length === 0
    ? ""
    : ` Did you mean ${ranked.map((r) => `"${r.c}"`).join(", ")}?`;
}

function isMap(v: YamlValue): v is Record<string, YamlValue> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(msg: string): never {
  throw new Error(`sweep config: ${msg}`);
}

function asNumber(v: YamlValue, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    fail(`${where} must be a finite number, got ${JSON.stringify(v)}`);
  }
  return v;
}

function asScalar(v: YamlValue, where: string): Scalar {
  if (typeof v === "number" || typeof v === "string") return v;
  fail(`${where} must be a number or string, got ${JSON.stringify(v)}`);
}

export function resolveMapName(name: string): GameMapType {
  const key = Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === String(name).toLowerCase(),
  );
  if (key === undefined) {
    fail(
      `unknown map "${name}".${didYouMean(String(name), Object.keys(GameMapType))}`,
    );
  }
  return GameMapType[key as keyof typeof GameMapType];
}

function resolveDifficulty(name: string): Difficulty {
  const values = Object.values(Difficulty) as string[];
  const hit = values.find(
    (d) => d.toLowerCase() === String(name).toLowerCase(),
  );
  if (hit === undefined) {
    fail(`unknown difficulty "${name}". Expected one of ${values.join(", ")}`);
  }
  return hit as Difficulty;
}

// ── parameters ──

function parseParamSpec(
  name: string,
  raw: YamlValue,
  group: string | null,
  isRunAxis: boolean,
): ParamSpec {
  const base = { name, group, isRunAxis };

  // Bare scalar shorthand: `supplyRadius: 18` pins the knob.
  if (typeof raw === "number" || typeof raw === "string") {
    return { ...base, kind: "fixed", value: raw };
  }
  if (Array.isArray(raw)) {
    return {
      ...base,
      kind: "values",
      values: raw.map((v, i) => asScalar(v, `${name}[${i}]`)),
    };
  }
  if (!isMap(raw)) fail(`parameter "${name}" must be a scalar, list, or map`);

  const known = ["value", "values", "min", "max", "distribution", "q"];
  for (const k of Object.keys(raw)) {
    if (!known.includes(k)) {
      fail(`parameter "${name}": unknown field "${k}".${didYouMean(k, known)}`);
    }
  }

  if ("value" in raw) {
    if ("values" in raw || "min" in raw || "max" in raw) {
      fail(
        `parameter "${name}": "value" cannot be combined with values/min/max`,
      );
    }
    return {
      ...base,
      kind: "fixed",
      value: asScalar(raw.value, `${name}.value`),
    };
  }
  if ("values" in raw) {
    if ("min" in raw || "max" in raw) {
      fail(`parameter "${name}": "values" cannot be combined with min/max`);
    }
    const list = raw.values;
    if (!Array.isArray(list) || list.length === 0) {
      fail(`parameter "${name}": "values" must be a non-empty list`);
    }
    return {
      ...base,
      kind: "values",
      values: list.map((v, i) => asScalar(v, `${name}.values[${i}]`)),
    };
  }
  if (!("min" in raw) || !("max" in raw)) {
    fail(
      `parameter "${name}": needs "value", "values", or both "min" and "max"`,
    );
  }
  const min = asNumber(raw.min, `${name}.min`);
  const max = asNumber(raw.max, `${name}.max`);
  if (max < min)
    fail(`parameter "${name}": max (${max}) is below min (${min})`);
  const distRaw =
    raw.distribution === undefined ? "uniform" : String(raw.distribution);
  if (!DISTRIBUTIONS.includes(distRaw as Distribution)) {
    fail(
      `parameter "${name}": unknown distribution "${distRaw}".${didYouMean(distRaw, DISTRIBUTIONS)}`,
    );
  }
  const distribution = distRaw as Distribution;
  const quantized =
    distribution === "q_uniform" || distribution === "q_log_uniform";
  if (quantized && raw.q === undefined) {
    fail(`parameter "${name}": distribution "${distribution}" requires "q"`);
  }
  if (
    (distribution === "log_uniform" || distribution === "q_log_uniform") &&
    min <= 0
  ) {
    fail(`parameter "${name}": log distributions need min > 0, got ${min}`);
  }
  return {
    ...base,
    kind: "range",
    min,
    max,
    distribution,
    q: raw.q === undefined ? undefined : asNumber(raw.q, `${name}.q`),
  };
}

/**
 * Walk a `parameters:` block. A nested map containing its own `parameters:`
 * key is a group — a labelled block that can be switched off wholesale with
 * `enabled: false`, which is the cheap way to gate a region of the space out
 * of a sweep without deleting it from the file.
 */
function collectParams(
  block: YamlValue,
  group: string | null,
  out: ParamSpec[],
  runAxes: Set<string>,
): void {
  if (block === null) return;
  if (!isMap(block)) fail(`"parameters" must be a map of knob names`);
  for (const [key, raw] of Object.entries(block)) {
    if (isMap(raw) && "parameters" in raw) {
      const enabled = raw.enabled === undefined ? true : raw.enabled === true;
      for (const k of Object.keys(raw)) {
        if (!["parameters", "enabled"].includes(k)) {
          fail(
            `group "${key}": unknown field "${k}" (expected parameters, enabled)`,
          );
        }
      }
      if (!enabled) continue;
      collectParams(raw.parameters, key, out, runAxes);
      continue;
    }
    out.push(parseParamSpec(key, raw, group, runAxes.has(key)));
  }
}

function validateParams(params: ParamSpec[]): void {
  const seen = new Set<string>();
  for (const p of params) {
    if (seen.has(p.name)) fail(`parameter "${p.name}" is declared twice`);
    seen.add(p.name);
    if (p.isRunAxis) {
      if (p.name === "map") {
        for (const v of p.values ?? (p.value === undefined ? [] : [p.value])) {
          resolveMapName(String(v));
        }
      }
      if (p.name === "difficulty") {
        for (const v of p.values ?? (p.value === undefined ? [] : [p.value])) {
          resolveDifficulty(String(v));
        }
      }
      continue;
    }
    if (!(FOOD_TUNABLE_KEYS as readonly string[]).includes(p.name)) {
      fail(
        `unknown knob "${p.name}".${didYouMean(p.name, [
          ...FOOD_TUNABLE_KEYS,
          ...RUN_AXIS_KEYS,
        ])}`,
      );
    }
    const nums = [
      ...(p.values ?? []),
      ...(p.value === undefined ? [] : [p.value]),
    ];
    for (const v of nums) {
      if (typeof v !== "number") {
        fail(`knob "${p.name}" takes numbers, got ${JSON.stringify(v)}`);
      }
    }
  }
}

// ── bands ──

function parseBand(raw: YamlValue, what: string, index: number): Band {
  if (!isMap(raw)) fail(`${what}[${index}] must be a map`);
  const known = ["metric", "goal", "tolerance", "min", "max"];
  for (const k of Object.keys(raw)) {
    if (!known.includes(k)) {
      fail(`${what}[${index}]: unknown field "${k}".${didYouMean(k, known)}`);
    }
  }
  const metric = raw.metric;
  if (typeof metric !== "string")
    fail(`${what}[${index}]: "metric" is required`);
  if (!AGGREGATED_METRIC_KEYS.includes(metric)) {
    fail(
      `${what}[${index}]: unknown metric "${metric}".${didYouMean(metric, AGGREGATED_METRIC_KEYS)}`,
    );
  }
  if ("goal" in raw) {
    const goal = asNumber(raw.goal, `${what}[${index}].goal`);
    const tol =
      raw.tolerance === undefined
        ? 0
        : asNumber(raw.tolerance, `${what}[${index}].tolerance`);
    if (tol < 0) fail(`${what}[${index}]: tolerance must be >= 0`);
    return { metric, min: goal - tol, max: goal + tol, center: goal };
  }
  const min =
    raw.min === undefined ? -Infinity : asNumber(raw.min, `${what}.min`);
  const max =
    raw.max === undefined ? Infinity : asNumber(raw.max, `${what}.max`);
  if (min === -Infinity && max === Infinity) {
    fail(`${what}[${index}]: needs "goal" or at least one of "min"/"max"`);
  }
  if (max < min) fail(`${what}[${index}]: max is below min`);
  return { metric, min, max, center: null };
}

function parseBands(raw: YamlValue, what: string): Band[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`"${what}" must be a list`);
  return raw.map((r, i) => parseBand(r, what, i));
}

// ── objectives ──

function parseObjective(raw: YamlValue, index: number): Objective {
  if (!isMap(raw)) fail(`objectives[${index}] must be a map`);
  const known = ["metric", "goal", "tolerance"];
  for (const k of Object.keys(raw)) {
    if (!known.includes(k)) {
      fail(
        `objectives[${index}]: unknown field "${k}".${didYouMean(k, known)}`,
      );
    }
  }
  const metric = raw.metric;
  if (typeof metric !== "string")
    fail(`objectives[${index}]: "metric" is required`);
  if (!AGGREGATED_METRIC_KEYS.includes(metric)) {
    fail(
      `objectives[${index}]: unknown metric "${metric}".${didYouMean(metric, AGGREGATED_METRIC_KEYS)}`,
    );
  }
  const goal = raw.goal === undefined ? "maximize" : String(raw.goal);
  if (goal !== "maximize" && goal !== "minimize") {
    fail(
      `objectives[${index}]: goal must be "maximize" or "minimize", got "${goal}"`,
    );
  }
  const tolerance =
    raw.tolerance === undefined
      ? 0
      : asNumber(raw.tolerance, `objectives[${index}].tolerance`);
  if (tolerance < 0) fail(`objectives[${index}]: tolerance must be >= 0`);
  return { metric, goal, tolerance };
}

function parseObjectives(raw: YamlValue): Objective[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`"objectives" must be a list`);
  const list = raw.map(parseObjective);
  const seen = new Set<string>();
  for (const o of list) {
    if (seen.has(o.metric)) {
      fail(`objectives: "${o.metric}" is listed twice`);
    }
    seen.add(o.metric);
  }
  return list;
}

// ── entry point ──

export function parseSweepConfig(
  text: string,
  source?: string,
): SweepDefinition {
  const doc = parseYaml(text, source);
  if (!isMap(doc)) fail("top level must be a map");

  const known = [
    "name",
    "method",
    "samples",
    "seed",
    "concurrency",
    "run",
    "parameters",
    "targets",
    "constraints",
    "objectives",
    "population",
    "generations",
    "solutions",
    "presets",
  ];
  for (const k of Object.keys(doc)) {
    if (!known.includes(k))
      fail(`unknown field "${k}".${didYouMean(k, known)}`);
  }

  const methodRaw = doc.method === undefined ? "grid" : String(doc.method);
  if (methodRaw !== "grid" && methodRaw !== "random" && methodRaw !== "nsga2") {
    fail(`unknown method "${methodRaw}". Expected "grid", "random" or "nsga2"`);
  }

  // Run axes: scalars become fixed settings, anything richer becomes an axis.
  const run: RunAxes = { ...RUN_DEFAULTS };
  const runParams: ParamSpec[] = [];
  const runBlock = doc.run;
  if (runBlock !== undefined && runBlock !== null) {
    if (!isMap(runBlock)) fail(`"run" must be a map`);
    for (const [key, raw] of Object.entries(runBlock)) {
      if (!(RUN_AXIS_KEYS as readonly string[]).includes(key)) {
        fail(`run: unknown axis "${key}".${didYouMean(key, RUN_AXIS_KEYS)}`);
      }
      const axis = key as RunAxisKey;
      if (typeof raw === "number" || typeof raw === "string") {
        if (axis === "map") run.map = resolveMapName(String(raw));
        else if (axis === "difficulty")
          run.difficulty = resolveDifficulty(String(raw));
        else run[axis] = asNumber(raw, `run.${axis}`) as never;
        continue;
      }
      runParams.push(parseParamSpec(axis, raw, "run", true));
    }
  }
  if (run.seeds < 1) fail(`run.seeds must be >= 1`);
  if (run.ticks < 1) fail(`run.ticks must be >= 1`);
  if (run.sample < 1) fail(`run.sample must be >= 1`);

  const params: ParamSpec[] = [...runParams];
  collectParams(doc.parameters ?? null, null, params, new Set(RUN_AXIS_KEYS));
  validateParams(params);

  const targets = parseBands(doc.targets, "targets");
  const constraints = parseBands(doc.constraints, "constraints");
  const objectives = parseObjectives(doc.objectives);

  const swept = params.filter((p) => p.kind !== "fixed");
  if (methodRaw === "random" && swept.some((p) => p.kind === "range")) {
    if (doc.samples === undefined) {
      fail(`method "random" with a range parameter requires "samples"`);
    }
  }
  if (methodRaw === "grid" && swept.some((p) => p.kind === "range")) {
    fail(
      `method "grid" cannot expand a min/max range — give the parameter ` +
        `"values", or switch to method: random`,
    );
  }

  const population =
    doc.population === undefined ? 24 : asNumber(doc.population, "population");
  const generations =
    doc.generations === undefined
      ? 6
      : asNumber(doc.generations, "generations");
  if (methodRaw === "nsga2") {
    if (objectives.length === 0) {
      fail(`method "nsga2" needs at least one entry under "objectives"`);
    }
    if (swept.length === 0) {
      fail(`method "nsga2" needs at least one parameter to vary`);
    }
    if (population < 4) fail(`population must be >= 4`);
    if (generations < 1) fail(`generations must be >= 1`);
  }

  return {
    name: doc.name === undefined ? (source ?? "sweep") : String(doc.name),
    method: methodRaw,
    samples: doc.samples === undefined ? 0 : asNumber(doc.samples, "samples"),
    seed: doc.seed === undefined ? 1 : asNumber(doc.seed, "seed"),
    concurrency:
      doc.concurrency === undefined
        ? 0
        : asNumber(doc.concurrency, "concurrency"),
    run,
    params,
    targets,
    constraints,
    objectives,
    population,
    generations,
    solutions:
      doc.solutions === undefined ? 6 : asNumber(doc.solutions, "solutions"),
    presetPrefix:
      doc.presets === undefined || doc.presets === null
        ? null
        : String(doc.presets),
  };
}

/** The knob values a cell pins, merged over the shipped defaults. */
export function overridesOf(cell: Record<string, Scalar>): Partial<FoodConfig> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(cell)) {
    if (!(FOOD_TUNABLE_KEYS as readonly string[]).includes(key)) continue;
    if (typeof value !== "number") continue;
    out[key] = value;
  }
  return out as Partial<FoodConfig>;
}

/** Knob values that differ from the shipped defaults — what a preset stores. */
export function nonDefaultOverrides(
  overrides: Partial<FoodConfig>,
): Partial<FoodConfig> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== FOOD_DEFAULTS[key as keyof FoodConfig]) {
      out[key] = value as number;
    }
  }
  return out as Partial<FoodConfig>;
}

export { parseYaml };
