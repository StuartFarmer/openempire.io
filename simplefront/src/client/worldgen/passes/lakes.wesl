// Lake seeds: depression tiles (fill above ground) holding enough water.
import package::bindings::{P, elevation, fill_in, water_in, flags};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  if (fill_in[i] - elevation[i] <= P.lakeElevationRange) { return; }
  if (water_in[i] > P.lakeWaterThreshold) {
    flags[i] = flags[i] | 2u;
  }
}
