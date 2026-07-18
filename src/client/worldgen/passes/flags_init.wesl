// Pack the settled ocean mask into the flags layer (bit 0 = ocean; bit 1 =
// lake and bits 8..15 = biome arrive in later passes).
import package::bindings::{ocean_in, flags};

fn tile(x: i32, y: i32, i: u32) {
  flags[i] = select(0u, 1u, ocean_in[i] != 0u);
}
