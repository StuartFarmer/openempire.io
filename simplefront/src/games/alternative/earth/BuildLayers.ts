/**
 * BuildLayers.ts — raw fields + tuning -> the six layers.bin planes and the
 * terrain image.png. The single place the map is actually decided.
 *
 * Called identically by the #earth tuning page (live, on every slider move) and
 * by map-generator/earth/bake.ts (headless). Pure: same inputs -> same bytes.
 */
import { LayerName } from "../../../core/game/MapLayers";
import {
  blur,
  combine,
  distanceToSeed,
  Field,
  makeField,
  mapField,
  normalize,
  normalizeSigned,
  quantize,
  RawFields,
} from "./Normalize";
import { Tuning } from "./Tuning";

export interface BuiltMap {
  width: number;
  height: number;
  /** 0..1 float fields, for previewing. */
  preview: Record<LayerName, Field>;
  /** The quantized bytes that actually go into layers.bin. */
  planes: Record<LayerName, Uint8Array>;
  /** RGBA image.png bytes, in the Go baker's blue-channel encoding. */
  terrain: Uint8ClampedArray;
  /** Land mask actually used (post coastline/sea-level decision). */
  land: Field;
  stats: BuildStats;
}

export interface BuildStats {
  landTiles: number;
  waterTiles: number;
  impassableTiles: number;
  /** Mean byte value over LAND tiles — the number that tells you if a layer is dead. */
  meanOnLand: Record<LayerName, number>;
}

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

function need(fields: RawFields, name: string): Field {
  const f = fields[name];
  if (!f) throw new Error(`missing raw field "${name}" — re-run ingest.py`);
  return f;
}

/**
 * Decide land vs water.
 *
 * The Natural Earth coastline is authoritative, not ETOPO's 0 m contour: ETOPO
 * puts the Caspian Sea and the Dead Sea below sea level and would flood them,
 * while the coastline polygon correctly knows they are inland. We take the mask
 * as truth and use elevation only for the magnitude ramp.
 */
function buildLandMask(fields: RawFields, tuning: Tuning): Field {
  const elev = need(fields, "elevation");
  const mask = need(fields, "land");
  const out = makeField(elev.width, elev.height);
  for (let i = 0; i < out.data.length; i++) {
    const isLand = tuning.terrain.useCoastlineMask
      ? mask.data[i] > 0.5
      : elev.data[i] >= tuning.terrain.seaLevelM;
    out.data[i] = isLand ? 1 : 0;
  }
  return out;
}

/** Permanent ice: cold AND (high or polar). Only used if iceAsImpassable. */
function buildIceMask(fields: RawFields, tuning: Tuning, land: Field): Field {
  const temp = need(fields, "temperature");
  const out = makeField(land.width, land.height);
  if (!tuning.terrain.iceAsImpassable) return out;
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] =
      land.data[i] > 0 && temp.data[i] < tuning.terrain.iceMaxTempC ? 1 : 0;
  }
  return out;
}

// ─────────────────────────── the six planes ───────────────────────────

function buildTemperature(fields: RawFields, tuning: Tuning): Field {
  const t = tuning.temperature;
  const raw = need(fields, "temperature");
  const src = t.blurSigma ? blur(raw, t.blurSigma) : raw;
  // Signed: temperature has meaningful negatives. A plain normalize() would
  // collapse every sub-zero tile to the same byte as 0 degC.
  const { min, max } =
    t.range.kind === "absolute" ? t.range : { min: -30, max: 35 };
  return normalizeSigned(src, min, max, t.gamma);
}

function buildHumidity(fields: RawFields, tuning: Tuning, land: Field): Field {
  return normalize(need(fields, "precip"), tuning.humidity, land);
}

function buildCrop(fields: RawFields, tuning: Tuning, land: Field): Field {
  const c = tuning.crop;

  const npp = normalize(
    need(fields, "npp"),
    { curve: "log1p", range: { kind: "percentile", lo: 2, hi: 98 }, gamma: 1 },
    land,
  );
  const precip = normalize(
    need(fields, "precip"),
    {
      curve: "log1p",
      range: { kind: "absolute", min: 0, max: 3000 },
      gamma: 1,
    },
    land,
  );

  // Crop wants a GROWING-SEASON temperature term, not "hotter is better":
  // productivity peaks in the temperate band and falls off at both ends. A
  // triangular response centred on ~20 degC, zero at freezing and at 45 degC.
  const tempRaw = need(fields, "temperature");
  const temp = mapField(tempRaw, (v) => {
    if (v <= 0 || v >= 45) return 0;
    return v <= 20 ? v / 20 : 1 - (v - 20) / 25;
  });

  const blended = combine(
    [npp, precip, temp],
    [c.weightNpp, c.weightPrecip, c.weightTemperature],
  );

  // Biome multiplier: NPP says the Amazon is the most fertile place on Earth.
  // By carbon it is; as farmland it is not. This is the correction.
  const biome = need(fields, "biome");
  const withBiome = mapField(blended, (v, i) => {
    const b = Math.round(biome.data[i]);
    const m = c.biomeMultiplier[b] ?? 1;
    return v * m;
  });

  return normalize(withBiome, c.transform, land);
}

function buildMetal(fields: RawFields, tuning: Tuning, land: Field): Field {
  const m = tuning.metal;
  const mining = normalize(need(fields, "mining"), m.miningTransform, land);
  const cu = normalize(need(fields, "cu_density"), m.cuTransform, land);
  const pts = normalize(need(fields, "metal_pts"), m.pointsTransform, land);
  return combine(
    [mining, cu, pts],
    [m.weightMining, m.weightCuDensity, m.weightPoints],
  );
}

