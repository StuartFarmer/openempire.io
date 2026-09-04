// Military supply flood, relaxation step (GPU spike): the parallel form of
// SupplyField.recompute's multi-source BFS, run for EVERY player at once via
// the same `owner` gate the shed flood uses — supply never crosses a border,
// which for the CPU is "owned by THIS player" and here is "same owner as me".
//
// This flood carries only a distance, so its fixpoint (the minimum step
// distance to any source through own territory) is UNIQUE. There is no
// queue-order ambiguity to reproduce and no tie-break to choose: the parallel
// result is identical to the sequential one, tile for tile.
//
// Iterated `cutoff` = supplyRadius(10) × CUTOFF_RADII(3) = 30 times, one step
// of front per pass, matching the CPU's expansion cutoff.
import package::kernel::{inBounds, refOf};
import package::bindings::{owner, supplyDist_in, supplyDist_out};

const UNREACHED: u32 = 0xffffffffu;
const CUTOFF: u32 = 30u;

fn tile(x: i32, y: i32, i: u32) {
  var best = supplyDist_in[i];
  let mine = owner[i];
  // Only owned passable land is enterable; a source sits at 0 and keeps it.
  if (mine != 0u && best != 0u) {
    var d4 = array<vec2i, 4>(
      vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1),
    );
    for (var k = 0; k < 4; k += 1) {
      let nx = x + d4[k].x;
      let ny = y + d4[k].y;
      if (!inBounds(nx, ny)) { continue; }
      let ni = refOf(nx, ny);
      if (owner[ni] != mine) { continue; }
      let nd = supplyDist_in[ni];
      if (nd == UNREACHED) { continue; }
      let cand = nd + 1u;
      if (cand > CUTOFF) { continue; }
      best = min(best, cand);
    }
  }
  supplyDist_out[i] = best;
}
