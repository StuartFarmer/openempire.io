/**
 * Turning a parameter space into the concrete list of cells to run.
 *
 * A *cell* is one full assignment of every parameter (swept and pinned). It
 * is run `run.seeds` times; the seeds are what the report averages over.
 *
 * Sampling is seeded by `seed:` in the config, so the same file always
 * produces the same cells in the same order — which is what makes a sweep
 * resumable and its report citable.
 */
import { PseudoRandom } from "../../../../src/core/PseudoRandom";
import { ParamSpec, Scalar, SweepDefinition } from "./Config";

export interface Cell {
  /** Stable identity: the sorted swept assignment. Used for resume + dedupe. */
  id: string;
  index: number;
  /** Every parameter, pinned ones included. */
  params: Record<string, Scalar>;
  /** Only the axes that actually vary — the report's x-axes. */
  swept: Record<string, Scalar>;
}

/** Guard against a mistyped `values:` list turning into a million games. */
const MAX_GRID_CELLS = 20_000;

/** Trim float noise (1.2000000000000002) without distorting real precision. */
function tidy(x: number): number {
  if (Number.isInteger(x)) return x;
  return Number(x.toPrecision(6));
}

function sampleRange(p: ParamSpec, rand: PseudoRandom): number {
  const min = p.min!;
  const max = p.max!;
  const r = rand.next();
  switch (p.distribution) {
    case "int":
      return Math.min(max, Math.floor(min + r * (max - min + 1)));
    case "log_uniform":
      return tidy(
        Math.exp(Math.log(min) + r * (Math.log(max) - Math.log(min))),
      );
    case "q_uniform": {
      const q = p.q!;
      return tidy(
        Math.min(
          max,
          Math.max(min, Math.round((min + r * (max - min)) / q) * q),
        ),
      );
    }
    case "q_log_uniform": {
      const q = p.q!;
      const v = Math.exp(Math.log(min) + r * (Math.log(max) - Math.log(min)));
      return tidy(Math.min(max, Math.max(min, Math.round(v / q) * q)));
    }
    default:
      return tidy(min + r * (max - min));
  }
}

function cellId(swept: Record<string, Scalar>): string {
  return Object.keys(swept)
    .sort()
    .map((k) => `${k}=${swept[k]}`)
    .join(",");
}

function makeCell(
  params: Record<string, Scalar>,
  sweptNames: string[],
  index: number,
): Cell {
  const swept: Record<string, Scalar> = {};
  for (const n of sweptNames) swept[n] = params[n];
  return { id: cellId(swept), index, params, swept };
}

export function expandSpace(def: SweepDefinition): Cell[] {
  const fixed: Record<string, Scalar> = {};
  for (const p of def.params) {
    if (p.kind === "fixed") fixed[p.name] = p.value!;
  }
  const swept = def.params.filter((p) => p.kind !== "fixed");
  const sweptNames = swept.map((p) => p.name);

  if (swept.length === 0) {
    return [makeCell({ ...fixed }, [], 0)];
  }

  const cells: Cell[] = [];
  const seen = new Set<string>();
  const push = (params: Record<string, Scalar>): void => {
    const cell = makeCell(params, sweptNames, cells.length);
    if (seen.has(cell.id)) return;
    seen.add(cell.id);
    cells.push(cell);
  };

  if (def.method === "grid") {
    const total = swept.reduce((a, p) => a * p.values!.length, 1);
    if (total > MAX_GRID_CELLS) {
      throw new Error(
        `sweep config: grid would expand to ${total.toLocaleString()} cells ` +
          `(cap ${MAX_GRID_CELLS.toLocaleString()}). Trim a "values" list or ` +
          `switch to method: random with a "samples" budget.`,
      );
    }
    const walk = (i: number, acc: Record<string, Scalar>): void => {
      if (i === swept.length) {
        push({ ...acc });
        return;
      }
      for (const v of swept[i].values!) {
        walk(i + 1, { ...acc, [swept[i].name]: v });
      }
    };
    walk(0, { ...fixed });
    return cells;
  }

  // Random: one draw per parameter per sample. Duplicate assignments (only
  // really possible when every axis is a short `values` list) are dropped
  // rather than run twice; the runner reports the shortfall.
  const rand = new PseudoRandom(def.seed);
  for (let i = 0; i < def.samples; i++) {
    const acc: Record<string, Scalar> = { ...fixed };
    for (const p of swept) {
      acc[p.name] =
        p.kind === "values"
          ? p.values![rand.nextInt(0, p.values!.length)]
          : sampleRange(p, rand);
    }
    push(acc);
  }
  return cells;
}

/** Numeric view of a cell's swept axes, for distance and correlation math. */
export function numericAxes(cells: Cell[]): {
  names: string[];
  rows: number[][];
} {
  const names = cells.length === 0 ? [] : Object.keys(cells[0].swept).sort();
  const numeric = names.filter((n) =>
    cells.every((c) => typeof c.swept[n] === "number"),
  );
  const rows = cells.map((c) => numeric.map((n) => c.swept[n] as number));
  return { names: numeric, rows };
}
