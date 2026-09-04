// The empire OVERLAY on the rendered terrain (add-games-on-terrain): the real
// world shows through (layers::tint is the terrain image), washed in each
// player's colour and brightened by population, with contested borders flaring.
// Neutral land is faintly greened by the carrying capacity (the opportunity map).
import package::kernel::{OFF, inBounds};
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
  let base = unpackTint(layers::tint::val(i)); // the rendered terrain
  if (layers::land::val(i) == 0.0) {
    return vec4f(base, 1.0); // sea shows as terrain
  }
  let me = layers::owner::val(i);
  if (me == 0u) {
    // Neutral: terrain, faintly greened by carrying capacity.
    let green = mix(base, vec3f(0.22, 0.45, 0.20),
      clamp(layers::potential::val(i), 0.0, 1.0) * 0.3);
    return vec4f(green, 1.0);
  }
  // Owned: wash the terrain in the player's colour; density strengthens the
  // wash and, at the cores, blows out toward white.
  var tint = playerColor(me);
  tint = mix(tint, vec3f(1.0, 0.98, 0.9),
    clamp((layers::pop::val(i) - 0.6) * 2.0, 0.0, 1.0));
  let strength = 0.4 + 0.4 * clamp(layers::pop::val(i) * 1.3, 0.0, 1.0);
  var c = mix(base, tint, strength);
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
    c = mix(c, vec3f(1.0, 0.9, 0.7), 0.4);
  }
  return vec4f(c, 1.0);
}
