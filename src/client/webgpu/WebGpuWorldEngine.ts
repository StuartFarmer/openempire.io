import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../../games/alternative/world/WorldEngineElevation";
import { FieldKernel, type FieldKernelConfig } from "./FieldKernel";
import { NOISE_WGSL } from "./WgslNoise";

// GPU port of the world engine, expressed as a FieldKernel program: layers +
// per-tile passes. Per-pixel stages (elevation, climate, biome, terrain
// colors) are exact ports of WorldEngineElevation.ts; the serial CPU
// algorithms are reformulated as iterative ping-pong passes:
//   ocean BFS flood fill      -> one-step frontier propagation, N passes
//   priority-flood drainage   -> Barnes-style iterative depression fill
//   topological flow routing  -> steepest-descent gather, N passes
//   land elevation quantile   -> 256-bin atomic histogram + scan
// so results are visually equivalent, not bit-identical, to the CPU engine.

export const WEBGPU_VIEW_MODES = [
  "terrain",
  "elevation",
  "temperature",
  "precipitation",
  "rivers",
  "humidity",
  "biome",
] as const;

export type WebGpuViewMode = (typeof WEBGPU_VIEW_MODES)[number];

export interface WebGpuGenerateResult {
  gpuMs: number;
  dispatches: number;
  width: number;
  height: number;
}

const PARAMS_BYTES = 64;

const PRELUDE_WGSL = /* wgsl */ `
struct Params {
  seed: i32,
  viewMode: u32,
  seaLevel: f32,
  continentScale: f32,
  mountainStrength: f32,
  coastFalloff: f32,
  coastRoughness: f32,
  latitudeEffect: f32,
  elevationCooling: f32,
  rainNoise: f32,
  warmthRainfall: f32,
  riverFlowRetention: f32,
  lakeWaterThreshold: f32,
  lakeElevationRange: f32,
  riverWeakThreshold: f32,
  riverStrongThreshold: f32,
}

struct Globals {
  mountainThreshold: f32,
  waterMaxBits: u32,
  landCount: u32,
  pad: u32,
}

struct GlobalsAtomic {
  mountainThreshold: f32,
  waterMaxBits: atomic<u32>,
  landCount: atomic<u32>,
  pad: u32,
}

${NOISE_WGSL}
`;

const ELEVATION_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  let nx = f32(x) / f32(GRID.size.x);
  let ny = f32(y) / f32(GRID.size.y);
  let continentFrequency = 2.15 / P.continentScale;
  let broadFrequency = 0.92 / P.continentScale;
  let detailFrequency = 7.5 / P.continentScale;
  let warpFrequency = 1.1 / P.continentScale;
  let warpStrength = 0.34 * P.continentScale;
  let warpX = (fbm(P.seed + 501, nx, ny, warpFrequency, 3, 0.55) - 0.5) * warpStrength;
  let warpY = (fbm(P.seed + 907, nx, ny, warpFrequency, 3, 0.55) - 0.5) * warpStrength;
  let sx = nx + warpX;
  let sy = ny + warpY;
  let continent = fbm(P.seed + 11, sx, sy, continentFrequency, 5, 0.58);
  let broad = fbm(P.seed + 37, sx + 8.3, sy - 3.1, broadFrequency, 3, 0.55);
  let landform = continent * 0.74 + broad * 0.26;
  let ridgeBase = fbm(P.seed + 97, sx, sy, detailFrequency, 5, 0.48);
  let ridges = 1.0 - abs(ridgeBase * 2.0 - 1.0);
  let edgeDistance = min(min(nx, 1.0 - nx), min(ny, 1.0 - ny));
  let edgeWaterBias = pow(clamp01((0.1 - edgeDistance) / 0.1), 2.2) * P.coastFalloff * 0.24;
  let baseHeight = landform * 0.88
    + pow(ridges, 2.2) * P.mountainStrength * 0.48
    - edgeWaterBias
    - 0.14;
  let coastBand = pow(clamp01(1.0 - abs(baseHeight - P.seaLevel) / 0.2), 1.7);
  let shoreNoise =
    (fbm(P.seed + 1601, sx + 4.7, sy - 2.9, 18.0 / P.continentScale, 3, 0.56) - 0.5) * 0.7 +
    (fbm(P.seed + 2203, sx - 7.2, sy + 5.1, 42.0 / P.continentScale, 2, 0.5) - 0.5) * 0.3;
  let shoreDetail = shoreNoise * P.coastRoughness * coastBand * 0.14;
  elevation[i] = clamp01(baseHeight + shoreDetail);
}
`;

const OCEAN_INIT_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  let border = x == 0 || y == 0 || x == i32(GRID.size.x) - 1 || y == i32(GRID.size.y) - 1;
  ocean_out[i] = select(0u, 1u, border && elevation[i] <= P.seaLevel);
}
`;

