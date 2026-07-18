// 256-bin land elevation histogram (atomic), feeding the quantile pass.
import package::kernel::clamp01;
import package::bindings::{elevation, flags, hist, G};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) { return; }
  let bin = min(u32(clamp01(elevation[i]) * 256.0), 255u);
  atomicAdd(&hist[bin], 1u);
  atomicAdd(&G.landCount, 1u);
}
