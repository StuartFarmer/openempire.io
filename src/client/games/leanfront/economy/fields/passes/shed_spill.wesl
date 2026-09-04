// LABOUR SPILLOVER: a dense core holds far more people than its nearest field
// needs, so the excess walks to the under-staffed fields of the same shed
// network. Locality still rules — this only stops one Voronoi cell from
// hoarding workers three fields could use.
//
// ONE THREAD PER PLAYER, walking that player's district slots. This is the one
// genuinely SEQUENTIAL step in the derivation, and it is here rather than on the
// host for an ordering reason: its output is the pool the coverage cut-off
// reads (`slots = floor(pool / farmersPerFieldTile) - 1`). Leaving it behind
// would put a host step between two device passes and force the dispatch to
// split — pool, read back, spill, upload, cover — a round trip every tick to
// avoid writing this file.
//
// It is cheap because "sequential" means sequential across a player's own
// DISTRICTS, not across tiles: ~600 slots board-wide at full conquest, against
// the ~555,000 covered tiles the passes before it touch. Two walks of the slot
// list per player is nothing beside one flood.
//
// THE ORDER IS A FUNCTION OF THE BOARD, which is what makes this reproducible.
// The CPU sorts its hungry cells by tile ref before handing out the surplus;
// slots are numbered in ascending tile order (parent D4), so walking slot
// indices ascending IS that order, without a sort and without depending on
// which thread arrives first.
import package::bindings::{slotTile, owner, poolAccum, claimAccum, slotLabor, slotCount};

/** Must match the 256 in system.ts. */
const PLAYERS: u32 = 256u;
const NO_TILE: u32 = 0xffffffffu;
const PER_FIELD: i32 = __FARMERS_PER_FIELD_TILE__;

/** `(1 + claimed tiles) x farmersPerFieldTile` — the nucleus is the +1. */
fn needOf(s: u32) -> i32 {
  return (1 + claimAccum[s]) * PER_FIELD;
}

fn tile(x: i32, y: i32, i: u32) {
  if (i >= PLAYERS) { return; }
  let me = i;
  if (me == 0u) { return; } // 0 is unowned, not a player

  let n = min(slotCount[0], 16384u);

  // CAP, and total what the caps freed. Every slot is written here — including
  // the ones with no surplus — so `slotLabor` is complete before the second
  // walk reads it, and a district that never spills still has a value.
  var surplus: i32 = 0;
  for (var s: u32 = 0u; s < n; s = s + 1u) {
    let t = slotTile[s];
    if (t == NO_TILE) { continue; }
    if (owner[t] != me) { continue; }
    let need = needOf(s);
    let pool = poolAccum[s];
    if (pool > need) {
      surplus = surplus + (pool - need);
      slotLabor[s] = need;
    } else {
      slotLabor[s] = pool;
    }
  }

  // HAND OUT, in ascending slot order, until it runs out. A district takes only
  // what closes its own gap, so the surplus reaches as many fields as it can
  // rather than filling the first one to overflowing.
  if (surplus <= 0) { return; }
  for (var s: u32 = 0u; s < n; s = s + 1u) {
    if (surplus <= 0) { break; }
    let t = slotTile[s];
    if (t == NO_TILE) { continue; }
    if (owner[t] != me) { continue; }
    let need = needOf(s);
    let pool = slotLabor[s];
    if (pool >= need) { continue; }
    let take = min(need - pool, surplus);
    slotLabor[s] = pool + take;
    surplus = surplus - take;
  }
}
