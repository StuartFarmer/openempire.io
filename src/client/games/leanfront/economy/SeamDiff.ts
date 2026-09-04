/**
 * Compare what a SEAM SERVES against the CPU function it replaces.
 *
 * The distinction this exists to enforce: verifying the PASS is not verifying
 * the SEAM. The shed's raw flood was verified at 100% cell agreement long
 * before anything consumed it, and wiring the provider in still dropped the
 * district count from ~576 per tick to ~121 — because the artefact the provider
 * hands over is not the flood. It is compacted, read back and reassembled, and
 * every one of those steps can be wrong on its own. Two defects were behind it,
 * and both were invisible to a pass-level check:
 *
 *   - a `for...of` over an array indexed by smallID, which yields `undefined`
 *     for the holes and threw inside `foodTick`, abandoning the economy for the
 *     rest of the tick;
 *   - the flood naming a farm the CPU no longer had.
 *
 * So: membership and values, both directions, on the served artefact.
 *
 * AND THE SIZE OF THE COMPARISON, which is the other half of the lesson. A
 * probe once agreed exactly on a board where nothing was above the claim
 * threshold — every check passed because every check compared nothing. A diff
 * that compared zero entries is not agreement, and `ok` is false when it did.
 */

/** One side of a comparison: a key (usually a tile ref or a district slot) and
 *  the value the seam associates with it. */
export type SeamEntries<K, V> = Iterable<readonly [K, V]>;

export interface SeamDiffResult {
  /** What this diff was of, for the report. */
  label: string;
  /** Keys on BOTH sides — the size of the comparison actually made. */
  compared: number;
  cpuSize: number;
  gpuSize: number;
  /** Membership disagreements, by direction. */
  onlyCpu: number;
  onlyGpu: number;
  /** Present on both, values disagree. */
  valueDiff: number;
  /** Largest distance seen between two values that disagree. */
  worst: number;
  samples: string[];
  /** Nothing was on both sides. Never agreement — always a broken comparison. */
  empty: boolean;
  /** `(onlyCpu + onlyGpu) / cpuSize` — how far the two sides disagree about
   *  WHICH entries exist, as a fraction. */
  membershipDrift: number;
  /** The drift this seam is allowed, and why. A seam computed from a snapshot
   *  before the tick can name entries the tick has since destroyed and miss
   *  ones it has since created; that is design D4's staleness contract, and it
   *  is stated per seam rather than assumed by the reader. Zero unless the call
   *  site says otherwise. */
  allowance: number;
  allowanceReason: string;
  /** Values agree on every key both sides have. This is never relaxed by an
   *  allowance — staleness changes WHICH entries exist, not what they say. */
  valuesOk: boolean;
  /** It compared something, values agree, and membership drift is inside the
   *  stated allowance. */
  ok: boolean;
}

export interface SeamDiffOptions<V> {
  label?: string;
  /** Values agree. Defaults to `Object.is`, which is exact and is what every
   *  integer reduction in this pipeline must satisfy. */
  equal?: (cpu: V, gpu: V) => boolean;
  /** How far apart two disagreeing values are, for `worst`. Defaults to
   *  numeric absolute difference, and to NaN for values that are not numbers —
   *  a `worst` of NaN says "these are not numbers", which is more useful than
   *  a silent 0. */
  distance?: (cpu: V, gpu: V) => number;
  maxSamples?: number;
  format?: (key: unknown, cpu: V, gpu: V) => string;
  /** Membership drift this seam is permitted, as a fraction of the CPU set,
   *  together with the reason. Both or neither — an allowance without a stated
   *  cause is a tolerance, and a tolerance is how a defect becomes a habit. */
  membershipAllowance?: number;
  allowanceReason?: string;
}

const isNum = (v: unknown): v is number => typeof v === "number";

/**
 * Diff two keyed sets. Both arguments are the CONSUMER'S VIEW — what the CPU
 * function returns, and what the provider serves in its place — not the buffers
 * behind them.
 */
