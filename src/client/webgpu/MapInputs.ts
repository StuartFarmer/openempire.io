import { decodeElevation } from "../../core/game/ElevationMap";
import {
  hydroPlaneOffset,
  type HydroPlaneName,
} from "../../core/game/HydroMap";
import { layerPlaneOffset, type LayerName } from "../../core/game/MapLayers";
import {
  SEASON_AMPLITUDE_MAX_C,
  seasonPlaneOffset,
  type SeasonPlaneName,
} from "../../core/game/SeasonMap";
import type { FieldDeriveSpec } from "./FieldDynamics";

// Declared map inputs (unify-field-viewer phase 3): a `derive` system names,
// per input field, which sidecar plane fills it and how to decode it — instead
// of the shell hand-decoding elevation.bin / layers.bin / hydro.bin / season.bin
// and wiring each buffer by name. A generic `loadMapInputs` reads the
// declaration and produces the exact same typed arrays the hand-written path
// built, plus a `prepare` CPU hook for inputs a sidecar can't give directly
// (the connected-components water mask). This is the loader the unified
// FieldViewer uses; it must reproduce the shell's decode byte-for-byte.

/** °C-per-normalized-unit for the temperature plane's −30..35 span (65°C). The
 * season amplitude plane is stored as a fraction of SEASON_AMPLITUDE_MAX_C and
 * consumed in the same normalized units as tempBase, so amplitudes scale by
 * SEASON_AMPLITUDE_MAX_C / TEMP_SPAN_C. */
export const TEMP_SPAN_C = 65;
const SEASON_AMP_SCALE = SEASON_AMPLITUDE_MAX_C / TEMP_SPAN_C;

/** Which sidecar plane fills a derivation input field, and how it decodes. */
export type MapInputSpec =
  /** elevation.bin → f32 0..1 (u16 / 0xffff). */
  | { from: "elevation" }
  /** layers.bin plane → f32 0..1 (byte / 255). */
  | { from: "layers"; plane: LayerName }
  /** hydro.bin plane → f32 0..1 (byte / 255). */
  | { from: "hydro"; plane: HydroPlaneName }
  /** season.bin plane → f32 (byte / 255 × scale). Absent on maps with no
   * harmonic; those fields are reported missing and the caller falls back to
   * the latitude model. `scale` defaults to 1; the amplitude plane uses
   * SEASON_AMP_SCALE to reach normalized temp units. */
  | { from: "season"; plane: SeasonPlaneName; scale?: number }
  /** Filled by the system's `prepare` hook, not a sidecar. */
  | { from: "prepare" };

/** Raw sidecar bytes + context for one map load. Any sidecar may be absent
 * (older maps); the loader reports which declared fields it could not fill. */
export interface MapInputBundle {
  width: number;
  height: number;
  sidecars: {
    /** elevation.bin bytes (u16 LE). */
    elevation?: Uint8Array;
    /** layers.bin bytes (LAYER_NAMES planes). */
    layers?: Uint8Array;
    /** hydro.bin bytes (HYDRO_PLANE_NAMES planes). */
    hydro?: Uint8Array;
    /** season.bin bytes (SEASON_PLANE_NAMES planes), optional. */
    season?: Uint8Array;
    /** map.bin terrain bytes — the `prepare` hook's connected-components input. */
    map?: Uint8Array;
  };
  /** Extra context the `prepare` hook needs (worldgen config: seaLevel, …). */
  config: unknown;
}

/** CPU derivation of inputs a sidecar can't give directly — reads the already
 * decoded sidecar fields (+ raw map.bin and config) and returns the fields it
 * produces, keyed by derive-field name. Runs after sidecar decode. */
export type FieldPrepareHook = (ctx: {
  width: number;
  height: number;
  config: unknown;
  sidecars: MapInputBundle["sidecars"];
  inputs: Readonly<Record<string, Float32Array | Uint32Array>>;
}) => Record<string, Float32Array | Uint32Array>;

function decodePlane(
  bytes: Uint8Array,
  offset: number,
  size: number,
  scale: number,
): Float32Array {
  const out = new Float32Array(size);
  const s = scale / 255;
  for (let i = 0; i < size; i += 1) out[i] = bytes[offset + i] * s;
  return out;
}

function decodeInput(
  spec: MapInputSpec,
  bundle: MapInputBundle,
): Float32Array | null {
  const { width, height, sidecars } = bundle;
  const size = width * height;
  switch (spec.from) {
    case "elevation":
      return sidecars.elevation
        ? decodeElevation(sidecars.elevation, width, height)
        : null;
    case "layers":
      return sidecars.layers
        ? decodePlane(
            sidecars.layers,
            layerPlaneOffset(spec.plane, width, height),
            size,
            1,
          )
        : null;
    case "hydro":
      return sidecars.hydro
        ? decodePlane(
            sidecars.hydro,
            hydroPlaneOffset(spec.plane, width, height),
            size,
            1,
          )
        : null;
    case "season":
      return sidecars.season
        ? decodePlane(
            sidecars.season,
            seasonPlaneOffset(spec.plane, width, height),
            size,
            spec.scale ?? 1,
          )
        : null;
    case "prepare":
      return null;
  }
}

/**
 * Decode every declared input field of a `derive` system from a bundle of
 * sidecar bytes, then run the system's `prepare` hook. Returns the fields
 * keyed by derive-field name (ready for `kernel.writeBuffer`) and the names of
 * declared fields whose sidecar was absent (e.g. season on a map with no
 * harmonic).
 */
export function loadMapInputs(
  spec: FieldDeriveSpec,
  bundle: MapInputBundle,
): {
  fields: Record<string, Float32Array | Uint32Array>;
  missing: string[];
} {
  const inputs = spec.inputs ?? {};
  const fields: Record<string, Float32Array | Uint32Array> = {};
  const missing: string[] = [];
  for (const [field, source] of Object.entries(inputs)) {
    if (source.from === "prepare") continue;
    const decoded = decodeInput(source, bundle);
    if (decoded === null) missing.push(field);
    else fields[field] = decoded;
  }
  if (spec.prepare) {
    Object.assign(
      fields,
      spec.prepare({
        width: bundle.width,
        height: bundle.height,
        config: bundle.config,
        sidecars: bundle.sidecars,
        inputs: fields,
      }),
    );
  }
  return { fields, missing };
}

export { SEASON_AMP_SCALE };
