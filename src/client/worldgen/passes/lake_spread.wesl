// Grow lakes across their basin: depression tiles at (nearly) the same fill
// level as a lake neighbor join the lake. Iterated a fixed number of times.
import package::kernel::{OFF, inBounds, refOf};
import package::bindings::{P, elevation, fill_in, flags};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 3u) != 0u) { return; }
  if (fill_in[i] - elevation[i] <= P.lakeElevationRange) { return; }
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 2u) != 0u && abs(fill_in[ni] - fill_in[i]) <= 0.01) {
      flags[i] = flags[i] | 2u;
      return;
    }
  }
}
