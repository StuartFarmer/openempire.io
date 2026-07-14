/**
 * Tuning.ts — every knob that turns raw Earth data into the six 0..255 planes,
 * plus the defaults and the reasoning behind each one.
 *
 * This is the file the #earth page's sliders write to and the baker reads. It is
 * plain JSON-serializable data so a tuning you like can be saved next to the map
 * and re-baked byte-identically later.
 *
 * The choice that recurs below is ABSOLUTE vs PERCENTILE range:
 *   - Absolute when the unit means something on its own (degC, mm/yr, km of
 *     sediment). Two different maps should agree that 20 degC is 20 degC.
 *   - Percentile when the unit is arbitrary or brutally heavy-tailed (mining
 *     km^2/cell: median nonzero 0.47, max 330). An absolute range there would
 *     crush 99% of the world's mines into byte value 0 or 1.
 */
import { Curve, Range } from "./Normalize";

export interface Transform {
  curve: Curve;
  range: Range;
  gamma: number;
  /** Gaussian sigma in TILES, applied to the physical field before normalizing. */
  blurSigma: number;
}

export interface TerrainTuning {
  /** Elevation (m) at or above which a tile is land, given the land mask agrees. */
  seaLevelM: number;
  /** Elevation (m) mapped to the maximum in-game magnitude (30). */
  maxElevationM: number;
  /**
   * Curve on the elevation ramp. Earth's land is overwhelmingly low: linear
   * would render almost the whole planet as flat plains and reserve the top
   * magnitudes for a handful of Himalayan tiles. <1 lifts the midlands.
   */
  elevationGamma: number;
  /**
   * Trust the Natural Earth coastline over ETOPO's 0 m contour. ETOPO says the
   * Caspian and the Dead Sea are "below sea level" and would drown them; the
   * coastline polygon knows they are inland.
   */
  useCoastlineMask: boolean;
  /** Render permanent ice (Antarctica, Greenland interior) as impassable void. */
  iceAsImpassable: boolean;
  /** Tiles colder than this AND above this elevation count as permanent ice. */
  iceMaxTempC: number;
}

export interface CropTuning {
  /** Blend weights over the normalized sub-fields. */
  weightNpp: number;
  weightPrecip: number;
  weightTemperature: number;
  /** Per-biome multiplier, indexed by RESOLVE BIOME_NUM (0..14). */
  biomeMultiplier: number[];
  transform: Transform;
}

export interface MetalTuning {
  /** Observed satellite mining footprint — the unbiased backbone. */
  weightMining: number;
  /** Assessed copper richness (t/km^2) — undiscovered geological potential. */
  weightCuDensity: number;
  /** Global deposit/facility points. */
  weightPoints: number;
  miningTransform: Transform;
  cuTransform: Transform;
  pointsTransform: Transform;
}

export interface OilTuning {
  /** Multiplier applied inside a USGS petroleum assessment unit. */
  assessmentUnitBonus: number;
  /** Multiplier applied inside a GOGI oil/gas field polygon. */
  fieldBonus: number;
  transform: Transform;
}

export interface WaterTuning {
  /** River discharge (m^3/s) at or above which a tile counts as a water seed. */
  minDischargeCms: number;
  /** Freshwater proximity decays as exp(-distance / lambda), lambda in tiles. */
  decayLambda: number;
  /** Ocean coast also provides water access (fishing, ports), at this strength. */
  coastWeight: number;
  transform: Transform;
}

export interface Tuning {
  terrain: TerrainTuning;
  crop: CropTuning;
  metal: MetalTuning;
  oil: OilTuning;
  water: WaterTuning;
  temperature: Transform;
  humidity: Transform;
}

/**
 * RESOLVE BIOME_NUM -> crop multiplier.
 *
 * NPP alone says the Amazon and the Congo are the most fertile places on Earth.
 * By raw carbon they are — but rainforest soil is famously terrible farmland,
 * while temperate grassland (the world's breadbaskets: the Steppe, the Pampas,
 * the American Midwest) is superb. This table is the correction, and it is a
 * GAME-BALANCE judgement, not a scientific one.
 *
 *  1 Tropical moist broadleaf     2 Tropical dry broadleaf
 *  3 Tropical conifer             4 Temperate broadleaf
 *  5 Temperate conifer            6 Boreal/taiga
 *  7 Tropical grassland/savanna   8 Temperate grassland
 *  9 Flooded grassland           10 Montane grassland
 * 11 Tundra                      12 Mediterranean forest/scrub
 * 13 Desert & xeric shrubland    14 Mangrove
 */
