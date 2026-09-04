// shared::palette — color-ramp helpers. Pure (values-as-args).
// (Noise/fbm/hash live in package::kernel, available to every system already.)

// Clamped linear blend between two colors.
fn lerp3(a: vec3f, b: vec3f, t: f32) -> vec3f {
  return mix(a, b, clamp(t, 0.0, 1.0));
}

// Sample a 3-stop ramp (low → mid → high) at t in 0..1.
fn ramp3(low: vec3f, mid: vec3f, high: vec3f, t: f32) -> vec3f {
  let u = clamp(t, 0.0, 1.0);
  return select(mix(mid, high, u * 2.0 - 1.0), mix(low, mid, u * 2.0), u < 0.5);
}

// Unpack the terrain base color from the `tint` field (rgb8 in the low 24 bits)
// to a 0..1 vec3 — the rendered world a game overlay composites over.
fn unpackTint(t: u32) -> vec3f {
  return vec3f(
    f32((t >> 16u) & 255u),
    f32((t >> 8u) & 255u),
    f32(t & 255u),
  ) / 255.0;
}
