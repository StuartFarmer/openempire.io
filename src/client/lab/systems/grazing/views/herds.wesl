// Herd density OVERLAY on the rendered terrain (add-games-on-terrain): the real
// world shows through (layers::tint), with herds a warm heat wash — so grazing
// reads as animals gathering on the green pasture the terrain provides.
import package::layers;
import shared::palette::unpackTint;

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let base = unpackTint(layers::tint::val(i));
  let herd = clamp(layers::herd::val(i), 0.0, 1.0);
  // Amber → white heat over the terrain, scaled by density.
  var c = mix(base, vec3f(0.95, 0.72, 0.28), herd * 0.85);
  c = mix(c, vec3f(1.0, 0.96, 0.85), clamp((herd - 0.7) * 2.0, 0.0, 1.0));
  return vec4f(c, 1.0);
}
