// Farm TENURE: a district's nucleus ages only once its crop has settled at the
// climate ceiling — the farm is doing everything this ground allows, so the
// clock starts.
//
// This is the second half of `TileTenure.tenureTick`. The first half ages CITY
// tiles behind a per-player demand gate (population against housing) and reduces
// a per-player housing bonus. It MOVES WITH THE CUTOVER too (task 1.13): its
// inputs — `density`, `tenure`, FLAG_DAMAGED — are all resident planes, so
// leaving it behind would mean copying them back to read them. The gate arrives
// as a per-player flag (`playerSeed`'s shape) and the bonus leaves as a
// per-player integer reduction (`roomCount`'s shape). What is per-tile here is
// exactly this: compare a tile's maturity to its own climate suitability and
// advance one tick of tenure.
//
// ORDER MATTERS, and it is the ordering that broke the ledger cutover once
// already. On the CPU `tenureTick` runs AFTER `foodTick` — so the ledger reads
// tenure BEFORE this tick's increment, and reads maturity AFTER `farmTick`
// ripened it. This pass must therefore sit after `district_yield` and after
// `farm_ripen`, which is where the pipeline places it.
import package::bindings::{owner, crop, water, temperature, humidity, farmFlags, maturity_in, tenure};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_NUCLEUS: u32 = 4u;

const HUMIDITY_WEIGHT: f32 = __HUMIDITY_WEIGHT__;
const TEMP_BASE_N: f32 = __TEMP_BASE_N__;
const TEMP_OPT_LO_N: f32 = __TEMP_OPT_LO_N__;
const TEMP_OPT_HI_N: f32 = __TEMP_OPT_HI_N__;
const TEMP_MAX_N: f32 = __TEMP_MAX_N__;
const WATER_WILT_N: f32 = __WATER_WILT_N__;
const WATER_FULL_N: f32 = __WATER_FULL_N__;

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
  if (owner[i] == 0u) { return; }
  let flags = farmFlags[i];
  // Only a Farmland NUCLEUS holds a farm clock — `tenureTick` walks the
  // player's Farmland units, not the field's tiles.
  if ((flags & FLAG_NUCLEUS) == 0u) { return; }
  // Combat damage pauses the clock.
  if ((flags & FLAG_DAMAGED) != 0u) { return; }
  let mMilli = maturity_in[i];
  if (mMilli <= 0.0) { return; }

  // Settled at the ceiling: the CPU compares integer milliunits, so the
  // suitability is rounded to milli before the comparison rather than after.
  let suitMilli = round(climateSuitability(i) * 1000.0);
  if (suitMilli <= 0.0) { return; }
  if (mMilli < suitMilli) { return; }

  tenure[i] = tenure[i] + 1000.0; // one tick of tenure, in milli
}