const OCEAN_STEP_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  var ocean = ocean_in[i];
  if (ocean == 0u && elevation[i] <= P.seaLevel) {
    if ((x > 0 && ocean_in[i - 1u] != 0u) ||
        (x < i32(GRID.size.x) - 1 && ocean_in[i + 1u] != 0u) ||
        (y > 0 && ocean_in[i - GRID.size.x] != 0u) ||
        (y < i32(GRID.size.y) - 1 && ocean_in[i + GRID.size.x] != 0u)) {
      ocean = 1u;
    }
  }
  ocean_out[i] = ocean;
}
`;

const FLAGS_INIT_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  flags[i] = select(0u, 1u, ocean_in[i] != 0u);
}
`;

const HISTOGRAM_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  let bin = min(u32(clamp01(elevation[i]) * 256.0), 255u);
  atomicAdd(&hist[bin], 1u);
  atomicAdd(&G.landCount, 1u);
}
`;

// Scans the histogram for the 0.9 land quantile, the CPU engine's
// mountainThreshold (quantized to 1/256).
const QUANTILE_WGSL = /* wgsl */ `
fn once() {
  if (G.landCount == 0u) {
    G.mountainThreshold = 1.0;
    return;
  }
  let rank = u32(floor(f32(G.landCount - 1u) * 0.9));
  var cumulative = 0u;
  var bin = 255u;
  for (var b = 0u; b < 256u; b += 1u) {
    cumulative += hist[b];
    if (cumulative > rank) {
      bin = b;
      break;
    }
  }
  G.mountainThreshold = (f32(bin) + 0.5) / 256.0;
}
`;

const CLIMATE_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  let nx = f32(x) / f32(GRID.size.x);
  let ny = f32(y) / f32(GRID.size.y);
  let ocean = (flags[i] & 1u) != 0u;

  let latitude = abs(f32(y) / max(1.0, f32(GRID.size.y) - 1.0) * 2.0 - 1.0);
  let equatorWarmth = 1.0 - latitude;
  let thermalNoise = fbm(P.seed + 211, nx, ny, 3.2, 4, 0.5) - 0.5;
  let altitude = max(0.0, elevation[i] - G.mountainThreshold);
  let temp = clamp01(
    0.5 +
    (equatorWarmth - 0.5) * P.latitudeEffect +
    thermalNoise * 0.28 -
    altitude * P.elevationCooling * 1.9 +
    select(0.0, 0.04, ocean)
  );
  temperature[i] = temp;

  let rainField = fbm(P.seed + 419, nx, ny, 4.2, 5, 0.52);
  let stormBand = fbm(P.seed + 727, nx + f32(y) * 0.002, ny, 1.8, 3, 0.6);
  let orographic = clamp01(elevation[i] - P.seaLevel) * 0.24;
  let coastalMoisture = select(0.0, 0.18, ocean);
  let warmRain = temp * P.warmthRainfall;
  let value = rainField * P.rainNoise +
    stormBand * (1.0 - P.rainNoise) +
    warmRain + coastalMoisture + orographic;
  precipitation[i] = clamp01(value / (1.18 + P.warmthRainfall * 0.35));
}
`;

