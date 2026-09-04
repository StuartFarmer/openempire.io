import { describe, expect, it } from "vitest";
import { terrain } from "../src/client/lab/systems/terrain/system";
import { buildWaterMask } from "../src/client/lab/systems/terrain/waterMask";
import {
  loadMapInputs,
  SEASON_AMP_SCALE,
  TEMP_SPAN_C,
  type MapInputBundle,
} from "../src/client/webgpu/MapInputs";
import { encodeElevation } from "../src/core/game/ElevationMap";
import { HYDRO_PLANE_NAMES } from "../src/core/game/HydroMap";
import { LAYER_NAMES } from "../src/core/game/MapLayers";
import {
  SEASON_AMPLITUDE_MAX_C,
  SEASON_PLANE_NAMES,
} from "../src/core/game/SeasonMap";

// The declared-input loader (phase 3) must reproduce the shell's hand-written
// decode of every sidecar plane byte-for-byte, or the terrain system would
// derive from different inputs than TerrainDerivation.

const W = 8;
const H = 6;
const SIZE = W * H;

/** A deterministic byte per (plane, tile). */
function planeBytes(planeCount: number, salt: number): Uint8Array {
  const bytes = new Uint8Array(planeCount * SIZE);
  for (let p = 0; p < planeCount; p += 1) {
    for (let i = 0; i < SIZE; i += 1) {
      bytes[p * SIZE + i] = (p * 37 + i * 13 + salt) & 0xff;
    }
  }
  return bytes;
}

function makeBundle(withSeason: boolean): MapInputBundle {
  // Elevation: a smooth ramp, quantized through the real encoder.
  const elev = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i += 1) elev[i] = i / (SIZE - 1);
  // map.bin terrain: a land/water checkerboard (bit 7 = land, bit 5 = ocean).
  const map = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i += 1) {
    map[i] = i % 3 === 0 ? 0x80 : i % 3 === 1 ? 0x20 : 0x00;
  }
  return {
    width: W,
    height: H,
    sidecars: {
      elevation: encodeElevation(elev, W, H),
      layers: planeBytes(LAYER_NAMES.length, 1),
      hydro: planeBytes(HYDRO_PLANE_NAMES.length, 2),
      season: withSeason ? planeBytes(SEASON_PLANE_NAMES.length, 3) : undefined,
      map,
    },
    config: { seaLevel: 0.5 },
  };
}

/** The shell's hand-decode (GameShellPage.deriveTerrain), inlined. */
function handDecodePlane(bytes: Uint8Array, planeIndex: number): Float32Array {
  const out = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i += 1) out[i] = bytes[planeIndex * SIZE + i] / 255;
  return out;
}

describe("loadMapInputs", () => {
  it("reproduces the shell's per-plane decode", () => {
    const bundle = makeBundle(true);
    const { fields, missing } = loadMapInputs(terrain.derive!, bundle);
    expect(missing).toEqual([]);

    const layers = bundle.sidecars.layers!;
    const hydro = bundle.sidecars.hydro!;
    const season = bundle.sidecars.season!;

    expect(fields.tempBase).toEqual(
      handDecodePlane(layers, LAYER_NAMES.indexOf("temperature")),
    );
    expect(fields.humidityBase).toEqual(
      handDecodePlane(layers, LAYER_NAMES.indexOf("humidity")),
    );
    expect(fields.lakeBase).toEqual(
      handDecodePlane(hydro, HYDRO_PLANE_NAMES.indexOf("lake")),
    );
    expect(fields.riverBase).toEqual(
      handDecodePlane(hydro, HYDRO_PLANE_NAMES.indexOf("river")),
    );
    expect(fields.seasonPhase).toEqual(
      handDecodePlane(season, SEASON_PLANE_NAMES.indexOf("phase")),
    );

    // Amplitude carries the normalized-temp scaling the shell applied. The
    // scale is a ratio, so the loader's `raw*(50/65)` and the shell's
    // `raw*50/65` differ only in float ordering (<1e-6) — functionally
    // identical for a plane that feeds a quantizing GPU pass.
    const rawAmp = handDecodePlane(
      season,
      SEASON_PLANE_NAMES.indexOf("amplitude"),
    );
    expect(SEASON_AMP_SCALE).toBeCloseTo(SEASON_AMPLITUDE_MAX_C / TEMP_SPAN_C);
    const amp = fields.seasonAmp as Float32Array;
    expect(amp.length).toBe(SIZE);
    for (let i = 0; i < SIZE; i += 1) {
      expect(amp[i]).toBeCloseTo(
        (rawAmp[i] * SEASON_AMPLITUDE_MAX_C) / TEMP_SPAN_C,
        6,
      );
    }
  });

  it("decodes elevation through the real u16 decoder", () => {
    const bundle = makeBundle(false);
    const { fields } = loadMapInputs(terrain.derive!, bundle);
    // Round-trips the quantized ramp: byte/0xffff of the encoded value.
    expect(fields.elevation).toBeInstanceOf(Float32Array);
    expect(fields.elevation.length).toBe(SIZE);
    expect(fields.elevation[0]).toBeCloseTo(0, 4);
    expect(fields.elevation[SIZE - 1]).toBeCloseTo(1, 4);
  });

  it("runs the prepare hook to build the water mask", () => {
    const bundle = makeBundle(false);
    const { fields } = loadMapInputs(terrain.derive!, bundle);
    const expected = buildWaterMask(
      bundle.sidecars.map!,
      fields.elevation as Float32Array,
      0.5,
      W,
      H,
    );
    expect(fields.waterMask).toEqual(expected);
    expect(fields.waterMask).toBeInstanceOf(Uint32Array);
  });

  it("reports season fields missing when the sidecar is absent", () => {
    const bundle = makeBundle(false);
    const { fields, missing } = loadMapInputs(terrain.derive!, bundle);
    expect(missing.sort()).toEqual(["seasonAmp", "seasonPhase"]);
    expect(fields.seasonAmp).toBeUndefined();
    expect(fields.seasonPhase).toBeUndefined();
    // Non-season inputs still decode + the mask still builds.
    expect(fields.tempBase).toBeInstanceOf(Float32Array);
    expect(fields.waterMask).toBeInstanceOf(Uint32Array);
  });
});
