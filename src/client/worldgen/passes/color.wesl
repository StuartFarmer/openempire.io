// Terrain colorizer: port of the CPU buildWorldEngineTerrainColors, plus the
// debug layer view modes (P.viewMode). Colors are computed in 0..255 space to
// mirror the CPU math, then normalized on store.
import package::kernel::{GRID, OFF, inBounds, refOf, clamp01, hash01};
import package::bindings::{P, elevation, flags, temperature, precipitation, water_in, fill_in, humidity, riverBase, G, out_tex};
import package::palette::{
  COAST, LAND_DRY, LAND_WET, LAND_WARM_DRY, LAND_COLD, LAKE,
  OCEAN_WARM, OCEAN_COLD,
  BIOME_COLORS, ALTITUDE_STOPS, OCEAN_STOPS, ELEVATION_STOPS, ramp6, ramp4,
};

fn isOcean(i: u32) -> bool { return (flags[i] & 1u) != 0u; }
fn isLake(i: u32) -> bool { return (flags[i] & 2u) != 0u; }
/** Any full water body — sea or inland. ONE water system. */
fn isWaterBody(i: u32) -> bool { return (flags[i] & 3u) != 0u; }

/**
 * Physical water depth, one definition for all water: the surface minus the
 * bed. The sea's surface is sea level; inland water's surface is the
 * depression-fill level (fill = the level standing water reaches — flat
 * over lake basins, hugging terrain along rivers). Same normalization, same
 * ramp, no synthesized shelves.
 */
fn waterDepthAt(i: u32) -> f32 {
  let surface = select(fill_in[i], P.seaLevel, isOcean(i));
  return clamp01((surface - elevation[i]) / max(0.01, P.seaLevel));
}

/** Snow-cover fraction from the live temperature (0 disables). iceThreshold
 * is the freeze/melt PIVOT (0 °C): full snow below it, bare above it, 50% at
 * it. snowBand is the half-width of the slush transition either side. */
fn snowCoverAt(i: u32) -> f32 {
  if (P.iceThreshold <= 0.0) { return 0.0; }
  let band = max(P.snowBand, 0.001);
  return 1.0 - smoothstep(
    P.iceThreshold - band,
    P.iceThreshold + band,
    temperature[i],
  );
}

fn elevationAtClamped(x: i32, y: i32) -> f32 {
  let cx = clamp(x, 0, i32(GRID.size.x) - 1);
  let cy = clamp(y, 0, i32(GRID.size.y) - 1);
  return elevation[refOf(cx, cy)];
}

fn shallowWarmthAt(i: u32) -> f32 {
  let shallow = clamp01((0.68 - waterDepthAt(i)) / 0.68);
  let warm = clamp01((temperature[i] - 0.48) / 0.38);
  return pow(shallow, 0.7) * pow(warm, 0.75);
}

fn waterColor(x: i32, y: i32, i: u32) -> vec3f {
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
      if (!isWaterBody(ni)) { continue; }
      let weight = 1.0 / (1.0 + sqrt(f32(d2)));
      depthTotal += waterDepthAt(ni) * weight;
      depthWeight += weight;
    }
  }
  let blurredDepth = select(waterDepthAt(i), depthTotal / depthWeight, depthWeight > 0.0);

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
      if (!isWaterBody(ni)) { continue; }
      let weight = 1.0 / (1.0 + sqrt(f32(d2)));
      warmTotal += shallowWarmthAt(ni) * weight;
      warmWeight += weight;
    }
  }
  let blurredWarmth = select(shallowWarmthAt(i), warmTotal / warmWeight, warmWeight > 0.0);

  let visibleDepth = mix(blurredDepth, waterDepthAt(i), 0.12);
  var color = ramp4(visibleDepth, &OCEAN_STOPS);
  color = mix(color, OCEAN_WARM, clamp01(blurredWarmth * 0.58));
  let coldWater = clamp01((0.3 - temperature[i]) / 0.3);
  if (coldWater > 0.0) {
    color = mix(color, OCEAN_COLD, clamp01(coldWater * 0.35));
  }
  // Inland water freezes under the snow band; the open sea keeps its cold
  // tint instead.
  if (!isOcean(i)) {
    color = mix(color, vec3f(205.0, 225.0, 234.0), snowCoverAt(i) * 0.75);
  }
  return color;
}