function buildOil(fields: RawFields, tuning: Tuning, land: Field): Field {
  const o = tuning.oil;
  const fill = need(fields, "basin_fill");
  const au = need(fields, "oil_au");
  const field = need(fields, "oil_field");

  // Basins are the substrate; assessment units and known fields are bonuses
  // painted on top. A tile outside every basin stays at zero, and that is
  // correct — the Canadian Shield genuinely has no oil.
  //
  // Order matters: normalize the GEOLOGY first, then multiply. Boosting the raw
  // km-of-fill and normalizing afterwards silently breaks the range — bonuses go
  // up to 2.8x, so a field clamped to "0..23 km" is really carrying 0..64 and
  // every deep basin saturates identically. Normalizing first keeps the clamp
  // honest and lets a known supergiant (Ghawar: 11 km of fill, inside both an
  // assessment unit and a producing field) reach the top of the byte on merit.
  const base = normalize(fill, o.transform, land);

  return mapField(base, (v, i) => {
    if (fill.data[i] <= 0) return 0;
    const bonus =
      1 +
      o.assessmentUnitBonus * (au.data[i] > 0 ? 1 : 0) +
      o.fieldBonus * (field.data[i] > 0 ? 1 : 0);
    return clamp01(v * bonus);
  });
}

function buildWater(fields: RawFields, tuning: Tuning, land: Field): Field {
  const w = tuning.water;
  const river = need(fields, "river");
  const lake = need(fields, "lake");

  // Two SEPARATE distance fields, deliberately. Freshwater (rivers, lakes) is
  // what feeds a city; the ocean coast is worth something (fishing, ports) but
  // you cannot irrigate with seawater. Measuring distance to a single merged
  // seed set would let the sea masquerade as a river along every coastline.
  const freshSeed = mapField(land, (_v, i) =>
    river.data[i] >= w.minDischargeCms || lake.data[i] > 0 ? 1 : 0,
  );
  const coastSeed = mapField(land, (v) => (v <= 0 ? 1 : 0));

  const freshDist = distanceToSeed(freshSeed);
  const coastDist = distanceToSeed(coastSeed);
  const lambda = Math.max(0.001, w.decayLambda);

  const out = makeField(land.width, land.height);
  for (let i = 0; i < out.data.length; i++) {
    const fresh = Math.exp(-freshDist.data[i] / lambda);
    const coast = Math.exp(-coastDist.data[i] / lambda) * w.coastWeight;
    out.data[i] = clamp01(Math.max(fresh, coast));
  }

  return normalize(out, w.transform, land);
}

// ─────────────────────────── terrain image ───────────────────────────

/**
 * The Go baker reads ONLY the blue channel and the alpha:
 *   alpha < 20            -> water (magnitude = distance to land, computed there)
 *   blue 140..200 on land -> magnitude (blue - 140) / 2, i.e. 0..30
 *   #000 opaque           -> impassable void
 * See map-generator/map_generator.go.
 */
export function buildTerrainImage(
  fields: RawFields,
  tuning: Tuning,
  land: Field,
  ice: Field,
): { rgba: Uint8ClampedArray; impassable: number } {
  const t = tuning.terrain;
  const elev = need(fields, "elevation");
  const n = elev.data.length;
  const rgba = new Uint8ClampedArray(n * 4);
  let impassable = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (ice.data[i] > 0) {
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255; // opaque black = impassable
      impassable++;
      continue;
    }
    if (land.data[i] <= 0) {
      rgba[o] = 0;
      rgba[o + 1] = 0;
      rgba[o + 2] = 106; // the baker's water key colour
      rgba[o + 3] = 0; // alpha < 20 -> water
      continue;
    }
    const h = Math.max(0, elev.data[i] - t.seaLevelM);
    const span = Math.max(1, t.maxElevationM - t.seaLevelM);
    const g = t.elevationGamma > 0 ? t.elevationGamma : 1;
    const mag = Math.round(30 * Math.pow(clamp01(h / span), g));
    const blue = 140 + 2 * Math.min(30, mag);
    rgba[o] = 0;
    rgba[o + 1] = 0;
    rgba[o + 2] = blue;
    rgba[o + 3] = 255;
  }
  return { rgba, impassable };
}

// ─────────────────────────── entry point ───────────────────────────

export function buildMap(fields: RawFields, tuning: Tuning): BuiltMap {
  const any = need(fields, "elevation");
  const land = buildLandMask(fields, tuning);
  const ice = buildIceMask(fields, tuning, land);

  const preview: Record<LayerName, Field> = {
    crop: buildCrop(fields, tuning, land),
    metal: buildMetal(fields, tuning, land),
    oil: buildOil(fields, tuning, land),
    temperature: buildTemperature(fields, tuning),
    humidity: buildHumidity(fields, tuning, land),
    water: buildWater(fields, tuning, land),
  };

  const planes = {} as Record<LayerName, Uint8Array>;
  const meanOnLand = {} as Record<LayerName, number>;
  let landTiles = 0;
  for (let i = 0; i < land.data.length; i++) if (land.data[i] > 0) landTiles++;

  for (const name of Object.keys(preview) as LayerName[]) {
    planes[name] = quantize(preview[name]);
    let sum = 0;
    for (let i = 0; i < land.data.length; i++) {
      if (land.data[i] > 0) sum += planes[name][i];
    }
    meanOnLand[name] = landTiles ? sum / landTiles : 0;
  }

  const { rgba, impassable } = buildTerrainImage(fields, tuning, land, ice);

  return {
    width: any.width,
    height: any.height,
    preview,
    planes,
    terrain: rgba,
    land,
    stats: {
      landTiles,
      waterTiles: any.data.length - landTiles,
      impassableTiles: impassable,
      meanOnLand,
    },
  };
}
