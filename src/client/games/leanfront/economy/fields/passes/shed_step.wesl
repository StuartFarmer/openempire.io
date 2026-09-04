// Food-shed flood, relaxation step (GPU spike): the parallel form of the CPU's
// multi-source BFS, run for EVERY player at once.
//
// The CPU floods one player at a time over that player's own territory. A naive
// port would dispatch the whole map once per player — 40× the work for 40
// nations, i.e. worse than the CPU. Instead the `owner` plane gates
// propagation: a tile only relaxes from a neighbour under the SAME owner, so
// every nation's shed grows inside its own borders during one shared dispatch
// and the cost is set by map area, not by player count or territory size.
//
// `owner` holds the tile's owner smallID, already masked to owned + land +
// passable ground (0 = not floodable), so the gate is a single compare.
//
// The CPU BFS breaks ties by QUEUE ORDER — whichever flood reached the tile
// first. That is inherently sequential, so this uses the order-independent rule
// instead: at equal distance the LOWEST source tile ref wins. The fixpoint is
// then unique (min distance, then min source), identical on every run and every
// device. Where the two disagree is exactly the Voronoi seam between two farms
// equidistant from a tile.
//
// Iterated `cutoff` times: each pass advances the front one step, and the CPU
// stops expanding past `foodShedRadius * CUTOFF_RADII`.
import package::kernel::{inBounds, refOf};
import package::bindings::{owner, shedDist_in, shedCell_in, shedDist_out, shedCell_out};

const UNREACHED: u32 = 0xffffffffu;
const CUTOFF: u32 = 54u;

fn tile(x: i32, y: i32, i: u32) {
  var bestD = shedDist_in[i];
  var bestC = shedCell_in[i];
  let mine = owner[i];
  // Only floodable ground relaxes; a seed sits at distance 0 and keeps it.
  if (mine != 0u && bestD != 0u) {
    var d4 = array<vec2i, 4>(
      vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1),
    );
    for (var k = 0; k < 4; k += 1) {
      let nx = x + d4[k].x;
      let ny = y + d4[k].y;
      if (!inBounds(nx, ny)) { continue; }
      let ni = refOf(nx, ny);
      // A shed never crosses a border: the CPU's step predicate is "owned by
      // THIS player", which here is "same owner as me".
      if (owner[ni] != mine) { continue; }
      let nd = shedDist_in[ni];
      if (nd == UNREACHED) { continue; }
      let cand = nd + 1u;
      if (cand > CUTOFF) { continue; }
      let nc = shedCell_in[ni];
      if (cand < bestD || (cand == bestD && nc < bestC)) {
        bestD = cand;
        bestC = nc;
      }
    }
  }
  shedDist_out[i] = bestD;
  shedCell_out[i] = bestC;
}
