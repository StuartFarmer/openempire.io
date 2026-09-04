/**
 * NSGA-II: the evolutionary half of `method: nsga2`.
 *
 * Why evolve at all, when random search plus a Pareto filter already finds a
 * front? Because random search spends its budget uniformly over the whole
 * box, and the front is usually a thin sliver of it. Once a generation has
 * been evaluated, the cells on (or near) the current front are evidence about
 * WHERE the sliver is, and breeding from them concentrates the next batch
 * there. With three or more objectives and five or more knobs that is the
 * difference between a front of four ragged points and one you can read a
 * trade-off curve off.
 *
 * The operators are the standard ones (Deb et al.): binary tournament on
 * (rank, crowding), simulated binary crossover, polynomial mutation, and
 * μ+λ elitist truncation. Value-list axes can't be arithmetically crossed, so
 * they inherit from one parent and mutate by resampling.
 *
 * Everything draws from a seeded PseudoRandom, so a given config + seed
 * reproduces the same search — the same guarantee the rest of the harness
 * makes.
 */
import { PseudoRandom } from "../../../../src/core/PseudoRandom";
import { CellResult, crowdingDistance, nonDominatedSort } from "./Analyze";
import { Objective, ParamSpec, Scalar } from "./Config";
import { Cell } from "./Space";

/** Distribution indices: higher = offspring hug their parents more closely. */
const CROSSOVER_ETA = 15;
const MUTATION_ETA = 20;
const CROSSOVER_RATE = 0.9;

function tidy(x: number): number {
  return Number.isInteger(x) ? x : Number(x.toPrecision(6));
}

function clampToSpec(value: number, p: ParamSpec): number {
  const v = Math.min(p.max!, Math.max(p.min!, value));
  if (p.distribution === "int") return Math.round(v);
  if (p.q !== undefined) {
    return Math.min(p.max!, Math.max(p.min!, Math.round(v / p.q) * p.q));
  }
  return tidy(v);
}

/** Simulated binary crossover of one continuous gene. */
function sbx(
  a: number,
  b: number,
  p: ParamSpec,
  rand: PseudoRandom,
): [number, number] {
  if (Math.abs(a - b) < 1e-12) return [a, b];
  const u = rand.next();
  const beta =
    u <= 0.5
      ? Math.pow(2 * u, 1 / (CROSSOVER_ETA + 1))
      : Math.pow(1 / (2 * (1 - u)), 1 / (CROSSOVER_ETA + 1));
  const mid = 0.5 * (a + b);
  const half = 0.5 * beta * (a - b);
  return [clampToSpec(mid + half, p), clampToSpec(mid - half, p)];
}

/** Polynomial mutation of one continuous gene. */
function polynomial(value: number, p: ParamSpec, rand: PseudoRandom): number {
  const lo = p.min!;
  const hi = p.max!;
  if (hi <= lo) return value;
  const u = rand.next();
  const delta =
    u < 0.5
      ? Math.pow(2 * u, 1 / (MUTATION_ETA + 1)) - 1
      : 1 - Math.pow(2 * (1 - u), 1 / (MUTATION_ETA + 1));
  return clampToSpec(value + delta * (hi - lo), p);
}

/**
 * Rank the population the NSGA-II way: Pareto layer first, then crowding
 * distance (descending) within a layer. Returns indices, best first.
 */
export function nsgaOrder(
  results: CellResult[],
  objectives: Objective[],
): number[] {
  const rank = nonDominatedSort(results, objectives);
  const crowding = new Array<number>(results.length).fill(0);
  const layers = new Map<number, number[]>();
  results.forEach((_, i) => {
    const layer = layers.get(rank[i]);
    if (layer === undefined) layers.set(rank[i], [i]);
    else layer.push(i);
  });
  for (const indices of layers.values()) {
    const d = crowdingDistance(
      indices.map((i) => results[i]),
      objectives,
    );
    indices.forEach((i, k) => (crowding[i] = d[k]));
  }
  return results
    .map((_, i) => i)
    .sort((a, b) =>
      rank[a] !== rank[b] ? rank[a] - rank[b] : crowding[b] - crowding[a],
    );
}