const FILL_INIT_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  fill_out[i] = select(1e9, min(elevation[i], P.seaLevel), (flags[i] & 1u) != 0u);
}
`;

const FILL_STEP_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    fill_out[i] = fill_in[i];
    return;
  }
  var lowestNeighbor = 1e9;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    lowestNeighbor = min(lowestNeighbor, fill_in[refOf(n.x, n.y)]);
  }
  // The epsilon slopes filled flats toward their outlet so steepest-descent
  // flow routing never strands water in a flat (Barnes epsilon-fill).
  fill_out[i] = min(fill_in[i], max(elevation[i], lowestNeighbor + 2e-5));
}
`;

// Steepest descent over the filled surface, hash tie-break so flats drain
// deterministically. Code 0..7 = OFF index the cell flows toward, 8 = pit.
const FLOW_DIR_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    dir[i] = 8u;
    return;
  }
  var bestDir = 8u;
  var bestFill = fill_in[i];
  var bestTie = hash01(P.seed + 7919, x, y);
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    let nFill = fill_in[ni];
    let nTie = hash01(P.seed + 7919, n.x, n.y);
    if (nFill < bestFill || (nFill == bestFill && nTie < bestTie)) {
      bestDir = u32(k);
      bestFill = nFill;
      bestTie = nTie;
    }
  }
  dir[i] = bestDir;
}
`;

const WATER_INIT_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  water_out[i] = select(precipitation[i], 0.0, (flags[i] & 1u) != 0u);
}
`;

// Gather formulation of the CPU flow accumulation: each pass extends the
// fixed point w(i) = precip(i) + retention * sum of upstream w(j) by one hop.
const WATER_STEP_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    water_out[i] = 0.0;
    return;
  }
  var inflow = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 1u) == 0u && dir[ni] == u32(7 - k)) {
      inflow += water_in[ni];
    }
  }
  water_out[i] = precipitation[i] + P.riverFlowRetention * inflow;
}
`;

const WATER_MAX_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  // Non-negative floats compare correctly as u32 bit patterns.
  atomicMax(&G.waterMaxBits, bitcast<u32>(max(water_in[i], 0.0)));
}
`;

const LAKES_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  if (fill_in[i] - elevation[i] <= P.lakeElevationRange) { return; }
  if (water_in[i] > P.lakeWaterThreshold) {
    flags[i] = flags[i] | 2u;
  }
}
`;

const LAKE_SPREAD_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 3u) != 0u) { return; }
  if (fill_in[i] - elevation[i] <= P.lakeElevationRange) { return; }
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 2u) != 0u && abs(fill_in[ni] - fill_in[i]) <= 0.01) {
      flags[i] = flags[i] | 2u;
      return;
    }
  }
}
`;

const IRRIGATION_SOURCE_WGSL = /* wgsl */ `
fn irrigationSource(i: u32) -> f32 {
  if ((flags[i] & 1u) != 0u) { return 0.0; }
  let waterMax = bitcast<f32>(G.waterMaxBits);
  if (waterMax <= 0.0) { return 0.0; }
  return clamp01(water_in[i] / waterMax);
}
`;

const IRRIGATION_INIT_WGSL = /* wgsl */ `
${IRRIGATION_SOURCE_WGSL}

fn tile(x: i32, y: i32, i: u32) {
  irrigation_out[i] = irrigationSource(i);
}
`;

const IRRIGATION_STEP_WGSL = /* wgsl */ `
${IRRIGATION_SOURCE_WGSL}

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    irrigation_out[i] = 0.0;
    return;
  }
  var total = irrigation_in[i] * 1.8;
  var weight = 1.8;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 1u) != 0u) { continue; }
    total += irrigation_in[ni] * 0.72;
    weight += 0.72;
  }
  irrigation_out[i] = max(irrigationSource(i), total / weight);
}
`;

