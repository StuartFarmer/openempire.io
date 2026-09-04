// The patch frontier's WEIGHT field, precomputed once per tile.
//
// `placePatch` weights each candidate by
//   climateSuitability(t) * (1 + wFieldWater * waterAccess(t))
// which needs four layer planes plus the shoreline bit. Computing that inside
// the race pass would push it to ten storage buffers against a cap of eight, so
// it is materialised here and the race consumes a single plane — exactly how
// `urban_pick` consumes the precomputed `suitability`.
//
// Zero means "never a candidate", which the race can then reject with one read.
import package::bindings::{crop, water, temperature, humidity, shore, patchWeight};

const HUMIDITY_WEIGHT: f32 = __HUMIDITY_WEIGHT__;
const TEMP_BASE_N: f32 = __TEMP_BASE_N__;
const TEMP_OPT_LO_N: f32 = __TEMP_OPT_LO_N__;
const TEMP_OPT_HI_N: f32 = __TEMP_OPT_HI_N__;
const TEMP_MAX_N: f32 = __TEMP_MAX_N__;
const WATER_WILT_N: f32 = __WATER_WILT_N__;
const WATER_FULL_N: f32 = __WATER_FULL_N__;
const W_SHORE: f32 = __W_SHORE__;
const W_FIELD_WATER: f32 = __W_FIELD_WATER__;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;

fn tempFactor(tN: f32) -> f32 {
  if (tN <= TEMP_BASE_N || tN >= TEMP_MAX_N) { return 0.0; }
  if (tN < TEMP_OPT_LO_N) {
    return (tN - TEMP_BASE_N) / (TEMP_OPT_LO_N - TEMP_BASE_N);
  }
  if (tN <= TEMP_OPT_HI_N) { return 1.0; }
  return (TEMP_MAX_N - tN) / (TEMP_MAX_N - TEMP_OPT_HI_N);
}

fn waterFactor(mN: f32) -> f32 {
  if (mN <= WATER_WILT_N) { return 0.0; }
  if (mN >= WATER_FULL_N) { return 1.0; }
  return (mN - WATER_WILT_N) / (WATER_FULL_N - WATER_WILT_N);
}

fn climateSuitability(i: u32) -> f32 {
  let tN = temperature[i] / 255.0;
  let humN = humidity[i] / 255.0;
  let watN = water[i] / 255.0;
  let cropN = crop[i] / 255.0;
  let moisture = HUMIDITY_WEIGHT * humN + (1.0 - HUMIDITY_WEIGHT) * watN;
  return min(min(tempFactor(tN), waterFactor(moisture)), cropN);
}

fn tile(x: i32, y: i32, i: u32) {
  let suit = climateSuitability(i);
  // Claim-viable: ground that would settle below the claim threshold senesces
  // straight back to wild, so it is never a candidate at all.
  if (suit * 1000.0 < CLAIM) {
    patchWeight[i] = 0.0;
    return;
  }
  let access = water[i] / 255.0 + W_SHORE * shore[i];
  patchWeight[i] = suit * (1.0 + W_FIELD_WATER * access);
}
