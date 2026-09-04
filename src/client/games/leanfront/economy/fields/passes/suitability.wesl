// Urban suitability — the first CONSUMER of the resident fields, and the test
// that decides whether the economy can move to the GPU at all.
//
// The hybrid port died on readback: handing the CPU its Map<TileRef, number>
// back cost more than the CPU's own BFS. The way out is for the things that
// READ a field to run beside it, never copying it to the CPU. This pass is that
// shape — it consumes `supplyDist` straight out of the flood that produced it,
// one dispatch earlier, and writes a plane the placement step can also consume
// on the GPU.
//
// Mirrors UrbanGrowth.urbanSuitability exactly:
//   s = wFood·cropN + wWater·(waterN + wShore·shore) + wLogi·supplyQ − wCong·localDensity
//
// `localDensity` is the 4-neighbour average of THIS player's density. Density is
// per-player on the CPU, so a neighbour owned by someone else contributes 0 —
// reproduced here by gating on `owner[n] == owner[i]`. The divisor is the count
// of IN-BOUNDS neighbours (what `map.neighbors4` returns), not always 4.
import package::kernel::{inBounds, refOf};
import package::bindings::{owner, crop, water, shore, density, supplyDist_in, suitability, suitZero};

const UNREACHED: u32 = 0xffffffffu;
const W_FOOD: f32 = __W_FOOD__;
const W_WATER: f32 = __W_WATER__;
const W_SHORE: f32 = __W_SHORE__;
const W_LOGI: f32 = __W_LOGI__;
const W_CONG: f32 = __W_CONG__;
const SUPPLY_RADIUS: f32 = __SUPPLY_RADIUS__;
const SUPPLY_DECAY_POWER: f32 = __SUPPLY_DECAY_POWER__;
const POP_PER_DENSITY: f32 = __POP_PER_DENSITY__;

// supplyQualityFromDistance: 1 at a node, 0.5 at the radius, 0 out of supply.
fn supplyQ(d: u32) -> f32 {
  if (d == UNREACHED) { return 0.0; }
  return 1.0 / (1.0 + pow(f32(d) / SUPPLY_RADIUS, SUPPLY_DECAY_POWER));
}

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) {
    suitability[i] = 0.0;
    suitZero[i] = 0.0;
    return;
  }
  var sum = 0.0;
  var k = 0.0;
  var d4 = array<vec2i, 4>(
    vec2i(0, -1), vec2i(-1, 0), vec2i(1, 0), vec2i(0, 1),
  );
  for (var j = 0; j < 4; j += 1) {
    let nx = x + d4[j].x;
    let ny = y + d4[j].y;
    if (!inBounds(nx, ny)) { continue; }
    k += 1.0;
    let ni = refOf(nx, ny);
    if (owner[ni] == mine) {
      sum += density[ni] / POP_PER_DENSITY;
    }
  }
  var localDensity = 0.0;
  if (k > 0.0) { localDensity = sum / k; }

  let cropN = crop[i] / 255.0;
  let waterN = water[i] / 255.0;
  // Congestion is the only term that depends on the neighbourhood, so the
  // zero-congestion variant the ROOM count needs (assessUrbanRoom evaluates
  // suitability at localDensity = 0, because it is counting room rather than
  // this tick's frontier) is the same expression without that subtraction.
  let base =
    W_FOOD * cropN +
    W_WATER * (waterN + W_SHORE * shore[i]) +
    W_LOGI * supplyQ(supplyDist_in[i]);
  suitZero[i] = base;
  suitability[i] = base - W_CONG * localDensity;
}
