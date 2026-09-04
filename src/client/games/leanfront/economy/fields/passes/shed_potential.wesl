// The food shed's POTENTIAL field: how much fed-ness reaches each tile.
//
// `FoodShed.recompute` writes it as `srcMaturity x decay(dist)` — the maturity
// of the nearest farm, faded by how far away it is — and `foodShedPotential`
// reads it back gated on the tile belonging to that shed's owner. The flood
// here is already owner-gated, so a tile's cell and distance are its own
// player's by construction and the gate is just reachability.
//
// Split out from `city_weight` rather than folded into it for a dull reason
// that keeps recurring: WebGPU allows 8 storage buffers per stage, and the two
// together need ten. This one takes the three the flood produced; the consumer
// takes the result as one plane.
import package::bindings::{farmMaturity, shedCell_in, shedDist_in, potential};

const UNREACHED: u32 = 0xffffffffu;
const SHED_RADIUS: f32 = __FOOD_SHED_RADIUS__;
const SHED_POWER: f32 = __FOOD_SHED_POWER__;

/** 1 at the farm, 1/2 at the radius, falling as a power law — matching
 *  `foodShedDecay`, whose non-finite guard is this pass's UNREACHED check. */
fn shedDecay(d: u32) -> f32 {
  return 1.0 / (1.0 + pow(f32(d) / SHED_RADIUS, SHED_POWER));
}

fn tile(x: i32, y: i32, i: u32) {
  let d = shedDist_in[i];
  if (d == UNREACHED) {
    potential[i] = 0.0;
    return;
  }
  let cell = shedCell_in[i];
  if (cell == UNREACHED) {
    potential[i] = 0.0;
    return;
  }
  // `farmMaturity` is the SEED plane — nuclei only, already in units of 1
  // rather than milli, exactly as `srcMaturityOf` holds it.
  potential[i] = farmMaturity[cell] * shedDecay(d);
}
