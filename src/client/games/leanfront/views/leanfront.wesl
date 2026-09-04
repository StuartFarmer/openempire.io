import package::kernel::{OFF, inBounds};
import package::params;
import package::layers;
import shared::palette::unpackTint;

const P1 = vec3f(0.86, 0.33, 0.33);
const P2 = vec3f(0.30, 0.59, 0.88);
const P3 = vec3f(0.35, 0.77, 0.44);
const P4 = vec3f(0.88, 0.72, 0.30);

fn playerColor(o: u32) -> vec3f {
  switch (o) {
    case 1u: { return P1; }
    case 2u: { return P2; }
    case 3u: { return P3; }
    default: { return P4; }
  }
}

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let base = unpackTint(layers::tint::val(i));
  let me = layers::owner::val(i);
  if (layers::land::val(i) == 0.0 || me == 0u) {
    return vec4f(base, 1.0);
  }
  var c = mix(base, playerColor(me), 0.4);
  let city = layers::cityLevel::val(i);
  let farm = layers::farmLevel::val(i);
  if (city != 0u) {
    let capacity = f32(city) * params::cityCapacityPerLevel();
    let fill = clamp(layers::troops::val(i) / max(capacity, 1e-6), 0.0, 1.0);
    c = mix(c, vec3f(1.0, 0.94, 0.78), 0.55 + 0.35 * fill);
  } else if (farm != 0u) {
    let capacity = f32(farm) * params::farmCapacityPerLevel();
    let fill = clamp(layers::food::val(i) / max(capacity, 1e-6), 0.0, 1.0);
    c = mix(c, vec3f(0.66, 0.72, 0.22), 0.5 + 0.4 * fill);
  }
  var contested = false;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (inBounds(n.x, n.y) && layers::owner::at(n.x, n.y) != me &&
        layers::owner::at(n.x, n.y) != 0u) {
      contested = true;
    }
  }
  if (contested) { c = mix(c, vec3f(1.0, 0.9, 0.7), 0.4); }
  return vec4f(c, 1.0);
}
