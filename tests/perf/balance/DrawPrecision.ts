/**
 * How close do the placement draws run to a DIFFERENT answer?
 *
 * port-economy-to-gpu D2 requires the GPU to select the same tile as the CPU,
 * not merely a tile with the same probability. Both draws are threshold walks:
 * accumulate weight until you pass `r`, and place whatever you are standing on.
 * The GPU evaluates the weights in f32 where the CPU uses f64, so the two pools
 * differ by a relative ~1e-7 however carefully the expression is transcribed —
 * and that only matters if a draw is ever within 1e-7 of a boundary.
 *
 * This measures it directly. For every draw in a real seeded game it records the
 * MARGIN: the distance from `r` to the nearer edge of the winner's interval, as
 * a fraction of the pool's total weight. A perturbation smaller than the margin
 * cannot change the outcome; one larger than it can.
 *
 * The number decides task 4.2. Margins comfortably above 1e-7 mean an f32 draw
 * is bit-identical in practice and the hash gate is reachable as written.
 * Margins that reach down to it mean the weights must become integers on both
 * sides — which D2 already commits to, but on evidence rather than on caution.
 *
 * Usage:
 *   npx tsx tests/perf/balance/DrawPrecision.ts --map verdantia --ticks 3000 \
 *       [--bots 40] [--nations 20] [--seed base-0]
 */
import {
  drawMargin,
  setDrawObserver,
} from "../../../src/core/execution/utils/DrawProbe";
import { Difficulty, GameMapType } from "../../../src/core/game/Game";
import { runGame } from "./RunGame";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/** Local copy: importing BalanceRun's would also run its CLI main. */
function resolveMap(name: string): GameMapType {
  const key = Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (key === undefined) throw new Error(`unknown map "${name}"`);
  return GameMapType[key as keyof typeof GameMapType];
}

/** Decade buckets of the margin, from 1e-9 up. Index 0 is "below 1e-9". */
const DECADES = 10;

/** Relative perturbations to test, as multiples of an f32 ulp (~6e-8). One ulp
 *  is the floor of what transcribing the expression into f32 costs; a sum of
 *  ~60 such terms accumulates several, so the larger multiples are the honest
 *  ones. */
const ULP = 6e-8;
const PERTURBATIONS = [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536];

interface Stats {
  draws: number;
  singleton: number;
  min: number;
  /** Draws whose margin is below each decade threshold 1e-9 … 1e-1. */
  buckets: number[];
  /** The tightest few, for a sense of what a near miss looks like. */
  tightest: { margin: number; pool: number }[];
  /** Draws that pick a DIFFERENT candidate once the weights are perturbed by
   *  each multiple of an ulp — the extrapolation, measured instead. */
  flips: number[];
}

/** Walk a pool the way both draws do, and name the winner. */
function walk(weights: readonly number[], r: number): number {
  let acc = r;
  for (let i = 0; i < weights.length; i++) {
    acc -= weights[i];
    if (acc <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Would a weight perturbation of `rel` change this draw's answer?
 *
 * The perturbation is signed per candidate — a systematic shift moves every
 * cumulative boundary together and cancels, which is not what f32 does. Each
 * weight goes up or down by `rel` on a deterministic per-index parity, and the
 * draw value is re-derived from the perturbed total (the GPU draws against its
 * OWN total, not the CPU's).
 */
function flipsUnder(
  weights: readonly number[],
  r: number,
  picked: number,
  rel: number,
): boolean {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return false;
  const shifted = weights.map((w, i) => w * (i % 2 === 0 ? 1 + rel : 1 - rel));
  let shiftedTotal = 0;
  for (const w of shifted) shiftedTotal += w;
  return walk(shifted, (r / total) * shiftedTotal) !== picked;
}

function emptyStats(): Stats {
  return {
    draws: 0,
    singleton: 0,
    min: 1,
    buckets: new Array(DECADES).fill(0),
    tightest: [],
    flips: new Array(PERTURBATIONS.length).fill(0),
  };
}

function record(
  s: Stats,
  weights: readonly number[],
  r: number,
  picked: number,
): void {
  const margin = drawMargin(weights, r, picked);
  const pool = weights.length;
  s.draws += 1;
  if (pool <= 1) {
    s.singleton += 1;
    return;
  }
  PERTURBATIONS.forEach((mult, k) => {
    if (flipsUnder(weights, r, picked, mult * ULP)) s.flips[k] += 1;
  });
  if (margin < s.min) s.min = margin;
  for (let d = 0; d < DECADES; d++) {
    if (margin < Math.pow(10, -(DECADES - d))) s.buckets[d] += 1;
  }
  s.tightest.push({ margin, pool });
  s.tightest.sort((a, b) => a.margin - b.margin);
  if (s.tightest.length > 5) s.tightest.length = 5;
}

async function main(): Promise<void> {
  const map = resolveMap(arg("map", "verdantia"));
  const ticks = Number(arg("ticks", "3000"));
  const bots = Number(arg("bots", "40"));
  const nations = Number(arg("nations", "20"));
  const seed = arg("seed", "base-0");

  const stats: Record<"urban" | "patch", Stats> = {
    urban: emptyStats(),
    patch: emptyStats(),
  };
  setDrawObserver((kind, weights, r, picked) => {
    record(stats[kind], weights, r, picked);
  });

  await runGame({
    map,
    seed,
    ticks,
    bots,
    nations,
    sampleEvery: 1000,
    difficulty: Difficulty.Medium,
    overrides: {},
  });
  setDrawObserver(null);

  for (const kind of ["urban", "patch"] as const) {
    const s = stats[kind];
    const contested = s.draws - s.singleton;
    console.log(
      `\n${kind}: ${s.draws} draws, ${s.singleton} with a single candidate ` +
        `(${contested} where the margin can matter)`,
    );
    if (contested === 0) continue;
    console.log(`  tightest margin: ${s.min.toExponential(3)}`);
    for (let d = 0; d < DECADES; d++) {
      const threshold = Math.pow(10, -(DECADES - d));
      if (s.buckets[d] === 0) continue;
      console.log(
        `  below ${threshold.toExponential(0)}: ${s.buckets[d]} ` +
          `(${((s.buckets[d] / contested) * 100).toFixed(4)}%)`,
      );
    }
    console.log(
      `  five tightest: ${s.tightest
        .map((t) => `${t.margin.toExponential(2)} (pool ${t.pool})`)
        .join(", ")}`,
    );
    // MEASURED, not extrapolated: re-run each draw with the weights perturbed
    // by a few f32 ulps and count the ones that name a different tile.
    PERTURBATIONS.forEach((mult, k) => {
      const n = s.flips[k];
      console.log(
        `  flips at ${mult} ulp (${(mult * ULP).toExponential(1)}): ${n} of ` +
          `${contested} — ${n === 0 ? "none" : `1 in ${Math.round(contested / n)}`}`,
      );
    });
  }
}

void main();