const HUMIDITY_BIOME_WGSL = /* wgsl */ `
fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    humidity[i] = 0.0;
    flags[i] = flags[i] & 3u;
    return;
  }
  let h = clamp01(precipitation[i] * 0.68 + irrigation_in[i] * 0.55);
  humidity[i] = h;
  let t = temperature[i];
  var biome = 0u;
  if (t < 0.2) {
    biome = select(3u, 2u, h < 0.28);
  } else if (t < 0.38) {
    if (h < 0.25) { biome = 4u; } else if (h < 0.58) { biome = 5u; } else { biome = 6u; }
  } else if (t < 0.64) {
    if (h < 0.2) { biome = 7u; } else if (h < 0.5) { biome = 8u; } else { biome = 9u; }
  } else {
    if (h < 0.18) { biome = 7u; } else if (h < 0.46) { biome = 10u; } else if (h < 0.72) { biome = 11u; } else { biome = 12u; }
  }
  flags[i] = (flags[i] & 3u) | (biome << 8u);
}
`;

// Port of buildWorldEngineTerrainColors (default palette baked in as consts),
// plus the debug layer view modes. Colors are computed in 0..255 space to
// mirror the CPU math, then normalized on store.
const COLOR_WGSL = /* wgsl */ `
const GRASSLAND = vec3f(134.0, 145.0, 78.0);
const COAST = vec3f(191.0, 171.0, 105.0);
const LAND_DRY = vec3f(205.0, 167.0, 88.0);
const LAND_WET = vec3f(35.0, 112.0, 67.0);
const LAND_WARM_DRY = vec3f(194.0, 122.0, 70.0);
const LAND_COLD = vec3f(190.0, 211.0, 216.0);
const LAKE = vec3f(55.0, 132.0, 153.0);
const RIVER_STRONG = vec3f(72.0, 160.0, 190.0);
const RIVER_WEAK = vec3f(63.0, 130.0, 142.0);
const OCEAN_WARM = vec3f(49.0, 197.0, 184.0);
const OCEAN_COLD = vec3f(116.0, 164.0, 187.0);

var<private> BIOME_COLORS: array<vec3f, 13> = array<vec3f, 13>(
  vec3f(18.0, 69.0, 108.0),
  vec3f(220.0, 234.0, 233.0),
  vec3f(143.0, 156.0, 145.0),
  vec3f(111.0, 139.0, 132.0),
  vec3f(153.0, 142.0, 88.0),
  vec3f(87.0, 119.0, 82.0),
  vec3f(52.0, 103.0, 82.0),
  vec3f(190.0, 154.0, 82.0),
  vec3f(134.0, 145.0, 78.0),
  vec3f(55.0, 117.0, 72.0),
  vec3f(178.0, 146.0, 74.0),
  vec3f(49.0, 114.0, 67.0),
  vec3f(31.0, 91.0, 57.0),
);

var<private> ALTITUDE_STOPS: array<vec4f, 6> = array<vec4f, 6>(
  vec4f(0.0, 191.0, 171.0, 105.0),
  vec4f(0.22, 96.0, 135.0, 72.0),
  vec4f(0.48, 126.0, 127.0, 78.0),
  vec4f(0.7, 133.0, 103.0, 78.0),
  vec4f(0.88, 143.0, 134.0, 126.0),
  vec4f(1.0, 226.0, 230.0, 222.0),
);

var<private> OCEAN_STOPS: array<vec4f, 4> = array<vec4f, 4>(
  vec4f(0.0, 77.0, 151.0, 171.0),
  vec4f(0.32, 38.0, 115.0, 155.0),
  vec4f(0.7, 18.0, 74.0, 125.0),
  vec4f(1.0, 7.0, 38.0, 83.0),
);

var<private> ELEVATION_STOPS: array<vec4f, 6> = array<vec4f, 6>(
  vec4f(0.0, 13.0, 45.0, 72.0),
  vec4f(0.28, 38.0, 78.0, 92.0),
  vec4f(0.42, 85.0, 120.0, 74.0),
  vec4f(0.62, 133.0, 133.0, 82.0),
  vec4f(0.8, 128.0, 112.0, 103.0),
  vec4f(1.0, 232.0, 235.0, 226.0),
);

fn ramp6(value: f32, stops: ptr<private, array<vec4f, 6>>) -> vec3f {
  let v = clamp01(value);
  for (var s = 0; s < 5; s += 1) {
    let left = (*stops)[s];
    let right = (*stops)[s + 1];
    if (v <= right.x) {
      let t = (v - left.x) / max(0.0001, right.x - left.x);
      return mix(left.yzw, right.yzw, t);
    }
  }
  return (*stops)[5].yzw;
}

fn ramp4(value: f32, stops: ptr<private, array<vec4f, 4>>) -> vec3f {
  let v = clamp01(value);
  for (var s = 0; s < 3; s += 1) {
    let left = (*stops)[s];
    let right = (*stops)[s + 1];
    if (v <= right.x) {
      let t = (v - left.x) / max(0.0001, right.x - left.x);
      return mix(left.yzw, right.yzw, t);
    }
  }
  return (*stops)[3].yzw;
}

fn isOcean(i: u32) -> bool { return (flags[i] & 1u) != 0u; }
fn isLake(i: u32) -> bool { return (flags[i] & 2u) != 0u; }

fn seaDepthAt(i: u32) -> f32 {
  if (!isOcean(i)) { return 0.0; }
  return clamp01((P.seaLevel - elevation[i]) / max(0.01, P.seaLevel));
}

fn elevationAtClamped(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(GRID.size.x) - 1);
  let cy = clamp(y, 0, i32(GRID.size.y) - 1);
  return elevation[refOf(cx, cy)];
}

fn shallowWarmthAt(i: u32) -> f32 {
  let shallow = clamp01((0.68 - seaDepthAt(i)) / 0.68);
  let warm = clamp01((temperature[i] - 0.48) / 0.38);
  return pow(shallow, 0.7) * pow(warm, 0.75);
}

fn oceanColor(x: i32, y: i32, i: u32) -> vec3f {
  var depthTotal = 0.0;
  var depthWeight = 0.0;
  for (var dy = -4; dy <= 4; dy += 1) {
    for (var dx = -4; dx <= 4; dx += 1) {
      let d2 = dx * dx + dy * dy;
      if (d2 > 16) { continue; }
      let nx = x + dx;
      let ny = y + dy;
      if (!inBounds(nx, ny)) { continue; }
      let ni = refOf(nx, ny);
      if (!isOcean(ni)) { continue; }
      let weight = 1.0 / (1.0 + sqrt(f32(d2)));
      depthTotal += seaDepthAt(ni) * weight;
      depthWeight += weight;
    }
  }
  let blurredDepth = select(seaDepthAt(i), depthTotal / depthWeight, depthWeight > 0.0);

  var warmTotal = 0.0;
  var warmWeight = 0.0;
  for (var dy = -2; dy <= 2; dy += 1) {
    for (var dx = -2; dx <= 2; dx += 1) {
      let d2 = dx * dx + dy * dy;
      if (d2 > 4) { continue; }
      let nx = x + dx;
      let ny = y + dy;
      if (!inBounds(nx, ny)) { continue; }
      let ni = refOf(nx, ny);
      if (!isOcean(ni)) { continue; }
      let weight = 1.0 / (1.0 + sqrt(f32(d2)));
      warmTotal += shallowWarmthAt(ni) * weight;
      warmWeight += weight;
    }
  }
  let blurredWarmth = select(shallowWarmthAt(i), warmTotal / warmWeight, warmWeight > 0.0);

  let visibleDepth = mix(blurredDepth, seaDepthAt(i), 0.12);
  var color = ramp4(visibleDepth, &OCEAN_STOPS);
  color = mix(color, OCEAN_WARM, clamp01(blurredWarmth * 0.58));
  let coldWater = clamp01((0.3 - temperature[i]) / 0.3);
  if (coldWater > 0.0) {
    color = mix(color, OCEAN_COLD, clamp01(coldWater * 0.35));
  }
  return color;
}

fn landColor(x: i32, y: i32, i: u32) -> vec3f {
  let biomeIndex = min((flags[i] >> 8u) & 255u, 12u);
  var color = BIOME_COLORS[biomeIndex];

  let warm = clamp01((temperature[i] - 0.58) / 0.42);
  let cold = clamp01((0.34 - temperature[i]) / 0.34);
  let wet = clamp01((humidity[i] - 0.52) / 0.48);
  let dry = clamp01((0.34 - humidity[i]) / 0.34);
  color = mix(color, LAND_DRY, clamp01(dry * 0.36));
  color = mix(color, LAND_WET, clamp01(wet * 0.34));
  color = mix(color, LAND_WARM_DRY, clamp01(warm * dry * 0.24));
  color = mix(color, LAND_COLD, clamp01(cold * 0.28));

  let altitude = clamp01((elevation[i] - P.seaLevel) / max(0.01, 1.0 - P.seaLevel));
  color = mix(color, ramp6(altitude, &ALTITUDE_STOPS), 0.42);

  var coastal = false;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    if (isOcean(refOf(n.x, n.y))) {
      coastal = true;
      break;
    }
  }
  if (coastal || elevation[i] <= P.seaLevel + 0.055) {
    let coastAmount = select(
      clamp01(1.0 - (elevation[i] - P.seaLevel) / 0.055) * 0.48,
      0.72,
      coastal,
    );
    color = mix(color, COAST, clamp01(coastAmount));
  }

  let west = elevationAtClamped(x - 1, y);
  let east = elevationAtClamped(x + 1, y);
  let north = elevationAtClamped(x, y - 1);
  let south = elevationAtClamped(x, y + 1);
  let light = clamp(1.0 + (west - east + north - south) * 3.6, 0.66, 1.34);
  color = clamp(color * (light * (0.9 + altitude * 0.18)), vec3f(0.0), vec3f(255.0));

  let contour = abs(fract(altitude * 13.0) - 0.5);
  if (altitude > 0.12 && contour > 0.46) {
    color = color * 0.88;
  }

  let coldLand = clamp01((0.36 - temperature[i]) / 0.36);
  if (coldLand > 0.0) {
    color = mix(color, LAND_COLD, clamp01(coldLand * 0.38));
  }

  let dither = hash01(P.seed + 3907, x, y) - 0.5;
  let climateTexture = (precipitation[i] - 0.5) * 7.0 + dither * 10.0;
  color = clamp(color + vec3f(climateTexture), vec3f(0.0), vec3f(255.0));

  // The CPU colorizer thresholds the NORMALIZED watermap (land max = 1).
  let waterMax = bitcast<f32>(G.waterMaxBits);
  let normalizedWater = select(0.0, clamp01(water_in[i] / waterMax), waterMax > 0.0);
  let weakThreshold = min(P.riverWeakThreshold, P.riverStrongThreshold);
  let strongThreshold = max(P.riverWeakThreshold, P.riverStrongThreshold);
  if (isLake(i)) {
    color = mix(color, LAKE, 0.94);
  } else if (normalizedWater > weakThreshold) {
    let riverSpan = max(0.01, strongThreshold - weakThreshold);
    let riverStrength = clamp01((normalizedWater - weakThreshold) / riverSpan);
    let riverColor = mix(RIVER_WEAK, RIVER_STRONG, riverStrength);
    color = mix(color, riverColor, mix(0.58, 0.9, riverStrength));
  }

  return color;
}

fn layerColor(x: i32, y: i32, i: u32) -> vec3f {
  let ocean = isOcean(i);
  switch (P.viewMode) {
    case 1u: {
      return ramp6(elevation[i], &ELEVATION_STOPS);
    }
    case 2u: {
      let t = temperature[i];
      if (t < 0.5) {
        return mix(vec3f(40.0, 80.0, 160.0), vec3f(230.0, 220.0, 120.0), t * 2.0);
      }
      return mix(vec3f(230.0, 220.0, 120.0), vec3f(200.0, 60.0, 50.0), t * 2.0 - 1.0);
    }
    case 3u: {
      return mix(vec3f(240.0, 240.0, 220.0), vec3f(40.0, 110.0, 200.0), precipitation[i]);
    }
    case 4u: {
      if (ocean) { return vec3f(10.0, 20.0, 35.0); }
      if (isLake(i)) { return LAKE; }
      let waterMax = bitcast<f32>(G.waterMaxBits);
      let normalized = select(0.0, clamp01(water_in[i] / waterMax), waterMax > 0.0);
      return mix(vec3f(20.0, 30.0, 40.0), vec3f(80.0, 200.0, 255.0), pow(normalized, 0.35));
    }
    case 5u: {
      if (ocean) { return vec3f(15.0, 25.0, 45.0); }
      return mix(vec3f(180.0, 150.0, 90.0), vec3f(30.0, 140.0, 80.0), humidity[i]);
    }
    case 6u: {
      if (ocean) { return BIOME_COLORS[0]; }
      return BIOME_COLORS[min((flags[i] >> 8u) & 255u, 12u)];
    }
    default: {
      if (ocean) { return oceanColor(x, y, i); }
      return landColor(x, y, i);
    }
  }
}

fn tile(x: i32, y: i32, i: u32) {
  let color = layerColor(x, y, i);
  textureStore(out_tex, vec2i(x, y), vec4f(color / 255.0, 1.0));
}
`;

