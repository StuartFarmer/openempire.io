/**
 * EarthColors.ts — render the Earth map with the fork's OWN terrain renderer
 * (biomes, bathymetry, rivers) instead of vanilla OpenFront's flat shading.
 *
 * The renderer already exists: `buildWorldEngineTerrainColors()` in
 * ../world/WorldEngineElevation.ts is what paints the generated maps, and
 * TerrainPass picks it up via the `terrain-colors.png` sidecar. All that was
 * missing for Earth was the sidecar — without it a map silently falls back to
 * the stock plains/highland/mountain ramp and a flat blue sea.
 *
 * So this file does NOT re-implement any colouring. It translates real-world
 * measurements into the exact field conventions the engine renderer expects,
 * and hands them over:
 *
 *   real °C, mm/yr, metres, m³/s   ->   the engine's normalized 0..1 fields
 *
 * The one genuinely interesting mapping is temperature (see EARTH_TEMP_*).
 */
import {
  buildWorldEngineTerrainColors,
  generateWorldEngineBiome,
  normalizeFoundationWorldEngineMapConfig,
} from "../world/WorldEngineElevation";
import { Field, normalize, RawFields } from "./Normalize";
import { Tuning } from "./Tuning";

/**
 * The engine assigns biomes from normalized temperature with hard thresholds:
 *
 *   t < 0.20  cold scrub / cold wetland
 *   t < 0.38  cool dryland / grassland / forest
 *   t < 0.64  desert / temperate grassland / temperate forest
 *   t >= 0.64 desert / savanna / warm woodland / rainforest
 *
 * A naive -30..+35 °C ramp would push most of the planet into the top band and
 * turn Europe tropical. Instead we pick the °C -> t line so those thresholds
 * land on the real climate boundaries they are named after:
 *
 *   t = 0.38  <->   5 °C   (cool / temperate)
 *   t = 0.64  <->  18 °C   (temperate / tropical)
 *
 * which is t = 0.02·C + 0.28, i.e. a linear ramp over -14..+36 °C. That puts
 * the 0.20 threshold at -4 °C (tundra), England (10 °C) at 0.48 = temperate,
 * the Amazon (25 °C) at 0.78 = rainforest, and Siberia (-10 °C) at 0.08 = cold.
 */
export const EARTH_TEMP_MIN_C = -14;
export const EARTH_TEMP_MAX_C = 36;

/** Biome index 1 in the engine's palette is Ice; its own generator never emits it. */
const BIOME_ICE = 1;

/**
 * Watermap value assigned to a river exactly at the discharge gate. Must sit
 * just above the engine's weak-river threshold (0.28) so a tile that passes our
 * gate is actually drawn as a river rather than silently ignored.
 */
const RIVER_FLOOR = 0.32;

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/** Approximate sea-surface temperature from latitude: ~28 °C equator, ~-2 °C poles. */
function seaSurfaceTempC(i: number, width: number, height: number): number {
  const y = Math.floor(i / width);
  const lat = 90 - ((y + 0.5) / height) * 180;
  const c = Math.cos((lat * Math.PI) / 180);
  return -2 + 30 * Math.pow(Math.max(0, c), 1.2);
}

function need(fields: RawFields, name: string): Field {
  const f = fields[name];
  if (!f) throw new Error(`missing raw field "${name}" — re-run ingest.py`);
  return f;
}

export interface EarthColorOptions {
  /** Deepest ocean mapped to seaDepth = 1 (Challenger Deep is ~10,900 m). */
  maxOceanDepthM: number;
  /** Land elevation mapped to the top of the land ramp. */
  maxElevationM: number;
  /**
   * Curve on the land altitude ramp. Earth's land is LOW — median 555 m, and
   * 26% of it is under 200 m. A linear ramp parks almost the whole planet at the
   * bottom of the engine's elevation range, which both flattens the relief and
   * drags low ground into the renderer's "coastal" band. <1 lifts the midlands.
   */
  elevationGamma: number;
  /**
   * Discharge (m³/s) below which a tile draws NO river at all.
   *
   * This is the setting that matters most. HydroRIVERS keeps every stream down
   * to 5 m³/s, which is 28.65% of all land — feed that to the renderer and it
   * floods a quarter of the planet with RIVER_STRONG blue, so the Amazon basin,
   * Siberia and Canada all come out looking like sea. At 1000 m³/s only 1.69% of
   * land is river: the Amazon, Nile, Mississippi, Yangtze, Congo, Ob. Which is
   * what a river network on a 20 km grid should be.
   */
  riverMinCms: number;
  /** Discharge that saturates the river to full strength (the Amazon is ~205,000). */
  riverMaxCms: number;
  /** Land colder than this renders as permanent ice (Antarctica, Greenland). */
  iceTempC: number;
}

export function defaultEarthColorOptions(): EarthColorOptions {
  return {
    maxOceanDepthM: 6000,
    maxElevationM: 4000,
    elevationGamma: 0.6,
    riverMinCms: 1000,
    riverMaxCms: 50000,
    iceTempC: -8,
  };
}

