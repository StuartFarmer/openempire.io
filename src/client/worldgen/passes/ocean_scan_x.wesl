// Ocean flood, separable row scan: the x==0 thread of each row sweeps it in
// both directions, carrying ocean through contiguous below-sea runs.
// Alternated with the column scan this converges in a few alternations
// instead of max(width, height) frontier steps — required at XL sizes where
// a capped per-tile frontier cannot reach the map interior.
import package::kernel::GRID;
import package::bindings::{P, elevation, ocean_in, ocean_out};

fn tile(x: i32, y: i32, i: u32) {
  if (x != 0) { return; }
  let w = i32(GRID.size.x);
  let row = u32(y) * GRID.size.x;
  var carry = 0u;
  for (var cx = 0; cx < w; cx += 1) {
    let ci = row + u32(cx);
    var o = ocean_in[ci];
    if (o == 0u && carry != 0u && elevation[ci] <= P.seaLevel) { o = 1u; }
    ocean_out[ci] = o;
    carry = o;
  }
  carry = 0u;
  for (var cx = w - 1; cx >= 0; cx -= 1) {
    let ci = row + u32(cx);
    var o = ocean_out[ci];
    if (o == 0u && carry != 0u && elevation[ci] <= P.seaLevel) {
      o = 1u;
      ocean_out[ci] = 1u;
    }
    carry = o;
  }
}
