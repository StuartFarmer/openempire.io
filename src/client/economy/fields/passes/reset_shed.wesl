// Reset the shed derivation's two accumulators (design D1).
//
// Same reason as `reset_cells`, which is where these belong and cannot go: both
// are `atomicAdd` targets, so a fresh zeroed buffer makes a single-dispatch
// probe pass while a per-tick loop accumulates without bound — the failure that
// would have surfaced at the cutover and at no point before it.
//
// They are a separate pass because `reset_cells` is at nine storage buffers and
// this device's per-stage cap is ten; adding two more made eleven and the bind
// group would not build.
//
// `slotPeople` and `slotLabor` are deliberately NOT reset here. Every live slot
// is written outright by `shed_rural` and `shed_spill` rather than accumulated
// into, and a dead slot is never read because its `slotTile` is NO_TILE.
import package::bindings::{claimAccum, poolAccum, regionAdj};

/** Must match MAX_CELLS in system.ts. */
const CELLS: u32 = 16384u;
/** REGION_SLOTS x (REGION_SLOTS / 32) — the adjacency matrix, in words. Sized
 *  so a grid pass can clear it on the SMALLEST shipped map (pangea001, 256x256
 *  = 65,536 tiles); see shed_region.wesl for why the cap sits where it does. */
const ADJ_WORDS: u32 = 32768u;

fn tile(x: i32, y: i32, i: u32) {
  if (i < ADJ_WORDS) { regionAdj[i] = 0u; }
  if (i >= CELLS) { return; }
  claimAccum[i] = 0;
  poolAccum[i] = 0;
}
