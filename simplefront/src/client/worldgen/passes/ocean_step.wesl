// Ocean flood fill: one-step frontier propagation (4-neighbor, like the CPU
// BFS). Iterated max(width, height) times.
import package::kernel::GRID;
import package::bindings::{P, elevation, ocean_in, ocean_out};

fn tile(x: i32, y: i32, i: u32) {
  var ocean = ocean_in[i];
  if (ocean == 0u && elevation[i] <= P.seaLevel) {
    if ((x > 0 && ocean_in[i - 1u] != 0u) ||
        (x < i32(GRID.size.x) - 1 && ocean_in[i + 1u] != 0u) ||
        (y > 0 && ocean_in[i - GRID.size.x] != 0u) ||
        (y < i32(GRID.size.y) - 1 && ocean_in[i + GRID.size.x] != 0u)) {
      ocean = 1u;
    }
  }
  ocean_out[i] = ocean;
}
