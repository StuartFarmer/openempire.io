/**
 * The layers.bin sidecar format: per-tile Uint8 data planes baked by the map
 * generator and read by the deterministic sim. The file is raw concatenated
 * row-major planes in LAYER_NAMES order — no header; dimensions come from the
 * map manifest. This module is the single source of truth for the plane set
 * and layout: the generator exporter, the loaders, and the sim all import it,
 * so encoder and decoder cannot drift. The Go baker never parses the file
 * (copy + size check only).
 */

export const LAYER_NAMES = [
  "crop",
  "metal",
  "oil",
  "temperature",
  "humidity",
  // Freshwater proximity (add-urban-core-growth): rivers + lakes + irrigation
  // diffusion, 0..255. Drives the water term of the urban-growth suitability
  // field. Shoreline/ocean-shore are read from the terrain bitmask, not here.
  "water",
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

const LAYER_INDEX = new Map<LayerName, number>(
  LAYER_NAMES.map((name, i) => [name, i]),
);

export function layerPlaneOffset(
  name: LayerName,
  width: number,
  height: number,
): number {
  const index = LAYER_INDEX.get(name);
  if (index === undefined) {
    throw new Error(`unknown map layer "${name}"`);
  }
  return index * width * height;
}

export function expectedLayersByteLength(
  width: number,
  height: number,
): number {
  return LAYER_NAMES.length * width * height;
}

/**
 * Validate a layers.bin blob against the map dimensions and return it as the
 * backing store for per-tile reads. Throws on size mismatch — callers decide
 * whether that is fatal (tests) or downgrade to "no layers" (map loading).
 */
export function decodeLayers(
  bytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const expected = expectedLayersByteLength(width, height);
  if (bytes.length !== expected) {
    throw new Error(
      `layers.bin size mismatch: got ${bytes.length} bytes, expected ${expected} (${LAYER_NAMES.length} planes × ${width}×${height})`,
    );
  }
  return bytes;
}

/**
 * Build a layers.bin blob from normalized float fields (0..1, row-major,
 * width×height each), quantizing to Uint8 via round(clamp01(v) * 255).
 * Used by the generator exporter; the sim only ever sees the quantized bytes.
 */
export function encodeLayers(
  planes: Record<LayerName, ArrayLike<number>>,
  width: number,
  height: number,
): Uint8Array {
  const planeSize = width * height;
  const out = new Uint8Array(expectedLayersByteLength(width, height));
  for (const name of LAYER_NAMES) {
    const source = planes[name];
    if (source.length !== planeSize) {
      throw new Error(
        `layer "${name}" has ${source.length} values, expected ${planeSize}`,
      );
    }
    const offset = layerPlaneOffset(name, width, height);
    for (let i = 0; i < planeSize; i++) {
      const v = source[i];
      const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
      out[offset + i] = Math.round(clamped * 255);
    }
  }
  return out;
}
