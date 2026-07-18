// The map as an empire: neutral land in muted earth (greener where the
// carrying capacity is high, so the opportunity map shows through), each
// player's territory washed in their colour and brightened by population
// density, with contested borders flaring toward white.
import package::kernel::{OFF, inBounds};
import package::layers;

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
  if (layers::land::val(i) == 0.0) {
    return vec4f(0.04, 0.07, 0.12, 0.0);
  }
  let me = layers::owner::val(i);
  if (me == 0u) {
    // Neutral: earth tinted green by carrying capacity — the opportunity map.
    let c = mix(vec3f(0.16, 0.15, 0.12), vec3f(0.22, 0.42, 0.20),
      clamp(layers::potential::val(i), 0.0, 1.0));
    return vec4f(c, 1.0);
  }
  var c = playerColor(me);
  // Darken empty land, brighten dense population.
  c = mix(c * 0.45, c, clamp(layers::pop::val(i) * 1.3, 0.0, 1.0));
  c = mix(c, vec3f(1.0, 0.98, 0.9), clamp((layers::pop::val(i) - 0.7) * 2.0, 0.0, 1.0));
  // Border flare where a differently-owned neighbour presses.
  var contested = false;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (inBounds(n.x, n.y) && layers::owner::at(n.x, n.y) != me &&
        layers::owner::at(n.x, n.y) != 0u) {
      contested = true;
    }
  }
  if (contested) {
    c = mix(c, vec3f(1.0, 0.9, 0.7), 0.35);
  }
  return vec4f(c, 1.0);
}
