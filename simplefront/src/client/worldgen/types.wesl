// Shared structs for the worldgen pipeline. The uniform/storage bindings that
// carry these are generated per pass (package::bindings); only the layouts
// live here.

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
  // Seasonal model (export-primary-fields): axial tilt in degrees, the year
  // phase in 0..1, and a strength multiplier. All zero = annual mean (the
  // generator's static output).
  tilt: f32,
  yearPhase: f32,
  seasonStrength: f32,
  // Permanent ice: land colder than this (in the temperature plane's units)
  // classifies as the palette's Ice biome. 0 disables (procedural generator).
  iceThreshold: f32,
  // >0.5: REAL climate base — temperature = tempBase + seasonal swing and
  // moisture = humidityBase (the shipped planes), with nothing synthetic;
  // <=0.5: the synthetic latitude/altitude + fbm rain model.
  useClimateBase: f32,
  // Snow gradient width above iceThreshold: land between iceThreshold and
  // iceThreshold + snowBand blends toward snowpack instead of cutting hard.
  snowBand: f32,
  // Half-width of the smoothstep across every biome band edge in the
  // colorizer. 0 = the classifier's hard cuts.
  biomeBlend: f32,
  // >0.5: seasonal swing from the uploaded per-tile amplitude+phase fields
  // (real continentality), instead of the synthetic latitude×tilt model.
  useSeasonField: f32,
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
