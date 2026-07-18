// Ocean flood fill, step 0: seed the frontier at below-sea border tiles and
// at any below-sea tile the waterMask marks as sea (1). The mask is zero for
// procedural generation (border-only flood, the original behavior). Faithful
// runtime derivation bypasses the flood entirely (flags_from_mask); this
// path survives for the procedural generator.
import package::kernel::GRID;
import package::bindings::{P, elevation, waterMask, ocean_out};

fn tile(x: i32, y: i32, i: u32) {
  let border = x == 0 || y == 0 || x == i32(GRID.size.x) - 1 || y == i32(GRID.size.y) - 1;
  let seeded = border || waterMask[i] == 1u;
  ocean_out[i] = select(0u, 1u, seeded && elevation[i] <= P.seaLevel);
}
