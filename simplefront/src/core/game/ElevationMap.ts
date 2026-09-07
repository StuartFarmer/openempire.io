/**
 * The elevation.bin sidecar format: the map's full-precision elevation as a
 * single row-major plane of unsigned 16-bit little-endian values (2 bytes per
 * tile, width × height entries, no header), quantized from the world engine's
 * normalized 0..1 elevation. This module is the single source of truth for
 * the format — the generator exporter, the retrofit tool, the loaders, and
 * the tests all import it, so encoder and decoder cannot drift. The Go baker
 * never parses the file (copy + size check only).
 */

export const ELEVATION_BYTES_PER_TILE = 2;
export const ELEVATION_MAX = 0xffff;

export function expectedElevationByteLength(
  width: number,
  height: number,
): number {
  return width * height * ELEVATION_BYTES_PER_TILE;
}

/**
 * Build an elevation.bin blob from a normalized float field (0..1, row-major,
 * width × height), quantizing via round(clamp01(v) * 65535), little-endian.
 */
export function encodeElevation(
  values: ArrayLike<number>,
  width: number,
  height: number,
): Uint8Array {
  const count = width * height;
  if (values.length !== count) {
    throw new Error(
      `elevation has ${values.length} values, expected ${count} (${width}×${height})`,
    );
  }
  const out = new Uint8Array(expectedElevationByteLength(width, height));
  const view = new DataView(out.buffer);
  for (let i = 0; i < count; i++) {
    const v = values[i];
    const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
    view.setUint16(i * 2, Math.round(clamped * ELEVATION_MAX), true);
  }
  return out;
}

/**
 * Validate an elevation.bin blob against the map dimensions and decode it to
 * normalized floats (0..1). Throws on size mismatch — callers decide whether
 * that is fatal or a downgrade to the baked-terrain fallback.
 */
export function decodeElevation(
  bytes: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const expected = expectedElevationByteLength(width, height);
  if (bytes.length !== expected) {
    throw new Error(
      `elevation.bin size mismatch: got ${bytes.length} bytes, expected ${expected} (${width}×${height} × ${ELEVATION_BYTES_PER_TILE})`,
    );
  }
  const count = width * height;
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    out[i] = view.getUint16(i * 2, true) / ELEVATION_MAX;
  }
  return out;
}
