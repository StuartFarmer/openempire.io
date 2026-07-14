/**
 * Normalize.ts — stage 2 of the Earth-map pipeline: raw physical fields -> the
 * 0..255 bytes that layers.bin stores.
 *
 * PURE and SHARED. The browser tuning page (#earth) and the headless baker
 * (map-generator/earth/bake.ts) both import this module, so what you approve on
 * screen is byte-for-byte what gets baked. No fs, no DOM, no globals.
 *
 * Why the raw fields are kept in physical units (metres, degC, mm/yr, km^2) and
 * normalized *here* rather than during ingest: normalization is where all the
 * judgement lives, and it must be cheap to redo. Ingest runs GDAL for minutes;
 * this runs in milliseconds, so the sliders can be live.
 */
import { LayerName } from "../../../core/game/MapLayers";

export interface Field {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/** The raw planes emitted by ingest.py, keyed by name. */
export type RawFields = Record<string, Field>;

// ─────────────────────────── primitive ops ───────────────────────────

export function makeField(width: number, height: number): Field {
  return { width, height, data: new Float32Array(width * height) };
}

export function mapField(
  f: Field,
  fn: (v: number, i: number) => number,
): Field {
  const out = new Float32Array(f.data.length);
  for (let i = 0; i < f.data.length; i++) out[i] = fn(f.data[i], i);
  return { width: f.width, height: f.height, data: out };
}

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * Separable Gaussian blur. Wraps in X and clamps in Y — the map is a cylinder,
 * so a blur near the antimeridian must bleed across it, not fall off an edge.
 */
export function blur(f: Field, sigma: number): Field {
  if (sigma <= 0) return f;
  const { width: w, height: h } = f;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = (((x + k) % w) + w) % w; // wrap longitude
        acc += f.data[y * w + sx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(h - 1, Math.max(0, y + k)); // clamp latitude
        acc += tmp[sy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Chamfer distance transform, in tiles, from every cell to the nearest seed.
 * Two passes (forward + backward) with a 3x4 chamfer mask; X wraps.
 * Used to decay freshwater proximity away from rivers, lakes and coast.
 */
export function distanceToSeed(seed: Field): Field {
  const { width: w, height: h } = seed;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = seed.data[i] > 0 ? 0 : INF;

  const D1 = 1.0;
  const D2 = 1.4142; // diagonal
  const wrap = (x: number) => ((x % w) + w) % w;
  const at = (x: number, y: number) => d[y * w + wrap(x)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (y > 0) {
        v = Math.min(
          v,
          at(x, y - 1) + D1,
          at(x - 1, y - 1) + D2,
          at(x + 1, y - 1) + D2,
        );
      }
      v = Math.min(v, at(x - 1, y) + D1);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (y < h - 1) {
        v = Math.min(
          v,
          at(x, y + 1) + D1,
          at(x - 1, y + 1) + D2,
          at(x + 1, y + 1) + D2,
        );
      }
      v = Math.min(v, at(x + 1, y) + D1);
      d[i] = v;
    }
  }
  return { width: w, height: h, data: d };
}

// ─────────────────────────── transforms ───────────────────────────

export type Curve = "linear" | "sqrt" | "log1p";

export function applyCurve(v: number, curve: Curve): number {
  if (v <= 0) return 0;
  switch (curve) {
    case "sqrt":
      return Math.sqrt(v);
    case "log1p":
      return Math.log1p(v);
    default:
      return v;
  }
}

/**
 * How a field's range is decided.
 *
 *  - absolute:   fixed physical bounds. Correct when the units MEAN something
 *                (temperature: -30..35 degC is -30..35 degC on every map).
 *  - percentile: bounds taken from the data's own distribution. Correct when the
 *                units are arbitrary or wildly heavy-tailed (mining km^2, whose
 *                max is 330 but whose median nonzero is 0.47 — an absolute range
 *                would crush 99% of mines to a single byte value).
 *
 * Percentiles are computed over NONZERO cells only. These fields are mostly
 * empty (mining touches ~1.2% of tiles), so whole-array percentiles would be 0
 * at every level and the range would collapse.
 */
export type Range =
  | { kind: "absolute"; min: number; max: number }
  | { kind: "percentile"; lo: number; hi: number };

export function resolveRange(
  f: Field,
  range: Range,
  mask?: Field,
): { min: number; max: number } {
  if (range.kind === "absolute") return { min: range.min, max: range.max };

  const vals: number[] = [];
  for (let i = 0; i < f.data.length; i++) {
    if (mask && mask.data[i] <= 0) continue;
    const v = f.data[i];
    if (v > 0 && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return { min: 0, max: 1 };
  vals.sort((a, b) => a - b);
  const pick = (p: number) =>
    vals[
      Math.min(
        vals.length - 1,
        Math.max(0, Math.round((p / 100) * (vals.length - 1))),
      )
    ];
  const min = pick(range.lo);
  const max = pick(range.hi);
  return { min, max: max > min ? max : min + 1e-6 };
}

/** Physical field -> 0..1, via curve, clamp to range, then gamma. */
export function normalize(
  f: Field,
  opts: { curve: Curve; range: Range; gamma: number; blurSigma?: number },
  mask?: Field,
): Field {
  const blurred = opts.blurSigma ? blur(f, opts.blurSigma) : f;
  const curved = mapField(blurred, (v) => applyCurve(v, opts.curve));

  // Percentiles are read off the CURVED data (they're distribution-relative).
  // Absolute bounds are stated in PHYSICAL units, so they must be pushed through
  // the same curve before they can bound the curved data.
  const { min, max } =
    opts.range.kind === "percentile"
      ? resolveRange(curved, opts.range, mask)
      : {
          min: applyCurve(Math.max(0, opts.range.min), opts.curve),
          max: applyCurve(Math.max(0, opts.range.max), opts.curve),
        };

  const span = max - min || 1e-6;
  const g = opts.gamma > 0 ? opts.gamma : 1;
  return mapField(curved, (v) => {
    const t = clamp01((v - min) / span);
    return g === 1 ? t : Math.pow(t, g);
  });
}

/**
 * Signed normalize for fields with meaningful negatives (temperature).
 * Maps [min,max] -> [0,1] linearly WITHOUT the v<=0 -> 0 collapse that
 * applyCurve() imposes; -30 degC must not become the same byte as +0 degC.
 */
export function normalizeSigned(
  f: Field,
  min: number,
  max: number,
  gamma = 1,
): Field {
  const span = max - min || 1e-6;
  return mapField(f, (v) => {
    const t = clamp01((v - min) / span);
    return gamma === 1 ? t : Math.pow(t, gamma);
  });
}

/** 0..1 field -> the Uint8 plane layers.bin stores. */
export function quantize(f: Field): Uint8Array {
  const out = new Uint8Array(f.data.length);
  for (let i = 0; i < f.data.length; i++) {
    out[i] = Math.round(clamp01(f.data[i]) * 255);
  }
  return out;
}

export function combine(fields: Field[], weights: number[]): Field {
  const [first] = fields;
  const out = new Float32Array(first.data.length);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < fields.length; k++) {
    const wgt = weights[k];
    if (wgt === 0) continue;
    const d = fields[k].data;
    for (let i = 0; i < out.length; i++) out[i] += d[i] * wgt;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return { width: first.width, height: first.height, data: out };
}

// ─────────────────────────── layer names ───────────────────────────

export const PLANE_ORDER: LayerName[] = [
  "crop",
  "metal",
  "oil",
  "temperature",
  "humidity",
  "water",
];
