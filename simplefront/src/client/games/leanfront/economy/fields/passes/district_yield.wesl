// The LEDGER's per-tile half: each tilled tile's harvest and granary capacity,
// accumulated into its district.
//
// This is FoodEconomy.foodTick's production loop — the one part of the ledger
// that is O(territory) rather than O(farms), and so the only part worth moving.
// Everything after it (region aggregation, allocation, births and deaths) is
// per-cell and per-player arithmetic that the CPU does cheaply.
//
// Exactness rests on INTEGER accumulation. Each tile's contribution is rounded
// to milliunits before it is added, and integer `atomicAdd` is commutative and
// associative — so the district total is a property of the SET of tiles, not of
// the order a traversal happened to visit them in. A float sum could never be
// reproduced here, because thousands of threads add in nondeterministic order.
// The CPU side rounds identically, so the two agree exactly rather than closely.
//
// Accumulators are indexed by a DENSE DISTRICT SLOT, mapped from the cell tile
// the shed flood computed (unique across players — a tile has one owner). The
// slot indirection is what makes the aggregate small: indexing by tile ref makes
// the accumulator grid-sized, so reading back the "small aggregates" would have
// cost more than the flood planes Level B exists to stop shipping.
import package::bindings::{owner, crop, farmFlags, tenure, maturity_in, shedCell_in, cellSlot, prodAccum, capAccum};

const FLAG_TILLED: u32 = 16u;
const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const FIELD_TILE_STORAGE_MILLI: f32 = __FIELD_TILE_STORAGE_MILLI__;
const FIELD_TILE_YIELD_MILLI: f32 = __FIELD_TILE_YIELD_MILLI__;
const TENURE_HALF_MILLI: f32 = __TENURE_HALF_MILLI__;

/** tenureMilli / (tenureMilli + halfMilli); 0 at zero tenure. */
fn tenureCurve(tenureMilli: f32) -> f32 {
  if (tenureMilli <= 0.0) { return 0.0; }
  return tenureMilli / (tenureMilli + TENURE_HALF_MILLI);
}

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  if ((farmFlags[i] & FLAG_TILLED) == 0u) { return; }
  let cell = shedCell_in[i];
  if (cell == UNREACHED) { return; } // lost since refresh
  // Districts accumulate into DENSE slots, not tile refs: a tile-indexed
  // accumulator is grid-sized, so reading it back would cost more than the
  // flood planes it was meant to replace.
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; } // beyond MAX_CELLS

  // Granary capacity grows with the tile's tenure — an old district holds deep
  // reserves, a fresh conquest holds none. Counted for every tilled tile,
  // including one whose crop has not come up yet.
  let capMilli = i32(round(FIELD_TILE_STORAGE_MILLI * tenureCurve(tenure[i])));
  atomicAdd(&capAccum[slot], capMilli);

  let maturity = maturity_in[i] / 1000.0; // AquaCrop canopy
  if (maturity <= 0.0) { return; }
  let soilN = crop[i] / 255.0; // FAO fertility ceiling
  let yieldMilli = i32(round(maturity * soilN * FIELD_TILE_YIELD_MILLI));
  atomicAdd(&prodAccum[slot], yieldMilli);
}
