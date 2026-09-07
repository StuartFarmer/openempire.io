import package::kernel::clamp01;
import package::bindings::{water_in, G, waterNormalized};

fn tile(x: i32, y: i32, i: u32) {
  let waterMax = bitcast<f32>(G.waterMaxBits);
  waterNormalized[i] = select(
    0.0,
    clamp01(water_in[i] / waterMax),
    waterMax > 0.0,
  );
}
