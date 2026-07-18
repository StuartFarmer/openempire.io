// Barnes-style iterative depression fill (GPU reformulation of the CPU's
// priority-flood drainage).
import package::kernel::{OFF, inBounds, refOf};
import package::bindings::{elevation, flags, fill_in, fill_out};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    fill_out[i] = fill_in[i];
    return;
  }
  var lowestNeighbor = 1e9;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    lowestNeighbor = min(lowestNeighbor, fill_in[refOf(n.x, n.y)]);
  }
  // The epsilon slopes filled flats toward their outlet so steepest-descent
  // flow routing never strands water in a flat (Barnes epsilon-fill).
  fill_out[i] = min(fill_in[i], max(elevation[i], lowestNeighbor + 2e-5));
}
