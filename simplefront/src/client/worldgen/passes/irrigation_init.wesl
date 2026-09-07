// Irrigation, step 0: the normalized watermap (land max = 1).
import package::kernel::clamp01;
import package::bindings::{flags, water_in, G, irrigation_out};

fn irrigationSource(i: u32) -> f32 {
  if ((flags[i] & 1u) != 0u) { return 0.0; }
  let waterMax = bitcast<f32>(G.waterMaxBits);
  if (waterMax <= 0.0) { return 0.0; }
  return clamp01(water_in[i] / waterMax);
}

fn tile(x: i32, y: i32, i: u32) {
  irrigation_out[i] = irrigationSource(i);
}
