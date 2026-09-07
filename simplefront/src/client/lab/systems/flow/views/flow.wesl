// What the model is doing, made legible.
//
// The rendered terrain shows through, so settlement can be read against the land
// it is responding to. Over it, two alpha gradients that are hard to confuse:
//
//   FARMLAND   dark green, deepening with how much of the tile is under the
//              plough. Committed ground shows faintly even before it is worked,
//              so a young field is visible rather than invisible.
//   PEOPLE     light blue, brightening with density from hamlet to city.
//
// Deliberately different hues rather than shades of one: the whole question when
// watching this is where farmland is versus where people are, and a green-to-
// yellow ramp made those two the same colour at the boundary.
import package::layers;
import package::params;
import shared::palette::unpackTint;

const FIELD: u32 = 1u;

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let terrain = unpackTint(layers::tint::val(i));
  if (layers::land::val(i) == 0.0) { return vec4f(terrain, 1.0); }
  var c = terrain;

  // ── FARMLAND: dark green, alpha by cultivation.
  if (layers::zone::val(i) == FIELD) {
    let worked = clamp(layers::field::val(i), 0.0, 1.0);
    c = mix(c, vec3f(0.06, 0.28, 0.09), 0.25 + 0.65 * worked);
  }

  // ── ROADS.
  c = mix(c, vec3f(0.62, 0.56, 0.44), clamp(layers::road::val(i), 0.0, 0.6));

  // ── PEOPLE: light blue, alpha by density against a comfortable town.
  let pop = layers::pop::val(i);
  if (pop > 0.0) {
    let full = max(1.0, params::comfortablePop());
    // Log so a hamlet is visible at all next to a city two orders larger.
    let a = clamp(log(1.0 + pop) / log(1.0 + full), 0.0, 1.0);
    c = mix(c, vec3f(0.55, 0.80, 1.0), 0.20 + 0.75 * a);
  }
  return vec4f(c, 1.0);
}
