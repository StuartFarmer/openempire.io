// Irrigation diffusion (exact port of the CPU's 8-pass weighted blur; the
// source term keeps rivers at full strength).
import package::kernel::{OFF, inBounds, refOf, clamp01};
import package::bindings::{flags, water_in, G, irrigation_in, irrigation_out};

fn irrigationSource(i: u32) -> f32 {
  if ((flags[i] & 1u) != 0u) { return 0.0; }
  let waterMax = bitcast<f32>(G.waterMaxBits);
  if (waterMax <= 0.0) { return 0.0; }
  return clamp01(water_in[i] / waterMax);
}

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    irrigation_out[i] = 0.0;
    return;
  }
  var total = irrigation_in[i] * 1.8;
  var weight = 1.8;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let ni = refOf(n.x, n.y);
    if ((flags[ni] & 1u) != 0u) { continue; }
    total += irrigation_in[ni] * 0.72;
    weight += 0.72;
  }
  irrigation_out[i] = max(irrigationSource(i), total / weight);
}