export const DEFAULT_BIOME_MULTIPLIER: number[] = [
  0.0, // 0  no data / ocean
  0.65, // 1  tropical moist broadleaf — huge NPP, poor lateritic soil
  0.75, // 2  tropical dry broadleaf
  0.6, // 3  tropical conifer
  1.0, // 4  temperate broadleaf — the classic agricultural heartland
  0.7, // 5  temperate conifer
  0.35, // 6  boreal / taiga — short season, thin soil
  0.8, // 7  tropical grassland / savanna
  1.0, // 8  temperate grassland — the breadbaskets
  0.9, // 9  flooded grassland — rice country
  0.45, // 10 montane grassland
  0.1, // 11 tundra
  0.85, // 12 mediterranean forest / scrub
  0.15, // 13 desert & xeric shrubland
  0.5, // 14 mangrove
];

export function defaultTuning(): Tuning {
  return {
    terrain: {
      seaLevelM: 0,
      // Not Everest (8849 m). At ~20 km/tile the 60-arcsec source is averaged
      // ~10x10, so real summits are smoothed away — the observed max is 6233 m.
      // Anchoring at 4000 m keeps the Andes/Himalaya/Rockies genuinely mountainous
      // instead of reserving the top magnitudes for a couple of tiles.
      maxElevationM: 4000,
      elevationGamma: 0.6,
      useCoastlineMask: true,
      iceAsImpassable: false,
      iceMaxTempC: -10,
    },

    crop: {
      weightNpp: 0.5,
      weightPrecip: 0.25,
      weightTemperature: 0.25,
      biomeMultiplier: [...DEFAULT_BIOME_MULTIPLIER],
      transform: {
        curve: "linear",
        // NPP spans 2e9..1.2e12; the blend is already 0..1, so percentile-clip
        // the combined result to spread the mid-range across the byte.
        range: { kind: "percentile", lo: 2, hi: 98 },
        gamma: 1.0,
        blurSigma: 0.5,
      },
    },

    metal: {
      weightMining: 0.7,
      weightCuDensity: 0.2,
      weightPoints: 0.1,
      miningTransform: {
        // Heavy-tailed AND sparse: only ~1.2% of tiles have any mine at all.
        // log1p tames the tail; the blur spreads a point-like phenomenon into a
        // regional density, or 99% of the map reads metal=0.
        curve: "log1p",
        range: { kind: "percentile", lo: 5, hi: 99 },
        gamma: 1.0,
        blurSigma: 4,
      },
      cuTransform: {
        curve: "sqrt",
        range: { kind: "percentile", lo: 5, hi: 95 },
        gamma: 1.0,
        blurSigma: 2,
      },
      pointsTransform: {
        curve: "log1p",
        range: { kind: "percentile", lo: 10, hi: 95 },
        gamma: 1.0,
        blurSigma: 5,
      },
    },

    oil: {
      assessmentUnitBonus: 0.8,
      fieldBonus: 1.0,
      transform: {
        // basin_fill is sediment depth in km, 0..23 — a real physical unit with
        // a sane range, so clamp it absolutely rather than by percentile.
        curve: "linear",
        range: { kind: "absolute", min: 0, max: 23 },
        gamma: 1.0,
        blurSigma: 2,
      },
    },

    water: {
      minDischargeCms: 50,
      decayLambda: 3,
      coastWeight: 0.35,
      transform: {
        curve: "linear",
        range: { kind: "absolute", min: 0, max: 1 },
        gamma: 1.0,
        blurSigma: 0,
      },
    },

    temperature: {
      curve: "linear",
      // Physical and meaningful: -30 degC is byte 0, +35 degC is byte 255, on
      // every map we ever bake. Signed — handled by normalizeSigned().
      range: { kind: "absolute", min: -30, max: 35 },
      gamma: 1.0,
      blurSigma: 0,
    },

    humidity: {
      // Precipitation is skewed (median 682 mm/yr, max 11,191), so it needs a
      // curve — but NOT log1p, which over-lifts the arid end catastrophically:
      // the Sahara gets 19 mm/yr and log1p renders it as byte 95, i.e. 37% humid.
      // sqrt puts that same 19 mm at 20, England (616 mm) at 116 and the Amazon
      // (2172 mm) at 217 — which is the discrimination we actually want.
      curve: "sqrt",
      range: { kind: "absolute", min: 0, max: 3000 },
      gamma: 1.0,
      blurSigma: 0,
    },
  };
}
