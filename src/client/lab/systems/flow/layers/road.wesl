// Roads, worn in rather than built.
//
// The logistics network is a CONSEQUENCE of the economy, not a build menu: a
// tile carrying traffic gets easier to cross, and one that stops carrying it
// grows over. Whether that converges to a usable network or collapses to a
// single trunk (or to nothing) is set by the reinforcement/decay ratio — which
// is exactly the sort of thing that has to be tuned by watching it, and is why
// this system exists as a lab page before it is wired to a game.
//
// Traffic is estimated from the population gradient rather than measured from
// the flow pass: a tile between a crowded place and an empty one is a tile
// people are walking through.
import package::params;
import package::layers;
import package::kernel::{inBounds, refOf};

fn traffic(x: i32, y: i32, i: u32) -> f32 {
  var spread = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    spread += abs(layers::pop::val(j) - layers::pop::val(i));
  }
  return spread * layers::pop::val(i);
}

fn perTick(perYear: f32) -> f32 {
  return perYear / max(1.0, params::ticksPerYear());
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  var r = layers::road::val(i);
  r += perTick(params::roadWearYr()) * traffic(x, y, i) * 0.0001;
  r -= r * perTick(params::roadDecayYr());
  return clamp(r, 0.0, 1.0);
}
