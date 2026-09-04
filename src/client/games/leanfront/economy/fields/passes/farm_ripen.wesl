// Farm maturity — the economy's per-tile crop CA, ported to the GPU.
//
// This is the RIPEN phase of FarmGrowth.farmTick: every field tile climbs the
// Gompertz curve toward its climate suitability, or senesces down to it, and an
// unstaffed (fallow) tile senesces to the initial-farmland floor and holds. It
// is pure per-tile arithmetic over planes the pipeline already has — exactly the
// shape that makes a field economy cheaper than a per-territory CPU walk.
//
// Not here: phase 2, which places one new tilled plot per nucleus per tick from
// accrued credit. That is an entity placement (a seeded weighted pick against a
// per-nucleus credit ledger), and belongs with the placement CA rather than the
// ripen pass.
//
// Liebig suitability = min(tempFactor, waterFactor(moisture), cropN), matching
// FarmGrowth.climateSuitability exactly.
// The four per-tile booleans this pass needs are PACKED into one plane: WebGPU
// allows only 8 storage buffers per stage, and separate planes for damage /
// field-zone / nucleus / fallow blew straight past it.
import package::bindings::{owner, crop, water, temperature, humidity, farmFlags, maturity_in, maturity_out};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_NUCLEUS: u32 = 4u;
const FLAG_FALLOW: u32 = 8u;
const FLAG_OWNER_CHANGED: u32 = 128u;

const CLAIM: f32 = __FIELD_CLAIM_MILLI__;
const SEED: f32 = __FARM_SEED_MILLI__;
const GROWTH_RATE: f32 = __FARM_GROWTH_RATE__;
const SENESCE_RATE: f32 = __FARM_SENESCE_RATE__;
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

/** Gompertz slope M·ln(1/M), peaking near 1/e, zero at both ends. */
fn gompertzSlope(m: f32) -> f32 {
  if (m <= 0.0 || m >= 1.0) { return 0.0; }
  return m * log(1.0 / m);
}

fn tile(x: i32, y: i32, i: u32) {
  var mMilli = maturity_in[i];
  maturity_out[i] = mMilli;
  if (owner[i] == 0u) { return; }
  let flags = farmFlags[i];

  // CONQUEST, before anything else — `GameImpl.conquer` runs before the tick's
  // farm phase. The rule: the previous owner's crop is destroyed, and if the
  // ground carried a FIELD zone the captor inherits it at the seed value (the
  // zone transfers with the tile, so the flag survives the flip). Everything
  // else — wilderness, urban ground — comes up bare. Relinquished land
  // (owner 0) is bare too.
  //
  // Derived here rather than fed in: every input is already resident, so the
  // CPU never has to say what conquest MEANS, only which tiles moved. Applying
  // it once per dispatch also makes the outcome a property of the tick boundary
  // rather than of which attack execution happened to run first — the same
  // order-independence the shed tie-break and the frontier ordering buy.
  if ((flags & FLAG_OWNER_CHANGED) != 0u) {
    if (owner[i] != 0u && (flags & FLAG_FIELD_ZONE) != 0u) {
      mMilli = SEED;
    } else {
      mMilli = 0.0;
    }
    maturity_out[i] = mMilli;
  }

  // NUCLEUS SEEDING — `farmTick` does this before it ripens anything.
  // A freshly-built nucleus starts at a small seed so the Gompertz slope
  // M·ln(1/M) is non-zero and the field can begin ripening at all; at exactly
  // zero the slope is zero and the farm would never start. Folded in here
  // rather than given its own pass because it needs the same two reads.
  if ((flags & FLAG_NUCLEUS) != 0u && mMilli <= 0.0) {
    mMilli = SEED;
    maturity_out[i] = SEED;
  }

  // Battle-worn ground freezes its farm — no ripening, no senescence.
  if ((flags & FLAG_DAMAGED) != 0u) { return; }
  // Membership is the persistent Field ZONE, not the current maturity: a tile
  // that once reached the claim threshold stays a field and regrows in place.
  let isField = mMilli >= CLAIM || (flags & FLAG_FIELD_ZONE) != 0u;
  let isNucleus = (flags & FLAG_NUCLEUS) != 0u;

  if (isField && (flags & FLAG_FALLOW) != 0u) {
    // Unstaffed: senesce toward the initial-farmland floor and HOLD there.
    let step = max(1.0, SENESCE_RATE * mMilli);
    maturity_out[i] = max(SEED, mMilli - step);
    return;
  }
  if (!isField && !isNucleus) { return; }

  let m = mMilli / 1000.0;
  let suit = climateSuitability(i);
  let drive = suit - m;
  var delta = SENESCE_RATE * drive;
  if (drive >= 0.0) { delta = GROWTH_RATE * gompertzSlope(m); }
  let next = m + delta;
  // Cap the step at the remaining gap so a farm settles at its suitability.
  var settled = max(next, suit);
  if (drive >= 0.0) { settled = min(next, suit); }
  var floorMilli = 0.0;
  if (isField) { floorMilli = SEED; }
  maturity_out[i] = max(floorMilli, round(settled * 1000.0));
}
