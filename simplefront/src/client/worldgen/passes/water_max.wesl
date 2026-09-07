// Land watermap maximum for normalization. Non-negative floats compare
// correctly as u32 bit patterns.
import package::bindings::{flags, water_in, G};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  atomicMax(&G.waterMaxBits, bitcast<u32>(max(water_in[i], 0.0)));
}
