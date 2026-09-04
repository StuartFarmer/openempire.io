// Food-shed flood, seed pass (GPU spike). Every mature-or-not Farmland tile of
// the subject player is a source at distance 0 carrying its OWN tile ref as the
// cell id; everything else starts unreached. Mirrors the CPU seeding loop in
// FoodShed.recompute, which seeds from `player.units(Farmland)` filtered by
// ownership — that filter is baked into the uploaded `farmMaturity` plane.
import package::bindings::{farmMaturity, shedDist_out, shedCell_out};

const UNREACHED: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  if (farmMaturity[i] > 0.0) {
    shedDist_out[i] = 0u;
    shedCell_out[i] = i;
    return;
  }
  shedDist_out[i] = UNREACHED;
  shedCell_out[i] = UNREACHED;
}
