// The living world OVERLAY on the rendered terrain (add-games-on-terrain): the
// real world shows through (layers::tint), standing crops deepen the fertile
// ground green, and population glows amber → white at the dense cores — so
// settlement reads as light gathering on the best farmland.
import package::layers;
import shared::palette::unpackTint;

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let base = unpackTint(layers::tint::val(i)); // the rendered terrain
  if (layers::land::val(i) == 0.0) {
    return vec4f(base, 1.0); // sea shows as terrain
  }
  let crops = layers::crops::val(i);
  let pop = layers::pop::val(i);

  // Crops deepen the ground toward a lush green over the terrain.
  var c = mix(base, vec3f(0.24, 0.55, 0.22), clamp(crops, 0.0, 1.0) * 0.7);
  // Population glow: amber into near-white at the densest cores.
  c = mix(c, vec3f(0.95, 0.78, 0.35), clamp(pop * 1.4, 0.0, 1.0));
  c = mix(c, vec3f(1.0, 0.96, 0.85), clamp((pop - 0.6) * 2.0, 0.0, 1.0));
  return vec4f(c, 1.0);
}