export function seamDiff<K, V>(
  cpu: SeamEntries<K, V>,
  gpu: SeamEntries<K, V>,
  opts: SeamDiffOptions<V> = {},
): SeamDiffResult {
  const label = opts.label ?? "seam";
  const equal = opts.equal ?? ((a: V, b: V): boolean => Object.is(a, b));
  const distance =
    opts.distance ??
    ((a: V, b: V): number =>
      isNum(a) && isNum(b) ? Math.abs(a - b) : Number.NaN);
  const maxSamples = opts.maxSamples ?? 5;
  const format =
    opts.format ??
    ((k: unknown, a: V, b: V): string => `key=${String(k)} cpu=${a} gpu=${b}`);

  const cpuMap = cpu instanceof Map ? cpu : new Map<K, V>(cpu);
  const gpuMap = gpu instanceof Map ? gpu : new Map<K, V>(gpu);

  let compared = 0;
  let onlyCpu = 0;
  let onlyGpu = 0;
  let valueDiff = 0;
  let worst = 0;
  const samples: string[] = [];

  for (const [k, a] of cpuMap) {
    if (!gpuMap.has(k)) {
      onlyCpu += 1;
      continue;
    }
    compared += 1;
    const b = gpuMap.get(k) as V;
    if (equal(a, b)) continue;
    valueDiff += 1;
    const d = distance(a, b);
    if (!(d <= worst)) worst = d; // NaN-safe: NaN propagates rather than hiding
    if (samples.length < maxSamples) samples.push(format(k, a, b));
  }
  for (const k of gpuMap.keys()) if (!cpuMap.has(k)) onlyGpu += 1;

  const allowance = opts.membershipAllowance ?? 0;
  const allowanceReason = opts.allowanceReason ?? "";
  if (allowance > 0 && allowanceReason === "") {
    throw new Error(
      `seamDiff("${label}"): a membership allowance needs a stated reason`,
    );
  }

  const empty = compared === 0;
  const membershipDrift =
    cpuMap.size === 0 ? 0 : (onlyCpu + onlyGpu) / cpuMap.size;
  const valuesOk = valueDiff === 0;
  return {
    label,
    compared,
    cpuSize: cpuMap.size,
    gpuSize: gpuMap.size,
    onlyCpu,
    onlyGpu,
    valueDiff,
    worst,
    samples,
    empty,
    membershipDrift,
    allowance,
    allowanceReason,
    valuesOk,
    ok: !empty && valuesOk && membershipDrift <= allowance,
  };
}

/**
 * Sum per-player (or per-district) diffs into one. Every count adds; `worst`
 * takes the maximum; `ok` requires that the WHOLE set compared something, not
 * that each part did — a player with no shed contributes nothing and is not a
 * failure, but a run in which no player had one is.
 */
export function mergeSeamDiffs(
  parts: readonly SeamDiffResult[],
  label: string,
): SeamDiffResult {
  const out: SeamDiffResult = {
    label,
    compared: 0,
    cpuSize: 0,
    gpuSize: 0,
    onlyCpu: 0,
    onlyGpu: 0,
    valueDiff: 0,
    worst: 0,
    samples: [],
    empty: true,
    membershipDrift: 0,
    allowance: 0,
    allowanceReason: "",
    valuesOk: true,
    ok: false,
  };
  for (const p of parts) {
    out.compared += p.compared;
    out.cpuSize += p.cpuSize;
    out.gpuSize += p.gpuSize;
    out.onlyCpu += p.onlyCpu;
    out.onlyGpu += p.onlyGpu;
    out.valueDiff += p.valueDiff;
    if (!(p.worst <= out.worst)) out.worst = p.worst;
    for (const s of p.samples) if (out.samples.length < 5) out.samples.push(s);
  }
  // Parts of one seam come from one call site and state one allowance, but if
  // they ever differ the STRICTEST wins: merging must not be a way to loosen a
  // contract.
  if (parts.length > 0) {
    let strictest = parts[0];
    for (const p of parts) if (p.allowance < strictest.allowance) strictest = p;
    out.allowance = strictest.allowance;
    out.allowanceReason = strictest.allowanceReason;
  }
  out.empty = out.compared === 0;
  out.membershipDrift =
    out.cpuSize === 0 ? 0 : (out.onlyCpu + out.onlyGpu) / out.cpuSize;
  out.valuesOk = out.valueDiff === 0;
  out.ok = !out.empty && out.valuesOk && out.membershipDrift <= out.allowance;
  return out;
}

/** One line for a report, always carrying the size so a vacuous pass is
 *  visible on sight. */
export function formatSeamDiff(r: SeamDiffResult): string {
  const pc = (x: number): string => `${(x * 100).toFixed(3)}%`;
  const head =
    `${r.label}: compared ${r.compared} of cpu ${r.cpuSize} / gpu ${r.gpuSize}` +
    `; only-cpu ${r.onlyCpu}, only-gpu ${r.onlyGpu} (drift ${pc(r.membershipDrift)}` +
    `, allowed ${pc(r.allowance)}), values off ${r.valueDiff}` +
    (r.valueDiff > 0 ? `, worst ${r.worst}` : "");
  if (r.empty) return `${head}\n  FAIL: compared NOTHING — not agreement`;
  if (r.ok) {
    return r.membershipDrift > 0
      ? `${head}\n  drift is within contract: ${r.allowanceReason}`
      : head;
  }
  if (!r.valuesOk) {
    return `${head}\n  FAIL: values disagree — staleness cannot explain this`;
  }
  return (
    `${head}\n  FAIL: membership drift ${pc(r.membershipDrift)} exceeds the ` +
    `stated allowance ${pc(r.allowance)}`
  );
}
