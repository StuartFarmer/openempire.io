// The food shed's flood, COMPACTED — every covered tile with its distance and
// its cell, as a list.
//
// Same primitive as `maturity_compact`, and for the same reason. The two shed
// planes are 8 MB each on spqr, of which 535k tiles of 2M carry anything.
// Copying them whole costs 4.9 ms — affordable — but the seam that consumes
// them is PER PLAYER while the planes are merged across players, so somebody
// then has to partition them, and that is an O(grid) scan at 11.4 ms every
// time. Compacting here means the copy is proportional to the covered area and
// the CPU walks the list once instead of the map.
//
// Order is arbitrary (`atomicAdd` hands out slots as threads arrive). Every
// consumer of the flood's output is order-independent — per-tile writes,
// integer accumulation, or a sorted rank — which the shed provider's contract
// already states.
import package::bindings::{owner, shedDist_in, shedCell_in, shedCount, shedTileList, shedDistList, shedCellList};

const UNREACHED: u32 = 0xffffffffu;
/** Capacity; the surplus is dropped rather than corrupting the list, and the
 *  count still reports the true total so the CPU can tell it happened. */
const CAP: u32 = 2097152u;

fn tile(x: i32, y: i32, i: u32) {
  if (owner[i] == 0u) { return; }
  let d = shedDist_in[i];
  if (d == UNREACHED) { return; }
  let c = shedCell_in[i];
  if (c == UNREACHED) { return; }
  let slot = atomicAdd(&shedCount[0], 1u);
  if (slot >= CAP) { return; }
  shedTileList[slot] = i;
  shedDistList[slot] = d;
  shedCellList[slot] = c;
}
