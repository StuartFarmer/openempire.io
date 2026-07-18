// Flow accumulation, step 0: every land tile starts with its precipitation.
import package::bindings::{flags, precipitation, water_out};

fn tile(x: i32, y: i32, i: u32) {
  water_out[i] = select(precipitation[i], 0.0, (flags[i] & 1u) != 0u);
}
