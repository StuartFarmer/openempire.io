/**
 * Reading a finished sweep: which knobs moved which metric, which cells hit
 * the target, and which handful of those to actually go play.
 *
 * The last one is the point. A target band usually contains dozens of cells
 * that are near-duplicates of each other; playing six of those teaches you
 * nothing. `selectDiverse` picks cells that are far apart in parameter space
 * while all satisfying the same target — different economies that agree on
 * the number you asked for, which is exactly the "multiple solutions to one
 * target, now go feel which is best" workflow.
 *
 * When the config declares `objectives:` instead of (or alongside) a target
 * band, the same idea goes multi-dimensional: there is no single best cell,
 * only the Pareto front — the cells no other cell beats on every objective
 * at once. The front IS the answer, and picking from it is a design choice
 * you make by playing, not one the optimizer can make for you.
 */
import { Band, Objective, Scalar } from "./Config";
import { Cell } from "./Space";

export interface CellResult {
  cell: Cell;
  /** Aggregated across seeds: mean_/max_/min_/std_ per metric. */
  metrics: Record<string, number>;
  /** One entry per seed, raw. */
  perSeed: Record<string, number>[];
  seeds: string[];
  hashes: (number | null)[];
  errors: string[];
}

// ── target scoring ──

/** How far outside a band a value sits, in half-widths (0 when inside). */
function bandExcess(value: number, band: Band): number {
  if (value >= band.min && value <= band.max) return 0;
  const half =
    Number.isFinite(band.max) && Number.isFinite(band.min)
      ? Math.max((band.max - band.min) / 2, 1e-9)
      : 1;
  const over = value > band.max ? value - band.max : band.min - value;
  return over / half;
}

export function satisfies(result: CellResult, bands: Band[]): boolean {
  return bands.every((b) => {
    const v = result.metrics[b.metric];
    return v !== undefined && v >= b.min && v <= b.max;
  });
}

/** 0 = every target satisfied; larger = further out. Used only for ranking. */
export function targetScore(result: CellResult, targets: Band[]): number {
  if (targets.length === 0) return 0;
  let score = 0;
  for (const t of targets) {
    const v = result.metrics[t.metric];
    if (v === undefined) {
      score += 1e6;
      continue;
    }
    score += bandExcess(v, t);
    // Inside the band, break ties by closeness to the stated goal, so a
    // dead-centre cell ranks above one hugging the edge.
    if (t.center !== null) {
      const half = Math.max((t.max - t.min) / 2, 1e-9);
      score += 1e-3 * Math.min(1, Math.abs(v - t.center) / half);
    }
  }
  return score;
}

export function rankCells(
  results: CellResult[],
  targets: Band[],
): CellResult[] {
  return [...results].sort(
    (a, b) => targetScore(a, targets) - targetScore(b, targets),
  );
}

export function solutionsOf(
  results: CellResult[],
  targets: Band[],
  constraints: Band[],
): CellResult[] {
  return results.filter(
    (r) =>
      r.errors.length === 0 &&
      satisfies(r, targets) &&
      satisfies(r, constraints),
  );
}

// ── Pareto ──

/** Objective value oriented so that BIGGER IS ALWAYS BETTER. */
export function objectiveValue(result: CellResult, o: Objective): number {
  const v = result.metrics[o.metric];
  if (v === undefined || !Number.isFinite(v)) return -Infinity;
  return o.goal === "minimize" ? -v : v;
}

/**
 * Does `a` dominate `b`? — at least as good on every objective, and strictly
 * better on one.
 *
 * `tolerance` is what keeps seed noise from manufacturing a front. Each
 * objective's tolerance is the margin below which two cells are called equal;
 * set it to roughly the across-seed spread of that metric and a cell can no
 * longer dominate purely by having drawn a luckier map.
 */
