/**
 * A seam onto the two weighted PLACEMENT DRAWS, for measuring how close they
 * run to a different answer.
 *
 * Both draws walk a candidate pool accumulating weight until they pass a random
 * value `r`. Whichever candidate the walk is standing on when it crosses is the
 * one placed. So the outcome is decided by a THRESHOLD, and a threshold is only
 * as stable as the gap between `r` and the nearest cumulative boundary: perturb
 * the weights by less than that gap and nothing moves; perturb them by more and
 * a different tile is built.
 *
 * That gap is the whole question for port-economy-to-gpu. The GPU evaluates the
 * weights in f32 where the CPU uses f64, so the two pools differ by a relative
 * ~1e-7 no matter how carefully the expression is transcribed. If every draw
 * clears its nearest boundary by much more than that, an f32 draw picks the same
 * tile and the port's hash gate is reachable as written. If draws routinely run
 * closer, the weights have to become integers on both sides — which is what
 * design D2 and task 4.2 already commit to, but only once it is MEASURED rather
 * than assumed.
 *
 * Off unless a probe installs an observer, and it is scaffolding: it goes with
 * the rest of the port's measurement rig (task 5.3).
 */

/** One draw: the pool, its weights, the draw value, and the index chosen. */
export type DrawObserver = (
  kind: "urban" | "patch",
  weights: readonly number[],
  r: number,
  picked: number,
) => void;

let observer: DrawObserver | null = null;

/** Install (or clear, with null) the draw observer. */
export function setDrawObserver(fn: DrawObserver | null): void {
  observer = fn;
}

/** Report a completed draw. Costs one null check when nothing is watching. */
export function observeDraw(
  kind: "urban" | "patch",
  weights: readonly number[],
  r: number,
  picked: number,
): void {
  if (observer !== null) observer(kind, weights, r, picked);
}

/**
 * How much the pool's weights would have to move, in RELATIVE terms, before
 * this draw lands on a different candidate.
 *
 * The walk crosses zero somewhere inside the winner's weight, so the distance
 * to the nearest edge of that interval is the slack: `r` measured against the
 * cumulative sum just before the winner, and against the cumulative sum just
 * after it. Normalised by the total so the number is comparable across pools of
 * any size, and directly against f32's ~1e-7.
 *
 * A single-candidate pool is returned as 1 — there is no other answer to reach,
 * so no perturbation can change it.
 */
export function drawMargin(
  weights: readonly number[],
  r: number,
  picked: number,
): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0 || weights.length <= 1) return 1;
  let before = 0;
  for (let i = 0; i < picked; i++) before += weights[i];
  const after = before + weights[picked];
  return Math.min(r - before, after - r) / total;
}
