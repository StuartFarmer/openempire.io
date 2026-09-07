/**
 * The season.bin sidecar format: two per-tile Uint8 planes describing the
 * real seasonal temperature cycle as a first harmonic — amplitude and phase —
 * so a sine oscillator reproduces each tile's monthly swing. Fit from monthly
 * land-surface-temperature data (MODIS LST): per tile, the deviation from the
 * annual mean is `amplitude · cos(2π·(yearPhase − phase))`. This replaces the
 * crude latitude×tilt seasonal model with real continentality — maritime
 * coasts barely move, continental interiors swing 25 °C+.
 *
 * OPTIONAL sidecar (unlike layers/elevation/hydro): only real-data maps carry
 * it. Generated maps and the fallback path use the latitude model. Raw
 * concatenated row-major planes in SEASON_PLANE_NAMES order — no header,
 * dimensions from the manifest. The Go baker copies + size-checks only.
 */

/** °C amplitude that maps to a stored byte of 255 (headroom over the ~40 °C
 * extreme of Siberian interiors). */
export const SEASON_AMPLITUDE_MAX_C = 50;

export const SEASON_PLANE_NAMES = [
  // Seasonal swing amplitude, °C, stored as amplitude / SEASON_AMPLITUDE_MAX_C.
  "amplitude",
  // Phase: fraction of the year (0..1) at which temperature peaks.
  "phase",
] as const;

export type SeasonPlaneName = (typeof SEASON_PLANE_NAMES)[number];

const SEASON_INDEX = new Map<SeasonPlaneName, number>(
  SEASON_PLANE_NAMES.map((name, i) => [name, i]),
);

export function seasonPlaneOffset(
  name: SeasonPlaneName,
  width: number,
  height: number,
): number {
  const index = SEASON_INDEX.get(name);
  if (index === undefined) {
    throw new Error(`unknown season plane "${name}"`);
  }
  return index * width * height;
}

export function expectedSeasonByteLength(
  width: number,
  height: number,
): number {
  return SEASON_PLANE_NAMES.length * width * height;
}

/** Validate a season.bin blob against the map dimensions. Throws on mismatch. */
export function decodeSeason(
  bytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const expected = expectedSeasonByteLength(width, height);
  if (bytes.length !== expected) {
    throw new Error(
      `season.bin size mismatch: got ${bytes.length} bytes, expected ${expected} (${SEASON_PLANE_NAMES.length} planes × ${width}×${height})`,
    );
  }
  return bytes;
}
