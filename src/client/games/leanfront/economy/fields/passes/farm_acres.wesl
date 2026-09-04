// The COMMITTED-STAFFING acreage histogram, per district.
//
// `EconomyModel.committedStaffing` asks how many farmers each existing district
// has already spoken for, so the settlement planner never counts the same labour
// pool twice. Its only per-tile part is a histogram: how many CLAIMED tiles does
// each district hold. Everything after it — `min(peopleByFarm, (acres+1) x
// farmersPerFieldTile)` — is per-district arithmetic the CPU does on the
// readback.
//
// This is NOT the same reduction as `farm_credit`'s acreage, and folding them
// would be wrong. The credit stream counts the tiles that DRIVE expansion:
// undamaged, staffed, and field by zone OR by claim. This counts the tiles a
// district has COMMITTED: claimed maturity alone, damage and staffing
// irrelevant, because a scarred or unstaffed acre still needs the hands that
// work it. Two predicates over the same plane, and the labour ledger reads this
// one.
//
// Integer accumulation, like every other reduction here: `atomicAdd` completes
// in nondeterministic order, so only an integer sum is a property of the SET of
// tiles rather than of the order threads happened to finish in.
import package::bindings::{owner, maturity_in, shedCell_in, cellSlot, acresAccum};

const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  // `m < claim` on the CPU, over a map whose zero entries are deleted — so a
  // tile with no maturity at all fails the same test here.
  if (maturity_in[i] < CLAIM) { return; }

  var cell = shedCell_in[i];
  if (cell == UNREACHED) { cell = i; } // its own cell, outside the shed
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; } // beyond MAX_CELLS

  atomicAdd(&acresAccum[slot], 1);
}
