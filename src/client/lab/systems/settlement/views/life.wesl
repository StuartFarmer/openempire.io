// The living world at a glance: land in muted earth, water dark, standing
// crops greening the fertile ground, and population as a warm amber glow —
// so settlement reads as light gathering on the best farmland and receding
// from frozen or barren tiles.
import package::layers;

fn color(x: i32, y: i32, i: u32) -> vec4f {
  if (layers::land::val(i) == 0.0) {
    return vec4f(0.04, 0.07, 0.12, 0.0);
  }
  let base = vec3f(0.14, 0.13, 0.11);
  let crops = layers::crops::val(i);
  let pop = layers::pop::val(i);

  var c = mix(base, vec3f(0.24, 0.55, 0.22), clamp(crops, 0.0, 1.0));
  // Population glow: amber into near-white at the densest cores.
  c = mix(c, vec3f(0.95, 0.78, 0.35), clamp(pop * 1.4, 0.0, 1.0));
  c = mix(c, vec3f(1.0, 0.96, 0.85), clamp((pop - 0.6) * 2.0, 0.0, 1.0));
  return vec4f(c, 1.0);
}
