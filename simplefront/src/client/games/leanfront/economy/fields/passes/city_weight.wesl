// The CITY DRAW'S WEIGHT — the `suit` map of `UrbanGrowth.addCityTiles`, as a
// plane.
//
// This is not the same thing as `suitability.wesl`, and the difference is why
// `urban_pick` was never more than distributionally right. `suitability` is the
// BASE term (fertility, water, shore, logistics, minus congestion); the draw's
// actual weight is that base times a FOOD-SHED GATE, so a city grows toward
// land its farms can feed and nowhere else. Weighting by the ungated base picks
// from a different pool with different probabilities — a plausible city, not
// the CPU's city.
//
// Eligibility mirrors the CPU's loop, which walks `supply.dist` and filters:
// reachable, owned, not already a city tile, not field ground by claim or by
// persistent zone or by standing nucleus, undamaged, positively suitable, and
// positively gated. Ownership needs no test of its own — `suitability` is zero
// on unowned tiles, and one player's supply flood never reaches another's land.
import package::bindings::{density, farmFlags, maturity_in, suitability, potential, supplyDist_in, cityWeight};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_NUCLEUS: u32 = 4u;
const UNREACHED: u32 = 0xffffffffu;
const POP_PER_DENSITY: f32 = __POP_PER_DENSITY__;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;
const W_FOOD_SHED: f32 = __W_FOOD_SHED__;

fn tile(x: i32, y: i32, i: u32) {
  cityWeight[i] = 0.0;
  // The CPU iterates the supply field itself, so being out of logistical reach
  // is the first predicate, not an afterthought.
  if (supplyDist_in[i] == UNREACHED) { return; }
  if (density[i] >= POP_PER_DENSITY) { return; }   // already a city tile
  let flags = farmFlags[i];
  // First claim holds, and once field always field: a claimed tile, a tile
  // carrying the persistent Field zone, and a standing Farmland nucleus are all
  // food ground the city grows around rather than paves.
  if (maturity_in[i] >= CLAIM) { return; }
  if ((flags & (FLAG_FIELD_ZONE | FLAG_NUCLEUS)) != 0u) { return; }
  if ((flags & FLAG_DAMAGED) != 0u) { return; }    // the city grows around scars

  let base = suitability[i];
  if (base <= 0.0) { return; }
  let gate = min(1.0, W_FOOD_SHED * potential[i]);
  let sp = base * gate;
  if (sp <= 0.0) { return; }
  cityWeight[i] = sp;
}