export function dominates(
  a: CellResult,
  b: CellResult,
  objectives: Objective[],
): boolean {
  let strictlyBetter = false;
  for (const o of objectives) {
    const av = objectiveValue(a, o);
    const bv = objectiveValue(b, o);
    if (av < bv - o.tolerance) return false;
    if (av > bv + o.tolerance) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * Rank every cell by Pareto layer: 0 is the front, 1 is the front once the
 * front is removed, and so on (Deb's fast non-dominated sort).
 */
export function nonDominatedSort(
  results: CellResult[],
  objectives: Objective[],
): number[] {
  const n = results.length;
  const rank = new Array<number>(n).fill(0);
  const dominatedBy = new Array<number>(n).fill(0);
  const dominatesList: number[][] = Array.from({ length: n }, () => []);
  let current: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dominates(results[i], results[j], objectives)) {
        dominatesList[i].push(j);
        dominatedBy[j]++;
      } else if (dominates(results[j], results[i], objectives)) {
        dominatesList[j].push(i);
        dominatedBy[i]++;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (dominatedBy[i] === 0) {
      rank[i] = 0;
      current.push(i);
    }
  }
  let layer = 0;
  while (current.length > 0) {
    const next: number[] = [];
    for (const i of current) {
      for (const j of dominatesList[i]) {
        if (--dominatedBy[j] === 0) {
          rank[j] = layer + 1;
          next.push(j);
        }
      }
    }
    layer++;
    current = next;
  }
  return rank;
}

export function paretoFront(
  results: CellResult[],
  objectives: Objective[],
): CellResult[] {
  if (objectives.length === 0) return [];
  const rank = nonDominatedSort(results, objectives);
  return results.filter((_, i) => rank[i] === 0);
}

/**
 * NSGA-II crowding distance: how much elbow room each cell has along the
 * front. Boundary cells get Infinity so the extremes are never discarded —
 * they are the configurations that maximise one objective outright, and
 * those are exactly the ones worth feeling out.
 */
export function crowdingDistance(
  front: CellResult[],
  objectives: Objective[],
): number[] {
  const n = front.length;
  const distance = new Array<number>(n).fill(0);
  if (n <= 2) return distance.fill(Infinity);
  for (const o of objectives) {
    const order = front
      .map((r, i) => ({ i, v: objectiveValue(r, o) }))
      .sort((a, b) => a.v - b.v);
    const span = order[n - 1].v - order[0].v;
    distance[order[0].i] = Infinity;
    distance[order[n - 1].i] = Infinity;
    if (span === 0 || !Number.isFinite(span)) continue;
    for (let k = 1; k < n - 1; k++) {
      distance[order[k].i] += (order[k + 1].v - order[k - 1].v) / span;
    }
  }
  return distance;
}

/**
 * Pick `k` cells spread along the front, by crowding distance. The
 * multi-objective analogue of `selectDiverse`: spread in OBJECTIVE space
 * (different trade-offs) rather than parameter space.
 */
export function selectFrontSpread(
  front: CellResult[],
  k: number,
  objectives: Objective[],
): CellResult[] {
  if (front.length <= k) return front;
  const distance = crowdingDistance(front, objectives);
  return front
    .map((r, i) => ({ r, d: distance[i] }))
    .sort((a, b) => b.d - a.d)
    .slice(0, k)
    .map((x) => x.r);
}

/** Sort a front so it reads as a trade-off curve, along the first objective. */
export function orderFront(
  front: CellResult[],
  objectives: Objective[],
): CellResult[] {
  if (objectives.length === 0) return front;
  return [...front].sort(
    (a, b) =>
      objectiveValue(b, objectives[0]) - objectiveValue(a, objectives[0]),
  );
}

// ── sensitivity ──

export interface Sensitivity {
  param: string;
  metric: string;
  /** Pearson correlation between the axis and the metric across cells. */
  r: number;
  /** Metric change per 1σ of the parameter (the standardized OLS slope). */
  perSigma: number;
  n: number;
}

function pearson(xs: number[], ys: number[]): { r: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return { r: 0, slope: 0 };
  return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx };
}

/**
 * Per-axis effect on each metric. Univariate on purpose: with a random
 * sweep the axes are near-independent, and a univariate slope is the thing
 * a human can act on ("raise wCong, gini falls ~0.07 per σ").
 */
export function sensitivities(
  results: CellResult[],
  metrics: string[],
): Sensitivity[] {
  const usable = results.filter((r) => r.errors.length === 0);
  if (usable.length < 3) return [];
  const axes = Object.keys(usable[0].cell.swept).filter((name) =>
    usable.every((r) => typeof r.cell.swept[name] === "number"),
  );
  const out: Sensitivity[] = [];
  for (const param of axes) {
    const xs = usable.map((r) => r.cell.swept[param] as number);
    const sd = Math.sqrt(
      xs.reduce(
        (a, b) => a + (b - xs.reduce((s, v) => s + v, 0) / xs.length) ** 2,
        0,
      ) / xs.length,
    );
    for (const metric of metrics) {
      const ys = usable.map((r) => r.metrics[metric]);
      if (ys.some((y) => y === undefined || !Number.isFinite(y))) continue;
      const { r, slope } = pearson(xs, ys);
      out.push({ param, metric, r, perSigma: slope * sd, n: usable.length });
    }
  }
  return out;
}

// ── diverse solution picking ──

function normalizedRows(results: CellResult[]): {
  axes: string[];
  rows: number[][];
} {
  if (results.length === 0) return { axes: [], rows: [] };
  const axes = Object.keys(results[0].cell.swept).filter((name) =>
    results.every((r) => typeof r.cell.swept[name] === "number"),
  );
  const cols = axes.map((a) => results.map((r) => r.cell.swept[a] as number));
  const ranges = cols.map((c) => {
    const lo = Math.min(...c);
    const hi = Math.max(...c);
    return { lo, span: hi - lo || 1 };
  });
  const rows = results.map((_, i) =>
    axes.map((_a, j) => (cols[j][i] - ranges[j].lo) / ranges[j].span),
  );
  return { axes, rows };
}

/**
 * Farthest-point sampling: start from the best-scoring cell, then repeatedly
 * take the candidate whose nearest already-picked neighbour is furthest away.
 * Gives k solutions that span the in-band region instead of clustering.
 */
export function selectDiverse(
  candidates: CellResult[],
  k: number,
  targets: Band[],
): CellResult[] {
  if (candidates.length <= k) return rankCells(candidates, targets);
  const ranked = rankCells(candidates, targets);
  const { rows } = normalizedRows(ranked);
  if (rows.length === 0 || rows[0].length === 0) return ranked.slice(0, k);

  const dist = (a: number[], b: number[]) =>
    Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

  const picked = [0];
  const nearest = rows.map((row) => dist(row, rows[0]));
  while (picked.length < k) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < rows.length; i++) {
      if (picked.includes(i)) continue;
      if (nearest[i] > bestD) {
        bestD = nearest[i];
        best = i;
      }
    }
    if (best < 0) break;
    picked.push(best);
    for (let i = 0; i < rows.length; i++) {
      nearest[i] = Math.min(nearest[i], dist(rows[i], rows[best]));
    }
  }
  return picked.map((i) => ranked[i]);
}

// ── in-band parameter ranges ──

export interface AxisRange {
  param: string;
  lo: Scalar;
  hi: Scalar;
  /** Distinct values when the axis is a value list rather than a range. */
  values: Scalar[];
}

/**
 * The sub-space that survives the target: for each axis, the span of values
 * seen among solutions. This is the "which parameter regions are good"
 * answer — narrow spans are the knobs the target actually pins down, wide
 * spans are the knobs you are still free to choose on feel.
 */
export function bandRanges(solutions: CellResult[]): AxisRange[] {
  if (solutions.length === 0) return [];
  const axes = Object.keys(solutions[0].cell.swept);
  return axes.map((param) => {
    const vals = solutions.map((s) => s.cell.swept[param]);
    const nums = vals.filter((v): v is number => typeof v === "number");
    const distinct = [...new Set(vals)].sort((a, b) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b)),
    );
    return {
      param,
      lo: nums.length === vals.length ? Math.min(...nums) : distinct[0],
      hi:
        nums.length === vals.length
          ? Math.max(...nums)
          : distinct[distinct.length - 1],
      values: distinct,
    };
  });
}
