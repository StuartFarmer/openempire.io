// Steepest descent over the filled surface, hash tie-break so flats drain
// deterministically. Code 0..7 = OFF index the cell flows toward, 8 = pit.
import package::kernel::{OFF, inBounds, refOf, hash01};
import package::bindings::{P, fill_in, flags, dir};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    dir[i] = 8u;
    return;
  }
  var bestDir = 8u;
  var bestFill = fill_in[i];
  var bestTie = hash01(P.seed + 7919, x, y);
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    let nFill = fill_in[ni];
    let nTie = hash01(P.seed + 7919, n.x, n.y);
    if (nFill < bestFill || (nFill == bestFill && nTie < bestTie)) {
      bestDir = u32(k);
      bestFill = nFill;
      bestTie = nTie;
    }
  }
  dir[i] = bestDir;
}
