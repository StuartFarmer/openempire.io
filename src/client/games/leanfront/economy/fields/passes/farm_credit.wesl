// The patch phase's CREDIT STREAM and ACREAGE, per district.
//
// A field earns the right to expand: each tick it banks its summed maturity as
// credit, and when the credit clears `fieldPatchCostMilli` — and the district has
// spare hands for one more tile — it places one plot. Both inputs are reductions
// over the district's field tiles, which is what this pass computes.
//
// The CPU sums over `fieldTilesByCell`, whose members are: tiles carrying a
// maturity entry, undamaged, field (claimed crop or persistent Field zone), and
// NOT fallow. It then filters that sum by `tilled || !ranked` — which is exactly
// "not fallow" again, so the condition is a no-op on the set it filters. One
// predicate is enough here.
//
// Integer accumulation, like the district ledger: `atomicAdd` completes in
// nondeterministic order, so a float sum would vary run to run on the SAME
// device — not a rounding difference, an unreproducible game.
import package::bindings::{owner, farmFlags, maturity_in, shedCell_in, cellSlot, driveAccum, acreAccum};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_FALLOW: u32 = 8u;
const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  let flags = farmFlags[i];
  // Battle-worn ground is frozen — it neither ripens nor contributes.
  if ((flags & FLAG_DAMAGED) != 0u) { return; }
  // Unstaffed ground is senescing, and does not drive expansion.
  if ((flags & FLAG_FALLOW) != 0u) { return; }
  let mMilli = maturity_in[i];
  if (mMilli <= 0.0) { return; } // no maturity entry on the CPU side
  let isField = mMilli >= CLAIM || (flags & FLAG_FIELD_ZONE) != 0u;
  if (!isField) { return; }

  var cell = shedCell_in[i];
  if (cell == UNREACHED) { cell = i; } // its own cell, outside the shed
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; } // beyond MAX_CELLS

  atomicAdd(&driveAccum[slot], i32(round(mMilli)));
  atomicAdd(&acreAccum[slot], 1);
}