/** Keep the best `size` of a combined parent+offspring pool (μ+λ elitism). */
export function truncate(
  results: CellResult[],
  size: number,
  objectives: Objective[],
): CellResult[] {
  if (results.length <= size) return results;
  return nsgaOrder(results, objectives)
    .slice(0, size)
    .map((i) => results[i]);
}

/**
 * Breed the next generation from an evaluated population.
 *
 * `existingIds` are cells already evaluated at any point in the run; children
 * colliding with one are re-mutated rather than burning a game on a repeat.
 */
export function nextGeneration(
  population: CellResult[],
  objectives: Objective[],
  params: ParamSpec[],
  rand: PseudoRandom,
  count: number,
  existingIds: Set<string>,
): Record<string, Scalar>[] {
  const swept = params.filter((p) => p.kind !== "fixed");
  const fixed: Record<string, Scalar> = {};
  for (const p of params) {
    if (p.kind === "fixed") fixed[p.name] = p.value!;
  }

  const order = nsgaOrder(population, objectives);
  const fitness = new Map<number, number>();
  order.forEach((idx, position) => fitness.set(idx, position));

  /** Binary tournament: the better-ranked of two random members. */
  const pick = (): CellResult => {
    const a = rand.nextInt(0, population.length);
    const b = rand.nextInt(0, population.length);
    return (fitness.get(a) ?? 0) <= (fitness.get(b) ?? 0)
      ? population[a]
      : population[b];
  };

  const children: Record<string, Scalar>[] = [];
  const seen = new Set(existingIds);
  const idOf = (c: Record<string, Scalar>) =>
    swept
      .map((p) => p.name)
      .sort()
      .map((n) => `${n}=${c[n]}`)
      .join(",");

  let guard = 0;
  while (children.length < count && guard < count * 50) {
    guard++;
    const mumCell = pick().cell.params;
    const dadCell = pick().cell.params;
    const kidA: Record<string, Scalar> = { ...fixed };
    const kidB: Record<string, Scalar> = { ...fixed };
    const doCross = rand.next() < CROSSOVER_RATE;
    // Mutating exactly one gene per child on average is the usual default.
    const mutationRate = 1 / Math.max(1, swept.length);

    for (const p of swept) {
      const mum = mumCell[p.name];
      const dad = dadCell[p.name];
      if (
        p.kind === "range" &&
        typeof mum === "number" &&
        typeof dad === "number"
      ) {
        const [x, y] = doCross ? sbx(mum, dad, p, rand) : [mum, dad];
        kidA[p.name] = rand.next() < mutationRate ? polynomial(x, p, rand) : x;
        kidB[p.name] = rand.next() < mutationRate ? polynomial(y, p, rand) : y;
        continue;
      }
      // Value lists: inherit from a parent, or resample on mutation.
      const values = p.values!;
      const inheritA = rand.next() < 0.5 ? mum : dad;
      const inheritB = rand.next() < 0.5 ? mum : dad;
      kidA[p.name] =
        rand.next() < mutationRate
          ? values[rand.nextInt(0, values.length)]
          : inheritA;
      kidB[p.name] =
        rand.next() < mutationRate
          ? values[rand.nextInt(0, values.length)]
          : inheritB;
    }

    for (const kid of [kidA, kidB]) {
      if (children.length >= count) break;
      const id = idOf(kid);
      if (seen.has(id)) continue;
      seen.add(id);
      children.push(kid);
    }
  }
  return children;
}

/** Build sweep Cells from raw parameter assignments, numbered from `offset`. */
export function cellsFrom(
  assignments: Record<string, Scalar>[],
  params: ParamSpec[],
  offset: number,
): Cell[] {
  const sweptNames = params
    .filter((p) => p.kind !== "fixed")
    .map((p) => p.name);
  return assignments.map((assignment, i) => {
    const swept: Record<string, Scalar> = {};
    for (const n of sweptNames) swept[n] = assignment[n];
    const id = Object.keys(swept)
      .sort()
      .map((k) => `${k}=${swept[k]}`)
      .join(",");
    return { id, index: offset + i, params: assignment, swept };
  });
}
