// Ocean flood, separable column scan — the y==0 thread of each column; see
// ocean_scan_x for the scheme.
import package::kernel::GRID;
import package::bindings::{P, elevation, ocean_in, ocean_out};

fn tile(x: i32, y: i32, i: u32) {
  if (y != 0) { return; }
  let h = i32(GRID.size.y);
  var carry = 0u;
  for (var cy = 0; cy < h; cy += 1) {
    let ci = u32(cy) * GRID.size.x + u32(x);
    var o = ocean_in[ci];
    if (o == 0u && carry != 0u && elevation[ci] <= P.seaLevel) { o = 1u; }
    ocean_out[ci] = o;
    carry = o;
  }
  carry = 0u;
  for (var cy = h - 1; cy >= 0; cy -= 1) {
    let ci = u32(cy) * GRID.size.x + u32(x);
    var o = ocean_out[ci];
    if (o == 0u && carry != 0u && elevation[ci] <= P.seaLevel) {
      o = 1u;
      ocean_out[ci] = 1u;
    }
    carry = o;
  }
}
