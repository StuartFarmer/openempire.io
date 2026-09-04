// City placement, as a parallel weighted draw.
//
// `addCityTiles` picks tiles from the frontier by sequential weighted sampling
// WITHOUT replacement, promoting each placed tile's neighbours as it goes. That
// chaining is what a per-tile CA cannot reproduce — except that it never
// happens: `n = min(gap, max(1, floor(gap * urbanGrowthRate)))` with rate 0.1
// and gaps under 10, so n is ALWAYS 1 (measured on verdantia and spqr, see
// tests/perf/balance/UrbanPlacementStats.ts). One draw per player per tick.
//
// One weighted draw parallelises exactly, via the exponential race: give each
// candidate key = -ln(U)/w with U uniform in (0,1); the SMALLEST key is a draw
// with probability proportional to w. So a per-player atomicMin over the keys
// is the same distribution as the CPU's linear scan — not the same tile, since
// the randomness differs, but the same law. (Ties on the key are broken by
// lowest tile ref in the second pass, so the result is deterministic.)
//
// The key is bitcast to u32 for the atomic: for positive floats the IEEE-754 bit
// pattern is monotonic, so integer min == float min.
import package::bindings::{owner, density, farmFlags, suitability, pickKey};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const POP_PER_DENSITY: f32 = __POP_PER_DENSITY__;
const TICK_SEED: u32 = __TICK_SEED__;

/** Deterministic per-tile uniform in (0,1) — the draw's randomness. */
fn hash01(t: u32, seed: u32) -> f32 {
  var h = t * 747796405u + seed * 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  // Keep it strictly inside (0,1): log(0) is -inf and w=0 would divide by zero.
  return clamp(f32(h) / 4294967296.0, 1e-7, 0.9999999);
}

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  let flags = farmFlags[i];
  // Eligibility, matching the placement loop: not already a city tile, not
  // field-zoned ground, not battle-worn, and positively suitable.
  if (density[i] >= POP_PER_DENSITY) { return; }
  if ((flags & FLAG_FIELD_ZONE) != 0u) { return; }
  if ((flags & FLAG_DAMAGED) != 0u) { return; }
  let w = suitability[i];
  if (w <= 0.0) { return; }

  let key = -log(hash01(i, TICK_SEED)) / w;
  atomicMin(&pickKey[mine], bitcast<u32>(key));
}
