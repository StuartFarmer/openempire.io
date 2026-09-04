// The crop plane, COMPACTED — every tile that carries maturity, as a list.
//
// `farmTick` on the CPU walks the player's maturity map and rewrites it. To
// serve that from here the values have to come back, and the plane is 8 MB on
// spqr — most of it zero, since crop covers ~150k tiles of 2M.
//
// So this counts and packs instead: one atomic increment per living tile, its
// ref into one list and its milli-maturity into another. The reader copies back
// only as many entries as the counter says, which makes the transfer
// proportional to how much crop exists rather than to how large the map is —
// the distinction the readback requirement is actually about. On spqr at tick
// 9102 that is 154k entries, 1.2 MB, against 8 MB for the plane.
//
// Order is NOT meaningful: `atomicAdd` hands out slots in whatever order threads
// arrive. Every consumer of this list is a per-tile write, so that is fine — but
// anything that ever needs a canonical order must sort by tile ref, never rely
// on the position here.
import package::bindings::{owner, maturity_in, cropCount, cropTile, cropVal};

/** Capacity. Beyond this the surplus is dropped rather than corrupting the
 *  list, and the count still reports the true total so the CPU can tell. */
const CAP: u32 = 2097152u;

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  let m = maturity_in[i];
  if (m <= 0.0) { return; }
  let slot = atomicAdd(&cropCount[0], 1u);
  if (slot >= CAP) { return; }
  cropTile[slot] = i;
  cropVal[slot] = m;
}