const WORLDGEN_KERNEL_CONFIG: FieldKernelConfig = {
  prelude: PRELUDE_WGSL,
  uniforms: [{ name: "P", bytes: PARAMS_BYTES, wgslType: "Params" }],
  buffers: [
    { name: "elevation", type: "f32" },
    { name: "ocean", type: "u32", pingPong: true },
    { name: "flags", type: "u32" },
    { name: "temperature", type: "f32" },
    { name: "precipitation", type: "f32" },
    { name: "fill", type: "f32", pingPong: true },
    { name: "dir", type: "u32" },
    { name: "water", type: "f32", pingPong: true },
    { name: "irrigation", type: "f32", pingPong: true },
    { name: "humidity", type: "f32" },
    { name: "G", type: "u32", count: 4, clearable: true },
    { name: "hist", type: "u32", count: 256, clearable: true },
  ],
  passes: [
    { name: "elevation", binds: ["P", "elevation!"], code: ELEVATION_WGSL },
    {
      name: "oceanInit",
      binds: ["P", "elevation", "ocean.write"],
      advances: ["ocean"],
      code: OCEAN_INIT_WGSL,
    },
    {
      name: "oceanStep",
      binds: ["P", "elevation", "ocean.read", "ocean.write"],
      advances: ["ocean"],
      code: OCEAN_STEP_WGSL,
    },
    {
      name: "flagsInit",
      binds: ["ocean.read", "flags!"],
      code: FLAGS_INIT_WGSL,
    },
    {
      name: "histogram",
      binds: [
        "elevation",
        "flags",
        "hist:array<atomic<u32>, 256>!",
        "G:GlobalsAtomic!",
      ],
      code: HISTOGRAM_WGSL,
    },
    {
      name: "quantile",
      binds: ["hist:array<u32, 256>", "G:Globals!"],
      kind: "single",
      code: QUANTILE_WGSL,
    },
    {
      name: "climate",
      binds: [
        "P",
        "elevation",
        "flags",
        "G:Globals",
        "temperature!",
        "precipitation!",
      ],
      code: CLIMATE_WGSL,
    },
    {
      name: "fillInit",
      binds: ["P", "elevation", "flags", "fill.write"],
      advances: ["fill"],
      code: FILL_INIT_WGSL,
    },
    {
      name: "fillStep",
      binds: ["elevation", "flags", "fill.read", "fill.write"],
      advances: ["fill"],
      code: FILL_STEP_WGSL,
    },
    {
      name: "flowDir",
      binds: ["P", "fill.read", "flags", "dir!"],
      code: FLOW_DIR_WGSL,
    },
    {
      name: "waterInit",
      binds: ["flags", "precipitation", "water.write"],
      advances: ["water"],
      code: WATER_INIT_WGSL,
    },
    {
      name: "waterStep",
      binds: [
        "P",
        "flags",
        "precipitation",
        "dir",
        "water.read",
        "water.write",
      ],
      advances: ["water"],
      code: WATER_STEP_WGSL,
    },
    {
      name: "waterMax",
      binds: ["flags", "water.read", "G:GlobalsAtomic!"],
      code: WATER_MAX_WGSL,
    },
    {
      name: "lakes",
      binds: ["P", "elevation", "fill.read", "water.read", "flags!"],
      code: LAKES_WGSL,
    },
    {
      name: "lakeSpread",
      binds: ["P", "elevation", "fill.read", "flags!"],
      code: LAKE_SPREAD_WGSL,
    },
    {
      name: "irrigationInit",
      binds: ["flags", "water.read", "G:Globals", "irrigation.write"],
      advances: ["irrigation"],
      code: IRRIGATION_INIT_WGSL,
    },
    {
      name: "irrigationStep",
      binds: [
        "flags",
        "water.read",
        "G:Globals",
        "irrigation.read",
        "irrigation.write",
      ],
      advances: ["irrigation"],
      code: IRRIGATION_STEP_WGSL,
    },
    {
      name: "humidityBiome",
      binds: [
        "temperature",
        "precipitation",
        "irrigation.read",
        "humidity!",
        "flags!",
      ],
      code: HUMIDITY_BIOME_WGSL,
    },
    {
      name: "color",
      binds: [
        "P",
        "elevation",
        "flags",
        "temperature",
        "precipitation",
        "water.read",
        "humidity",
        "G:Globals",
        "out",
      ],
      code: COLOR_WGSL,
    },
  ],
};

