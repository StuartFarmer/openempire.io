/**
 * The hydro.bin sidecar format: two per-tile Uint8 planes that keep lakes and
 * rivers SEPARATE for rendering, the way the world-engine colorizer always
 * did (WorldEngineElevation.ts uses `lakes` and `watermap` as distinct
 * fields). layers.bin's single "water" plane deliberately merges them into a
 * freshwater-proximity field for the food economy — good for "is there
 * drinkable water near this tile," useless for "is this a lake or a river,"
 * because strong rivers and lakes both saturate it. Runtime terrain
 * derivation reads THIS sidecar instead, so lakes flag as lakes and rivers
 * grade on their own signal.
 *
 * Raw concatenated row-major planes in HYDRO_PLANE_NAMES order — no header,
 * dimensions come from the manifest. Single source of truth: exporters,
 * loaders, and tests all import it. The Go baker never parses it (copy + size
 * check only), same contract as layers.bin / elevation.bin.
 */

export const HYDRO_PLANE_NAMES = [
  // Standing water the coastline mask misses (Great Lakes, Caspian, Baikal…
  // are LAND in map.bin). 0 or 255.
  "lake",
  // River channel strength, normalized 0..1 (world-engine normalized
  // watermap; log-normalized discharge for real-data maps). The shell's
  // river thresholds act on this.
  "river",
] as const;

export type HydroPlaneName = (typeof HYDRO_PLANE_NAMES)[number];

const HYDRO_INDEX = new Map<HydroPlaneName, number>(
  HYDRO_PLANE_NAMES.map((name, i) => [name, i]),
);

export function hydroPlaneOffset(
  name: HydroPlaneName,
  width: number,
  height: number,
): number {
  const index = HYDRO_INDEX.get(name);
  if (index === undefined) {
    throw new Error(`unknown hydro plane "${name}"`);
  }
  return index * width * height;
}

export function expectedHydroByteLength(width: number, height: number): number {
  return HYDRO_PLANE_NAMES.length * width * height;
}

/** Validate a hydro.bin blob against the map dimensions. Throws on mismatch. */
export function decodeHydro(
  bytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const expected = expectedHydroByteLength(width, height);
  if (bytes.length !== expected) {
    throw new Error(
      `hydro.bin size mismatch: got ${bytes.length} bytes, expected ${expected} (${HYDRO_PLANE_NAMES.length} planes × ${width}×${height})`,
    );
  }
  return bytes;
}

/**
 * Build a hydro.bin blob from normalized float fields (0..1, row-major),
 * quantizing to Uint8 via round(clamp01(v) * 255).
 */
export function encodeHydro(
  planes: Record<HydroPlaneName, ArrayLike<number>>,
  width: number,
  height: number,
): Uint8Array {
  const planeSize = width * height;
  const out = new Uint8Array(expectedHydroByteLength(width, height));
  for (const name of HYDRO_PLANE_NAMES) {
    const source = planes[name];
    if (source.length !== planeSize) {
      throw new Error(
        `hydro plane "${name}" has ${source.length} values, expected ${planeSize}`,
      );
    }
    const offset = hydroPlaneOffset(name, width, height);
    for (let i = 0; i < planeSize; i++) {
      const v = source[i];
      const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
      out[offset + i] = Math.round(clamped * 255);
    }
  }
  return out;
}
