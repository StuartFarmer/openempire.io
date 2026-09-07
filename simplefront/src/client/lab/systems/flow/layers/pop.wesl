// People, as a conserved fluid.
//
// This is the whole of LeanFront's population model: people live on tiles, are
// born where people already are, die where they are, and MOVE toward food and
// toward each other. Everything the old economy needed a food-shed Voronoi and
// labor pools for — "which farm does this tile's labor serve" — answers itself
// once people are somewhere in particular: a field is worked by whoever is
// standing on it.
//
// MOVEMENT IS EXACTLY CONSERVATIVE, in one pass. Updates are Jacobi (every read
// sees the previous tick), so a tile and its neighbour compute the SAME value
// for `outflow(a, b)` — a pure function of both tiles' previous state. So each
// tile can subtract what it sends and add what it receives in the same update,
// with no atomics and no push/gather split. Nothing is created or destroyed by
// moving.
//
// BIRTHS ARE SAMPLED, per tile. Picking a tile with probability pop/total and
// adding a person there is a multinomial draw; for a per-capita birth process it
// factorises into independent per-tile draws with identical marginals. So the
// parallel form of "sample a tile" is "every tile samples itself" — the same
// relationship the exponential race has to weighted picking. Stochastic rounding
// keeps it lumpy: a hamlet of three gets a whole person occasionally, rather
// than 0.3 of one continuously.
import package::params;
import package::layers;
import package::kernel::{inBounds, refOf};

/** Per-tick rate from a per-year one. Rates are stated per YEAR because a
 *  per-tick birth rate of 0.00077 displays as "0.00" and cannot be tuned. */
fn perTick(perYear: f32) -> f32 {
  return perYear / max(1.0, params::ticksPerYear());
}

/** One person's food for one tick, in person-years. */
fn ration() -> f32 {
  return perTick(1.0);
}

/** Deterministic per-tile uniform in [0,1) — the birth draw's randomness. */
fn hash01(t: u32, seed: u32) -> f32 {
  var h = t * 747796405u + seed * 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return f32(h) / 4294967296.0;
}

const FIELD: u32 = 1u;

/** Mean neighbour population — the agglomeration term. People are drawn to
 *  where people already are, which is what tethers settlement to towns without
 *  needing a distance-to-city field. */
fn neighbourPop(x: i32, y: i32) -> f32 {
  var sum = 0.0;
  var n = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (layers::land::val(j) == 0.0) { continue; }
    sum += layers::pop::val(j);
    n += 1.0;
  }
  if (n == 0.0) { return 0.0; }
  return sum / n;
}

/**
 * Desirability. POTENTIAL decides where people end up; MOBILITY (below) decides
 * only how fast they get there. Putting the town tether in potential means a
 * rich valley far from any town is never settled; putting it in mobility means
 * it fills slowly. Both are wanted, and they are different terms.
 */
/**
 * Desirability, with EVERY TERM NORMALISED TO 0..1.
 *
 * This matters more than the weights. `pop` is unbounded — hundreds on a town
 * tile — while `crop` and `field` are fractions, so a raw `wCrowd * pop` term
 * swamps a raw `wLand * crop` term by two orders of magnitude and NO weight
 * setting can make expansion win. The terms have to be commensurable before
 * tuning them means anything.
 *
 * So: food becomes DAYS OF FOOD against a target, crowding becomes a fraction
 * of a comfortable tile, and the town pull a fraction of a town-sized
 * neighbourhood. Then a weight of 1 means "this matters as much as that".
 */
fn potential(x: i32, y: i32, i: u32) -> f32 {
  let pop = layers::pop::val(i);
  // Days of food in hand, capped at the target — not stock. Attraction to raw
  // stock is self-reinforcing, because people produce food where they stand, so
  // the tile they are on is always the best-fed one and nobody ever leaves.
  let need = max(0.0001, pop * ration());
  let security = clamp(
    layers::food::val(i)
      / (need * params::foodYearsTarget() * params::ticksPerYear()),
    0.0, 1.0);
  // OPPORTUNITY: fertile ground nobody farms yet. This is the term that points
  // OUT of a settlement; at zero the model has no reason to take good land.
  let opportunity = layers::crop::val(i) * (1.0 - layers::field::val(i));
  let town = clamp(neighbourPop(x, y) / params::comfortablePop(), 0.0, 1.0);
  let crowd = clamp(pop / params::comfortablePop(), 0.0, 1.0);
  return params::wFood() * security
    + params::wLand() * opportunity
    + params::wTown() * town
    - params::wCrowd() * crowd;
}

/** How freely people move between two tiles: roads make it cheap. */
fn mobility(a: u32, b: u32) -> f32 {
  let road = 0.5 * (layers::road::val(a) + layers::road::val(b));
  return 1.0 + params::roadBoost() * road;
}