/**
 * Real Earth data -> the RGBA that terrain-colors.png stores and TerrainPass draws.
 */
export function buildEarthTerrainColors(
  fields: RawFields,
  tuning: Tuning,
  land: Field,
  opts: EarthColorOptions = defaultEarthColorOptions(),
): Uint8Array {
  const elevM = need(fields, "elevation");
  const tempC = need(fields, "temperature");
  const precipMm = need(fields, "precip");
  const riverCms = need(fields, "river");
  const lakeRaw = need(fields, "lake");

  const width = elevM.width;
  const height = elevM.height;
  const n = width * height;

  const cfg = normalizeFoundationWorldEngineMapConfig({
    width,
    height,
    seed: 1,
  });
  const seaLevel = cfg.seaLevel;

  const ocean = new Uint8Array(n);
  const elevation = new Float32Array(n);
  const seaDepth = new Float32Array(n);
  const temperature = new Float32Array(n);
  const humidity = new Float32Array(n);
  const watermap = new Float32Array(n);
  const lakes = new Uint8Array(n);

  // Humidity/precip: reuse the SAME curve the humidity plane uses, so what the
  // map looks like and what the simulation reads cannot disagree.
  const humidityField = normalize(precipMm, tuning.humidity, land);

  for (let i = 0; i < n; i++) {
    const isLand = land.data[i] > 0;
    ocean[i] = isLand ? 0 : 1;

    if (isLand) {
      // Land occupies seaLevel..1 of the engine's elevation range, gamma-curved
      // so real Earth's low median (555 m) doesn't collapse onto the bottom.
      const t = Math.pow(
        clamp01(Math.max(0, elevM.data[i]) / opts.maxElevationM),
        opts.elevationGamma > 0 ? opts.elevationGamma : 1,
      );
      elevation[i] = seaLevel + (1 - seaLevel) * t;
      seaDepth[i] = 0;
    } else {
      // REAL bathymetry — this is what vanilla's flat blue sea was throwing away.
      // ETOPO gives negative metres offshore; deeper water reads as a darker
      // abyss through the engine's shallow->shelf->deep->abyss ramp.
      const depth = clamp01(-Math.min(0, elevM.data[i]) / opts.maxOceanDepthM);
      seaDepth[i] = depth;
      elevation[i] = seaLevel * (0.95 - depth * 0.8);
    }

    // Ocean needs a SEA-SURFACE temperature, not the land one.
    //
    // WorldClim is land-only, so ingest.py gap-fills its holes from the nearest
    // land tile. That is correct for a coastal land tile (a 20 km tile at the
    // shore otherwise samples open water and reads 0 degC), but over open ocean
    // it is meaningless — it tiles the sea into Voronoi blocks of whatever
    // continent happened to be nearest, and the renderer's cold-water tint then
    // paints those blocks as visible rectangles.
    //
    // Latitude is a good SST proxy and has no such seams: ~28 degC at the
    // equator falling to ~-2 degC at the poles.
    const cRaw = isLand ? tempC.data[i] : seaSurfaceTempC(i, width, height);
    temperature[i] = clamp01(
      (cRaw - EARTH_TEMP_MIN_C) / (EARTH_TEMP_MAX_C - EARTH_TEMP_MIN_C),
    );
    humidity[i] = humidityField.data[i];

    // Rivers. Hard-gate below riverMinCms, then log-ramp — discharge spans four
    // orders of magnitude (5 m³/s to the Amazon's 205,000), so a linear scale is
    // useless. Everything below the gate is 0: a trickle must not paint a tile
    // blue, or a quarter of the planet reads as ocean.
    const q = riverCms.data[i];
    if (isLand && q >= opts.riverMinCms) {
      const t = clamp01(
        Math.log(q / opts.riverMinCms) /
          Math.log(opts.riverMaxCms / opts.riverMinCms),
      );
      // Land just above the gate must clear the renderer's weak-river threshold,
      // or the gate would admit rivers the renderer then declines to draw.
      watermap[i] = RIVER_FLOOR + (1 - RIVER_FLOOR) * t;
    } else {
      watermap[i] = 0;
    }
    lakes[i] = isLand && lakeRaw.data[i] > 0 ? 1 : 0;
  }

  const biome = generateWorldEngineBiome(ocean, temperature, humidity);

  // The engine's biome generator has no Ice class (its coldest output is "cold
  // scrub"), so Antarctica and inland Greenland would render as tundra scrub.
  // Paint them with the palette's Ice colour they were clearly meant to use.
  for (let i = 0; i < n; i++) {
    if (ocean[i] === 0 && tempC.data[i] < opts.iceTempC) biome[i] = BIOME_ICE;
  }

  return buildWorldEngineTerrainColors(
    elevation,
    ocean,
    temperature,
    humidity, // the renderer's "precipitation" input is a 0..1 wetness field
    seaDepth,
    watermap,
    humidity,
    biome,
    lakes,
    {
      width,
      height,
      seed: cfg.seed,
      seaLevel,
      riverWeakThreshold: cfg.riverWeakThreshold,
      riverStrongThreshold: cfg.riverStrongThreshold,
    },
  );
}
