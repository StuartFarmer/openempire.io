// LAND USE: wild, field, or urban. Discrete, exclusive, and permanent.
//
// This is the one discrete thing in an otherwise continuous model, and it is
// what makes land a resource you ALLOCATE rather than merely occupy. With a
// purely continuous field every tile farmed itself a little and there was no
// decision anywhere; with a zone, each tile is a commitment. The original game
// puts it plainly: "the scarcity of tiles is the strategy."
//
// PERMANENT, deliberately. Once a tile is city it is always city, once field
// always field — the original's rule, and it exists so two growth processes
// competing for the same ground cannot thrash it back and forth forever. A tile
// whose people leave becomes derelict, not wild.
//
// Promotion is the only event here. Everything downstream — population,
// cultivation, food, traffic — stays continuous and simply asks what the ground
// is for.
import package::params;
import package::layers;
import package::kernel::{inBounds, refOf};

const WILD: u32 = 0u;
const FIELD: u32 = 1u;
const URBAN: u32 = 2u;

/** Is any neighbour already worked? Fields grow OUT from a seed, so new ground
 *  must touch ground that is already field or city. */
fn touchesWorked(x: i32, y: i32) -> bool {
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    if (layers::zone::val(refOf(nx, ny)) != WILD) { return true; }
  }
  return false;
}

/** People in the towns next door — who would have to walk out and break it. */
fn neighbourTownPop(x: i32, y: i32) -> f32 {
  var p = 0.0;
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (layers::zone::val(j) == URBAN) { p += layers::pop::val(j); }
  }
  return p;
}

/**
 * Does a town next door still need room to grow into?
 *
 * Cities get first refusal on the ground beside them. Without this, fields
 * claimed every adjacent tile the moment a town existed and the town was walled
 * in by its own farmland — nobody may be born in a field, so a settlement could
 * never become more than one tile however much it grew. The original resolves
 * the same competition by letting whichever automaton claims ground first keep
 * it; this reserves the ground instead, which is the same idea aimed forward.
 */
fn townNeedsRoom(x: i32, y: i32) -> bool {
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (layers::zone::val(j) != URBAN) { continue; }
    if (layers::pop::val(j) > params::comfortablePop() * params::urbanReserve()) {
      return true;
    }
  }
  return false;
}

/** Is a town next door full enough to lay out more ground? */
fn townAtCapacity(x: i32, y: i32) -> bool {
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (layers::zone::val(j) != URBAN) { continue; }
    if (layers::pop::val(j) > params::comfortablePop() * params::urbanSpreadAt()) {
      return true;
    }
  }
  return false;
}

fn init(x: i32, y: i32, i: u32) -> u32 {
  return WILD;
}

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::land::val(i) == 0.0) { return WILD; }
  let z = layers::zone::val(i);
  if (z != WILD) { return z; } // permanent

  // THE TOWN GROWS FIRST, and people follow it — the original's order, and the
  // right one. A crowded town lays out ground beside it and settlers move in;
  // the reverse (wait for people to gather on wild land, then call it a town)
  // strands them: until the ground is zoned nobody there is housed, so a
  // frontier never formed however many pioneers drifted onto it.
  if (townAtCapacity(x, y)) { return URBAN; }

  // The SEED still works the other way, because a settlement has to start
  // somewhere: drop people on empty ground and the first tile becomes a town.
  if (layers::pop::val(i) > params::urbanThreshold()) { return URBAN; }

  // FIELDS are broken where a town's people can reach viable soil, outward from
  // ground already worked. A farm seed is just a tile painted FIELD; this is
  // how it spreads.
  if (layers::crop::val(i) > 0.0
      && neighbourTownPop(x, y) > params::labourToBreakGround()
      && touchesWorked(x, y)
      && !townNeedsRoom(x, y)) {
    return FIELD;
  }
  return WILD;
}
