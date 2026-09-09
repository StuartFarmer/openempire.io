import { clamp, randomSource } from "./config";

export type TerrainKind =
  | "plain"
  | "hillside"
  | "valley"
  | "coast"
  | "pass"
  | "rolling";
export type Brush = "raise" | "lower" | "smooth" | "water" | "dry";
export interface Terrain {
  width: number;
  height: Float64Array;
  water: Uint8Array;
  slope: Float64Array;
  waterDistance: Float64Array;
  neighbours(tile: number): number[];
}
export function flatTerrain(width = 64): Terrain {
  const t: Terrain = {
    width,
    height: new Float64Array(width * width).fill(0.5),
    water: new Uint8Array(width * width),
    slope: new Float64Array(width * width),
    waterDistance: new Float64Array(width * width),
    neighbours(tile: number) {
      const x = tile % width,
        y = Math.floor(tile / width),
        out: number[] = [];
      if (x > 0) out.push(tile - 1);
      if (x < width - 1) out.push(tile + 1);
      if (y > 0) out.push(tile - width);
      if (y < width - 1) out.push(tile + width);
      return out;
    },
  };
  return prepareTerrain(t);
}
export function prepareTerrain(t: Terrain): Terrain {
  const queue: number[] = [];
  t.waterDistance.fill(Infinity);
  for (let i = 0; i < t.height.length; i++) {
    // Ignore underwater height jumps: a shore is not itself a cliff.
    const diffs = t
      .neighbours(i)
      .filter((n) => !t.water[n])
      .map((n) => Math.abs(t.height[i] - t.height[n]));
    t.slope[i] = diffs.length ? Math.max(...diffs) : 0;
    if (t.water[i]) {
      t.waterDistance[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++)
    for (const n of t.neighbours(queue[q])) {
      if (t.waterDistance[n] > t.waterDistance[queue[q]] + 1) {
        t.waterDistance[n] = t.waterDistance[queue[q]] + 1;
        queue.push(n);
      }
    }
  return t;
}
export function cloneTerrain(t: Terrain): Terrain {
  const copy = flatTerrain(t.width);
  copy.height.set(t.height);
  copy.water.set(t.water);
  return prepareTerrain(copy);
}
export function makeTerrain(
  kind: TerrainKind,
  seed: number,
  relief = 1,
): Terrain {
  const t = flatTerrain(),
    rng = randomSource(seed),
    phases = Array.from({ length: 6 }, () => rng() * Math.PI * 2);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = y * 64 + x,
        u = (x - 31.5) / 31.5,
        v = (y - 31.5) / 31.5;
      const river = 31 + 5 * Math.sin(y / 11 + phases[0]);
      let h = 0.5,
        wet = false;
      switch (kind) {
        case "hillside":
          h = 0.5 + 0.38 * u;
          break;
        case "valley":
          h = 0.2 + (0.65 * Math.abs(x - river)) / 40;
          wet = Math.abs(x - river) < 1.4;
          break;
        case "coast":
          h = 0.22 + (0.46 * (v + 1)) / 2 + 0.09 * Math.sin(x / 11);
          wet = y < 14 + 5 * Math.sin(x / 10 + phases[0]);
          break;
        case "pass":
          h =
            0.24 +
            0.65 * Math.exp(-u * u * 14) * (1 - 0.88 * Math.exp(-v * v * 36));
          break;
        case "rolling":
          h =
            0.5 +
            0.16 * Math.sin(x / 9 + phases[0]) +
            0.15 * Math.cos(y / 10 + phases[1]) +
            0.12 * Math.sin((x + y) / 14 + phases[2]);
          break;
      }
      t.height[i] = clamp(0.5 + (h - 0.5) * relief);
      t.water[i] = wet ? 1 : 0;
    }
  return prepareTerrain(t);
}
export function editTerrain(
  t: Terrain,
  tile: number,
  brush: Brush,
  radius: number,
  strength: number,
): void {
  const cx = tile % t.width,
    cy = Math.floor(tile / t.width),
    before = t.height.slice();
  for (
    let y = Math.max(0, cy - radius);
    y <= Math.min(t.width - 1, cy + radius);
    y++
  )
    for (
      let x = Math.max(0, cx - radius);
      x <= Math.min(t.width - 1, cx + radius);
      x++
    ) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      const i = y * t.width + x,
        amount = strength * (1 - distance / (radius + 1));
      if (brush === "water" || brush === "dry")
        t.water[i] = brush === "water" ? 1 : 0;
      else if (brush === "smooth") {
        const ns = [i, ...t.neighbours(i)];
        const mean = ns.reduce((s, n) => s + before[n], 0) / ns.length;
        t.height[i] = clamp(
          before[i] + (mean - before[i]) * clamp(strength * 4),
        );
      } else
        t.height[i] = clamp(before[i] + (brush === "raise" ? amount : -amount));
    }
  prepareTerrain(t);
}
