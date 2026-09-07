// Gather formulation of the CPU flow accumulation: each pass extends the
// fixed point w(i) = precip(i) + retention * sum of upstream w(j) by one hop.
// OFF[7-k] == -OFF[k], so "neighbor j flows into me" is dir[j] == 7-k.
import package::kernel::{OFF, inBounds, refOf};
import package::bindings::{P, flags, precipitation, dir, water_in, water_out};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    water_out[i] = 0.0;
    return;
  }
  var inflow = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 1u) == 0u && dir[ni] == u32(7 - k)) {
      inflow += water_in[ni];
    }
  }
  water_out[i] = precipitation[i] + P.riverFlowRetention * inflow;
}