/** People moving a -> b this tick. PURE in both tiles' previous state, so both
 *  ends compute the same number and the exchange balances exactly. */
fn outflow(ax: i32, ay: i32, a: u32, bx: i32, by: i32, b: u32) -> f32 {
  if (layers::land::val(b) == 0.0) { return 0.0; }
  // NOBODY LIVES IN THE FIELDS. People spill onto wild ground — which then
  // becomes a town — but never onto ground committed to crops. This is the
  // exclusivity rule, enforced where it actually bites: at the move.
  if (layers::zone::val(b) == FIELD) { return 0.0; }
  let drive = potential(bx, by, b) - potential(ax, ay, a);
  if (drive <= 0.0) { return 0.0; }
  // Quarter share per neighbour, so total outflow can never exceed the tile.
  return 0.25 * perTick(params::migrationYr()) * layers::pop::val(a)
    * mobility(a, b) * clamp(drive, 0.0, 1.0);
}

/**
 * PIONEERS: the share who leave regardless of whether it looks better.
 *
 * Gradient migration alone can never start a second town. Births scatter onto
 * the frontier, find no food there — the town has all of it — and the gradient
 * pulls them straight home, so a settlement grows denser forever and never
 * wider. Someone has to go anyway.
 *
 * Weighted toward empty ground, because this is crowd-avoidance rather than
 * wanderlust, and it is the behaviour of a FRACTION of people, not of everyone.
 */
fn pioneers(ax: i32, ay: i32, a: u32, bx: i32, by: i32, b: u32) -> f32 {
  if (layers::land::val(b) == 0.0) { return 0.0; }
  if (layers::zone::val(b) == FIELD) { return 0.0; }
  let room = 1.0 - clamp(layers::pop::val(b) / params::comfortablePop(), 0.0, 1.0);
  return 0.25 * perTick(params::pioneerYr()) * layers::pop::val(a) * room;
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

/** Neighbours that can receive a birth — land, and not committed to crops. */
fn birthTargets(x: i32, y: i32) -> f32 {
  var n = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (layers::land::val(j) == 0.0) { continue; }
    if (layers::zone::val(j) == FIELD) { continue; }
    n += 1.0;
  }
  return n;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  if (layers::zone::val(i) == FIELD) { return 0.0; }
  var p = layers::pop::val(i);
  if (p <= 0.0) {
    // Still a valid destination — take arrivals even from an empty tile.
    p = 0.0;
  }

  // ── Migration, conservative.
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    p -= outflow(x, y, i, nx, ny, j) + pioneers(x, y, i, nx, ny, j);
    p += outflow(nx, ny, j, x, y, i) + pioneers(nx, ny, j, x, y, i);
  }

  // ── Births, sampled — and SPREAD.
  //
  // A child is not born on top of its parents. Births scatter around the people
  // who had them, so a settlement widens on its own instead of only stacking up
  // and waiting for crowding to push someone out. That is what makes growth look
  // like settlement rather than like a pile: with births landing only on the
  // parents' tile, the whole population sat on the seed tile forever
  // (peakPop == totalPop) because nothing reached the ground next door.
  //
  // Conservative by construction: every tile hands out the same fractions, so
  // what one tile scatters is exactly what its neighbours collect. `birthSpread`
  // is the share that lands off-tile — one standard deviation is about one
  // tile at this scale, which is what a 10 km plot means for where a family
  // settles.
  // Split over the neighbours that can actually RECEIVE a birth, and keep the
  // rest at home. Dividing by a flat four destroyed births whenever a
  // neighbour was field or water — and a town is ringed by its own fields, so
  // half of every birth vanished and the effective rate fell below the death
  // rate. The population held flat on a mountain of food and it looked like a
  // balance problem when it was leakage.
  let spread = params::birthSpread();
  let rate = perTick(params::birthRateYr());
  let mine = birthTargets(x, y);
  var born = p * rate * select(1.0, 1.0 - spread, mine > 0.0);
  var d2 = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d2[k].x;
    let ny = y + d2[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    let theirs = birthTargets(nx, ny);
    if (theirs <= 0.0) { continue; }
    born += layers::pop::val(j) * rate * spread / theirs;
  }
  // Stochastic rounding keeps them WHOLE people: below one expected birth a
  // hamlet gains one occasionally rather than a fraction continuously.
  let u = hash01(i, u32(params::tickSeed()));
  p += floor(born + u);

  // ── Deaths: old age always, hunger when the tile cannot feed itself.
  p -= p / max(1.0, params::lifespanYears() * params::ticksPerYear());
  let eat = p * ration();
  if (eat > 0.0) {
    let fed = clamp(layers::food::val(i) / eat, 0.0, 1.0);
    p -= p * perTick(params::starveRateYr()) * (1.0 - fed);
  }

  return max(0.0, p);
}
