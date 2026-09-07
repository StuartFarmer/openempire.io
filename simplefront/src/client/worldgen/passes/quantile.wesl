// Scan the histogram for the 0.9 land quantile — the CPU engine's
// mountainThreshold, quantized to 1/256.
import package::bindings::{hist, G};

fn once() {
  if (G.landCount == 0u) {
    G.mountainThreshold = 1.0;
    return;
  }
  let rank = u32(floor(f32(G.landCount - 1u) * 0.9));
  var cumulative = 0u;
  var bin = 255u;
  for (var b = 0u; b < 256u; b += 1u) {
    cumulative += hist[b];
    if (cumulative > rank) {
      bin = b;
      break;
    }
  }
  G.mountainThreshold = (f32(bin) + 0.5) / 256.0;
}