export class WebGpuWorldEngine {
  private constructor(private readonly kernel: FieldKernel) {}

  get adapterInfo(): string {
    return this.kernel.adapterInfo;
  }

  static isSupported(): boolean {
    return FieldKernel.isSupported();
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuWorldEngine> {
    return new WebGpuWorldEngine(
      await FieldKernel.create(canvas, WORLDGEN_KERNEL_CONFIG),
    );
  }

  destroy(): void {
    this.kernel.destroy();
  }

  async generate(
    config: Partial<FoundationWorldEngineMapConfig>,
    viewMode: WebGpuViewMode,
  ): Promise<WebGpuGenerateResult> {
    const normalized = normalizeFoundationWorldEngineMapConfig(config);
    const { width, height } = normalized;
    this.kernel.resize(width, height);
    this.kernel.writeUniform("P", buildParams(normalized, viewMode));
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");

    const maxDim = Math.max(width, height);
    const oceanIters = Math.min(maxDim, 512);
    const fillIters = Math.min(maxDim, 320);
    const flowIters = Math.min(maxDim, 320);

    const frame = this.kernel.beginFrame();
    frame.pass("elevation");
    frame.pass("oceanInit");
    frame.iterate("oceanStep", oceanIters);
    frame.pass("flagsInit");
    frame.pass("histogram");
    frame.pass("quantile");
    frame.pass("climate");
    frame.pass("fillInit");
    frame.iterate("fillStep", fillIters);
    frame.pass("flowDir");
    frame.pass("waterInit");
    frame.iterate("waterStep", flowIters);
    frame.pass("waterMax");
    frame.pass("lakes");
    frame.iterate("lakeSpread", 12);
    frame.pass("irrigationInit");
    frame.iterate("irrigationStep", 8);
    frame.pass("humidityBiome");
    frame.pass("color");
    frame.present();
    const result = await frame.finish();
    return { ...result, width, height };
  }
}

function buildParams(
  config: FoundationWorldEngineMapConfig,
  viewMode: WebGpuViewMode,
): ArrayBuffer {
  const data = new ArrayBuffer(PARAMS_BYTES);
  const view = new DataView(data);
  view.setInt32(0, config.seed, true);
  view.setUint32(4, Math.max(0, WEBGPU_VIEW_MODES.indexOf(viewMode)), true);
  const floats: number[] = [
    config.seaLevel,
    config.continentScale,
    config.mountainStrength,
    config.coastFalloff,
    config.coastRoughness,
    config.latitudeEffect,
    config.elevationCooling,
    config.rainNoise,
    config.warmthRainfall,
    config.riverFlowRetention,
    config.lakeWaterThreshold,
    config.lakeElevationRange,
    config.riverWeakThreshold,
    config.riverStrongThreshold,
  ];
  floats.forEach((value, index) => {
    view.setFloat32(8 + index * 4, value, true);
  });
  return data;
}
