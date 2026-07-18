// Depression fill, step 0: ocean anchors at min(elevation, sea level), land
// starts unfilled (infinity).
import package::bindings::{P, elevation, flags, fill_out};

fn tile(x: i32, y: i32, i: u32) {
  fill_out[i] = select(1e9, min(elevation[i], P.seaLevel), (flags[i] & 1u) != 0u);
}