// Continuous biome color: the classifier's (temperature, humidity) bands,
// but every band edge is a smoothstep of width P.biomeBlend instead of a
// hard switch — steep real-world climate gradients (Sahel, rain shadows)
// grade instead of cutting. biomeBlend → 0 reproduces the discrete pick.
fn smoothBiomeColor(t: f32, h: f32) -> vec3f {
  let w = max(P.biomeBlend, 0.001);
  let cold = mix(BIOME_COLORS[2], BIOME_COLORS[3],
    smoothstep(0.28 - w, 0.28 + w, h));
  var cool = mix(BIOME_COLORS[4], BIOME_COLORS[5],
    smoothstep(0.25 - w, 0.25 + w, h));
  cool = mix(cool, BIOME_COLORS[6], smoothstep(0.58 - w, 0.58 + w, h));
  var temperate = mix(BIOME_COLORS[7], BIOME_COLORS[8],
    smoothstep(0.2 - w, 0.2 + w, h));
  temperate = mix(temperate, BIOME_COLORS[9],
    smoothstep(0.5 - w, 0.5 + w, h));
  var hot = mix(BIOME_COLORS[7], BIOME_COLORS[10],
    smoothstep(0.18 - w, 0.18 + w, h));
  hot = mix(hot, BIOME_COLORS[11], smoothstep(0.46 - w, 0.46 + w, h));
  hot = mix(hot, BIOME_COLORS[12], smoothstep(0.72 - w, 0.72 + w, h));
  var c = mix(cold, cool, smoothstep(0.2 - w, 0.2 + w, t));
  c = mix(c, temperate, smoothstep(0.38 - w, 0.38 + w, t));
  c = mix(c, hot, smoothstep(0.64 - w, 0.64 + w, t));
  return c;
}

fn landColor(x: i32, y: i32, i: u32) -> vec3f {
  let t = temperature[i];
  let h = humidity[i];

  // ONE snow model: cover fades from full pack below iceThreshold to bare
  // ground at iceThreshold + snowBand. Terrain is computed normally and the
  // shaded snow surface is blended over it at the very end — no separate
  // ice paint fighting a post-hoc whitening.
  let snowCover = snowCoverAt(i);

  var color = smoothBiomeColor(t, h);

  let warm = clamp01((t - 0.58) / 0.42);
  let cold = clamp01((0.34 - t) / 0.34);
  let wet = clamp01((h - 0.52) / 0.48);
  let dry = clamp01((0.34 - h) / 0.34);
  color = mix(color, LAND_DRY, clamp01(dry * 0.36));
  color = mix(color, LAND_WET, clamp01(wet * 0.34));
  color = mix(color, LAND_WARM_DRY, clamp01(warm * dry * 0.24));
  color = mix(color, LAND_COLD, clamp01(cold * 0.28));

  let altitude = clamp01((elevation[i] - P.seaLevel) / max(0.01, 1.0 - P.seaLevel));
  color = mix(color, ramp6(altitude, &ALTITUDE_STOPS), 0.42);

  // Coast sand rings the sea only — lakes and river corridors sit flush
  // against the terrain.
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
  let contoured = altitude > 0.12 && contour > 0.46;
  if (contoured) {
    color = color * 0.88;
  }

  let coldLand = clamp01((0.36 - t) / 0.36);
  if (coldLand > 0.0) {
    color = mix(color, LAND_COLD, clamp01(coldLand * 0.38));
  }

  let dither = hash01(P.seed + 3907, x, y) - 0.5;
  let climateTexture = (precipitation[i] - 0.5) * 7.0 + dither * 10.0;
  color = clamp(color + vec3f(climateTexture), vec3f(0.0), vec3f(255.0));

  // Rivers: the SHIPPED river channel plane (hydro.bin — lakes and rivers
  // kept distinct), or the flow solver's normalized watermap in synthetic
  // mode. Same water system as full bodies — depth-ramped color — mixed by
  // coverage, so thin water shows terrain through.
  let waterMax = bitcast<f32>(G.waterMaxBits);
  let normalizedWater = select(0.0, clamp01(water_in[i] / waterMax), waterMax > 0.0);
  let riverSignal = select(normalizedWater, riverBase[i], P.useClimateBase > 0.5);
  let weakThreshold = min(P.riverWeakThreshold, P.riverStrongThreshold);
  let strongThreshold = max(P.riverWeakThreshold, P.riverStrongThreshold);
  let waterAlpha = smoothstep(weakThreshold, strongThreshold + 0.001, riverSignal) * 0.85;
  if (waterAlpha > 0.0) {
    var water = ramp4(waterDepthAt(i), &OCEAN_STOPS);
    // Frozen surface inside the snow band.
    water = mix(water, vec3f(205.0, 225.0, 234.0), snowCover * 0.75);
    color = mix(color, water, waterAlpha);
  }

  // The snow surface keeps its own relief: hillshade, altitude brightness,
  // and faint contours, so icecaps read as terrain, not flat paint.
  if (snowCover > 0.0) {
    var snowSurface = clamp(
      vec3f(230.0, 240.0, 244.0) * (light * (0.94 + altitude * 0.1)),
      vec3f(0.0), vec3f(255.0),
    );
    if (contoured) {
      snowSurface = snowSurface * 0.95;
    }
    snowSurface = clamp(snowSurface + vec3f(dither * 4.0), vec3f(0.0), vec3f(255.0));
    color = mix(color, snowSurface, snowCover);
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
      if (isWaterBody(i)) { return waterColor(x, y, i); }
      return landColor(x, y, i);
    }
  }
}

fn tile(x: i32, y: i32, i: u32) {
  let color = layerColor(x, y, i);
  textureStore(out_tex, vec2i(x, y), vec4f(color / 255.0, 1.0));
}
