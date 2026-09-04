// CLAIMED SPREAD TILES per district — the third acreage count in this pipeline,
// and it has to be its own because the other two answer different questions.
//
//   `acreAccum`  (farm_credit): tiles that DRIVE expansion — undamaged, staffed,
//                field by zone or by claim. Feeds the credit stream.
//   `acresAccum` (farm_acres):  tiles a district has COMMITTED — claimed
//                maturity alone, nuclei included, damage and staffing
//                irrelevant. Feeds `EconomyModel.committedStaffing`.
//   `claimAccum` (here):        the cell's FIELD — non-nucleus covered tiles
//                that are claimed crop or persistent Field zone. This is
//                `cellClaims` in `FoodShed.recompute`, and two things read it:
//                the labour spillover's `needOf(farm) = (1 + claims) x
//                farmersPerFieldTile`, and the coverage cut-off's `claims`.
//
// The nucleus exclusion is the part that looks like an oversight and is not.
// `recompute` builds `cellClaims` only for `!nuclei.has(tile)`, and `needOf`
// then adds the 1 back — so the nucleus is counted exactly once, as its own
// farmer's worth. Counting it here as well would inflate every district's need
// by one tile and quietly change who gets staffed.
//
// Integer accumulation, like every other reduction here: `atomicAdd` completes
// in nondeterministic order, so only an integer sum is a property of the SET.
import package::bindings::{owner, farmFlags, maturity_in, shedCell_in, cellSlot, claimAccum};

const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_NUCLEUS: u32 = 4u;
const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  let flags = farmFlags[i];
  // The nucleus holds no claim of its own — `needOf` adds it back as the +1.
  if ((flags & FLAG_NUCLEUS) != 0u) { return; }

  // "Claimed ground": ripe enough to count, OR a Field zone that senesced to
  // the floor and is still claimed — it needs labour to be re-tilled, so it
  // counts toward the field's size even below the maturity threshold.
  let claimed =
    maturity_in[i] >= CLAIM || (flags & FLAG_FIELD_ZONE) != 0u;
  if (!claimed) { return; }

  // Only tiles the shed actually REACHES are in a cell's field. A tile outside
  // every shed falls back to its own ref on the CPU, which is not a district.
  let cell = shedCell_in[i];
  if (cell == UNREACHED) { return; }
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; }

  atomicAdd(&claimAccum[slot], 1);
}
