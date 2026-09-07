// Temperature and moisture helpers. Real-base mode (useClimateBase):
// both come from the shipped planes — temperature = tempBase + seasonal
// swing, precipitation = humidityBase — with nothing synthetic. Otherwise
// the synthetic latitude/altitude model + fbm rain fields.
import package::kernel::{GRID, clamp01, fbm};
import package::bindings::{P, elevation, flags, G, tempBase, humidityBase, seasonAmp, seasonPhase};

fn temperatureAt(x: i32, y: i32, i: u32) -> f32 {
  let nx = f32(x) / f32(GRID.size.x);
  let ny = f32(y) / f32(GRID.size.y);
  let ocean = (flags[i] & 1u) != 0u;

  let latitude = abs(f32(y) / max(1.0, f32(GRID.size.y) - 1.0) * 2.0 - 1.0);
  let equatorWarmth = 1.0 - latitude;
  let thermalNoise = fbm(P.seed + 211, nx, ny, 3.2, 4, 0.5) - 0.5;
  let altitude = max(0.0, elevation[i] - G.mountainThreshold);
  // Seasonal swing. Real mode (useSeasonField): the per-tile first harmonic
  // fit from monthly data — amplitude (already in normalized temp units) and
  // phase (year fraction of the peak) — so maritime coasts barely move and
  // continental interiors swing hard, real continentality. Synthetic mode:
  // the crude latitude×tilt model (declination ∝ tilt, amplitude ∝ latitude,
  // phase flips across the equator).
  let signedLatitude = 1.0 - 2.0 * (f32(y) / f32(GRID.size.y));
  let syntheticSeason = sin(6.2831853 * P.yearPhase) * signedLatitude *
    (P.tilt / 90.0);
  let realSeason = seasonAmp[i] * cos(6.2831853 * (P.yearPhase - seasonPhase[i]));
  let seasonal = select(syntheticSeason, realSeason, P.useSeasonField > 0.5) *
    P.seasonStrength;
  let synthetic = clamp01(
    0.5 +
    (equatorWarmth - 0.5) * P.latitudeEffect +
    thermalNoise * 0.28 -
    altitude * P.elevationCooling * 1.9 +
    select(0.0, 0.04, ocean) +
    seasonal
  );
  // Real climate base (100%-faithful mode): the baked annual-mean plane —
  // measured data on earth maps, the engine's own derivation on generated
  // ones — swung by the seasonal model. Altitude cooling is already in the
  // measurements, so no synthetic terms are added on top. LAND ONLY: the
  // measurements are land-extrapolated over water (polygonal seams over the
  // open ocean), so sea temperature stays on the smooth synthetic model.
  let based = clamp01(tempBase[i] + seasonal);
  let real = P.useClimateBase > 0.5;
  let temp = select(synthetic, based, real && !ocean);
  return temp;
}

fn precipitationAt(x: i32, y: i32, i: u32) -> f32 {
  let nx = f32(x) / f32(GRID.size.x);
  let ny = f32(y) / f32(GRID.size.y);
  let ocean = (flags[i] & 1u) != 0u;
  let temp = temperatureAt(x, y, i);
  let rainField = fbm(P.seed + 419, nx, ny, 4.2, 5, 0.52);
  let stormBand = fbm(P.seed + 727, nx + f32(y) * 0.002, ny, 1.8, 3, 0.6);
  let orographic = clamp01(elevation[i] - P.seaLevel) * 0.24;
  let coastalMoisture = select(0.0, 0.18, ocean);
  let warmRain = temp * P.warmthRainfall;
  let value = rainField * P.rainNoise +
    stormBand * (1.0 - P.rainNoise) +
    warmRain + coastalMoisture + orographic;
  let syntheticRain = clamp01(value / (1.18 + P.warmthRainfall * 0.35));
  // Real mode: moisture is the shipped humidity plane — the Sahara gets no
  // imaginary rain. Rivers and color texture downstream see the same field.
  return select(syntheticRain, humidityBase[i], P.useClimateBase > 0.5);
}
