// REGION ADJACENCY: which districts' floods TOUCH.
//
// Cells whose floods meet share food — the design's locality bound is the shed
// CUTOFF, not the Voronoi seam, so a metro eats from every farm within reach
// while a region beyond the flood starves alone. The CPU gets this from the
// flood's own "these two waves met" test and unions the pair on the spot; the
// supplied path recovers the same relation from "adjacent tiles in different
// cells", which is the condition transcribed here.
//
// WHAT CROSSES BACK IS A BIT MATRIX, NOT A PAIR LIST, and that is the whole
// design of this pass. Emitting one entry per boundary TILE would be correct —
// union-find does not care about duplicates, `union` is idempotent — but the
// list length is the total length of every Voronoi seam on the board, which
// grows with map area. A pair list is therefore not flat in map size and fails
// the readback requirement. Deduplicating into `slots x slots` bits makes what
// crosses a function of how many DISTRICTS exist, which is the property that
// was actually asked for.
//
// The union-find itself stays on the host, over ~600 nodes. 600 is not
// territory, and a sequential algorithm over it costs nothing worth moving.
//
// THE CAP IS REAL AND IS NOT MAX_CELLS. The matrix is `REGION_SLOTS^2` bits and
// has to be cleared by a grid pass, so it cannot exceed the smallest shipped
// map — pangea001 at 256x256 = 65,536 tiles. 1024 slots is 32,768 words, which
// fits; 2048 would need 131,072 and would not. Against a MEASURED peak of 617
// districts at full conquest on spqr that is 1.66x headroom, which is thinner
// than the 26x `MAX_CELLS` carries, so the probe REPORTS saturation rather than
// letting it pass silently. A district beyond the cap becomes its own region —
// degraded, not corrupted. Lifting it is cheap if it is ever needed: adjacency
// only ever links districts of the SAME player (a shed never crosses a border,
// so a neighbour in another player's territory is skipped below), and per-player
// district counts peak at 41, so a per-player local numbering would fit the
// same matrix many times over.
import package::kernel::{inBounds, refOf};
import package::bindings::{owner, shedCell_in, cellSlot, regionAdj};

const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
/** Districts this matrix can represent. Must match REGION_SLOTS in system.ts. */
const RSLOTS: u32 = 1024u;
/** RSLOTS / 32 — u32 words per row. */
const RWORDS: u32 = 32u;

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  let cell = shedCell_in[i];
  if (cell == UNREACHED) { return; }
  let a = cellSlot[cell];
  if (a == NO_SLOT || a >= RSLOTS) { return; }

  var d4 = array<vec2i, 4>(
    vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1),
  );
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d4[k].x;
    let ny = y + d4[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let ni = refOf(nx, ny);
    // A shed never crosses a border, so the CPU's `stamp[n] == run` test is
    // "covered AND mine" here. Without the owner check two players' cells would
    // union across a front line and share a granary.
    if (owner[ni] != mine) { continue; }
    let nc = shedCell_in[ni];
    if (nc == UNREACHED) { continue; }
    if (nc == cell) { continue; }
    let b = cellSlot[nc];
    if (b == NO_SLOT || b >= RSLOTS) { continue; }
    // Both directions, because the host reads rows independently and an
    // undirected edge recorded once would be missed from the other side.
    atomicOr(&regionAdj[a * RWORDS + (b >> 5u)], 1u << (b & 31u));
  }
}
