// Humidity (precipitation + irrigation) and the Whittaker-ish biome pick,
// packed into flags bits 8..15. Real-base mode: humidity IS the shipped
// plane (already final — measured moisture on earth maps, the engine's own
// blend on generated ones), no re-blending.
import package::kernel::clamp01;
import package::bindings::{P, temperature, precipitation, irrigation_in, humidityBase, humidity, flags};

fn tile(x: i32, y: i32, i: u32) {
  if ((flags[i] & 1u) != 0u) {
    humidity[i] = 0.0;
    flags[i] = flags[i] & 3u;
    return;
  }
  let blended = clamp01(precipitation[i] * 0.68 + irrigation_in[i] * 0.55);
  let h = select(blended, humidityBase[i], P.useClimateBase > 0.5);
  humidity[i] = h;
  let t = temperature[i];
  var biome = 0u;
  if (P.iceThreshold > 0.0 && t < P.iceThreshold) {
    // Permanent ice (palette class 1) — the baked earth pipeline's rule
    // (land colder than iceTempC), keyed off the live temperature so the
    // ice line advances and retreats with the seasons.
    biome = 1u;
  } else if (t < 0.2) {
    biome = select(3u, 2u, h < 0.28);
  } else if (t < 0.38) {
    if (h < 0.25) { biome = 4u; } else if (h < 0.58) { biome = 5u; } else { biome = 6u; }
  } else if (t < 0.64) {
    if (h < 0.2) { biome = 7u; } else if (h < 0.5) { biome = 8u; } else { biome = 9u; }
  } else {
    if (h < 0.18) { biome = 7u; } else if (h < 0.46) { biome = 10u; } else if (h < 0.72) { biome = 11u; } else { biome = 12u; }
  }
  flags[i] = (flags[i] & 3u) | (biome << 8u);
}
