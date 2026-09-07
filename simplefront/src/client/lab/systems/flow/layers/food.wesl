// Food: grown by the people standing on fertile ground, eaten where they are,
// carried toward the hungry, and lost if it is neither.
//
// SURPLUS IS NOT BANKED. There is no granary, no capacity, no stock — food that
// is not eaten decays away. That is a deliberate absence: storage returns later
// as a MECHANIC (a building that lengthens the timer) rather than as ambient
// bookkeeping, and its absence is what makes a bad season legible instead of
// silently absorbed.
//
// The work ceiling is DERIVED, not chosen. One tile is 100 km^2 = 10,000
// hectares, and a pre-modern farmer works a few hectares, so the tile saturates
// at hectares/hectaresPerFarmer workers. A later technology that raises
// hectares-per-farmer raises the ceiling with no new knob.
import package::params;
import package::layers;
import package::kernel::{inBounds, refOf};

fn perTick(perYear: f32) -> f32 {
  return perYear / max(1.0, params::ticksPerYear());
}

/** Workers a tile can absorb before another must be planted. */
fn workCeiling() -> f32 {
  return params::hectaresPerTile() / max(0.01, params::hectaresPerFarmer());
}

/** One person's food for one tick. Food is measured in PERSON-YEARS, so this
 *  is simply one year divided by the tick rate. */
fn ration() -> f32 {
  return perTick(1.0);
}

/** How hungry a tile is — the gradient food runs down. People live in towns, so
 *  this is what pulls the harvest back off the land. */
fn hunger(i: u32) -> f32 {
  let need = layers::pop::val(i) * ration();
  return max(0.0, need - layers::food::val(i));
}

fn mobility(a: u32, b: u32) -> f32 {
  let road = 0.5 * (layers::road::val(a) + layers::road::val(b));
  return 1.0 + params::roadBoost() * road;
}

/**
 * Food moving a -> b, limited by CAPACITY as well as by rate.
 *
 * Two separate limits, and the first one was missing:
 *
 * CONSERVATION. The per-link share is capped at a quarter of the stock, because
 * a tile has four neighbours and may not send out more than it holds. Without
 * that cap the rate reached 2.3x the stock, the tile went negative, `max(0, f)`
 * clamped it back to zero — and the neighbours kept everything they had been
 * "sent". The clamp was manufacturing food, which is why the stock settled at an
 * impossible 433,000 against a production of ~60/tick.
 *
 * BANDWIDTH. A link also carries only so much per tick, in absolute units — the
 * road's cross-section, not a fraction of what happens to be sitting there. This
 * is what makes distance cost something: a rich hinterland on a dirt track
 * cannot get its harvest to town before it spoils, so the surplus is simply
 * lost. Roads raise the cross-section, and a later technology raises it again.
 *
 * Both ends compute this identically from the previous tick's state, so the
 * exchange still balances exactly.
 */
fn outflow(a: u32, b: u32) -> f32 {
  if (layers::land::val(b) == 0.0) { return 0.0; }
  let drive = hunger(b) - hunger(a);
  if (drive <= 0.0) { return 0.0; }
  // Never more than a quarter of the stock per link — four links, one stock.
  let share = min(0.25,
    0.25 * perTick(params::migrationYr()) * params::foodFlowRatio());
  let wanted = share * layers::food::val(a) * clamp(drive * 100.0, 0.0, 1.0);
  let capacity = params::linkCapacity() * mobility(a, b);
  return min(wanted, capacity);
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  var f = layers::food::val(i);

  // ── Production: CULTIVATED AREA times yield density.
  //
  // NOT from people standing here. Under zoning nobody lives in the fields —
  // they walk out from the towns — so a field tile's population is zero by
  // construction, and any formula keyed on it produces exactly nothing. That is
  // what silently emptied the whole chain: labour arrived, ground was broken,
  // cultivation rose, and no food appeared.
  //
  // `field` is already the fraction under the plough, capped by the labour that
  // reached here, so the yield follows from area alone: one farmer works
  // `hectaresPerFarmer` and feeds `farmerFeedsPeople` on full soil, which makes
  // the yield per hectare-year the ratio of the two. Soil scales it.
  let cultivated = layers::field::val(i) * params::hectaresPerTile();
  let perHectareYear =
    params::farmerFeedsPeople() / max(0.01, params::hectaresPerFarmer());
  f += cultivated * perHectareYear * layers::crop::val(i) * ration();

  // ── Consumption.
  f -= min(f, layers::pop::val(i) * ration());

  // ── Transport toward the hungry.
  var d = array<vec2i, 4>(vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1));
  for (var k = 0; k < 4; k += 1) {
    let nx = x + d[k].x;
    let ny = y + d[k].y;
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    f -= outflow(i, j);
    f += outflow(j, i);
  }

  // ── Spoilage. Everything left over goes eventually.
  f -= f * perTick(params::foodSpoilYr());
  return max(0.0, f);
}
