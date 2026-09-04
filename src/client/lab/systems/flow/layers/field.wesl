// CULTIVATION: how much of a field tile is under the plough.
//
// Worked by people from the towns NEXT DOOR, and this is where labour is
// conserved. A town's workforce is DIVIDED among the field tiles it touches —
// a worker commutes to one field, not to all of them at once.
//
// The previous version diffused labour as a halo, which let the same worker be
// "available" on every tile within reach simultaneously: 908 people ended up
// farming 75,000 hectares, 82 ha each against the 3 ha/farmer the whole model
// is derived from. Dividing at the source fixes it exactly, and both ends can
// compute the same share, so nothing is created or lost.
//
// Reach is one tile, deliberately. Roads do not extend it — a road moves FOOD,
// not workers, because what limits a road is how much grain a person can carry
// down it. That is `linkCapacity` in food.wesl, and it is where distance costs
// something.
import package::params;
import package::layers;
import package::kernel::{inBounds, refOf};

const FIELD: u32 = 1u;
const URBAN: u32 = 2u;

fn perTick(perYear: f32) -> f32 {
  return perYear / max(1.0, params::ticksPerYear());
}

/** Field tiles these people send workers to — the denominator of their share. */
fn fieldsServed(x: i32, y: i32) -> f32 {
  var n = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    if (layers::zone::val(refOf(nx, ny)) == FIELD) { n += 1.0; }
  }
  return n;
}

/** Workers arriving here from the towns around it. */
fn workers(x: i32, y: i32) -> f32 {
  var w = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    // ANYONE not standing in a field can work one. Restricting labour to URBAN
    // tiles made settlers on unzoned ground economically inert — unable to work
    // the field beside them, producing nothing, living on imported food until
    // enough of them gathered to cross `urbanThreshold`. Zone says what the LAND
    // is for; whether a person can walk to a field is about the person.
    if (layers::zone::val(j) == FIELD) { continue; }
    let served = fieldsServed(nx, ny);
    if (served <= 0.0) { continue; }
    w += layers::pop::val(j) * params::workforceFraction() / served;
  }
  return w;
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::zone::val(i) != FIELD) { return 0.0; }
  var m = layers::field::val(i);

  // A tile is 10,000 ha and a farmer works three, so the hands that turn up
  // decide how much of it is broken. Soil decides what it YIELDS, not how much
  // can be worked — folding fertility in here would make poor land unfarmable
  // rather than merely poor.
  var ceiling = clamp(
    workers(x, y) * params::hectaresPerFarmer()
      / max(1.0, params::hectaresPerTile()),
    0.0, 1.0);
  if (layers::crop::val(i) <= 0.0) { ceiling = 0.0; }

  if (m < ceiling) {
    m += perTick(params::fieldGrowYr()) * (ceiling - m);
  } else {
    m -= (m - ceiling) * perTick(params::fieldDecayYr());
  }
  return clamp(m, 0.0, 1.0);
}
