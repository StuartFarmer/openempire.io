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
// draws from the same pool with the same law as the CPU's linear scan. Not the
// same tile — the randomness differs — and under design D9 that is the whole
// contract: reproducing the distribution, not the sample. (Ties on the key are
// broken by lowest tile ref in the second pass, so the result is still a
// function of the board rather than of which thread arrived first.)
//
// THE WEIGHT IS `cityWeight`, NOT `suitability`, and the difference was a bug
// rather than a nicety. `suitability` is the BASE term — fertility, water,
// shore, logistics, minus congestion. The CPU weights by that base times a
// FOOD-SHED GATE, so a city grows only toward land its farms can feed. Racing
// on the ungated base sampled a different pool with different probabilities,
// which is not "equidistributed with the CPU" in any useful sense.
//
// `cityWeight` also carries the full eligibility test (see city_weight.wesl),
// so a positive weight IS the predicate and no test is repeated here.
//
// The key is bitcast to u32 for the atomic: for positive floats the IEEE-754 bit
// pattern is monotonic, so integer min == float min.
import package::bindings::{owner, cityWeight, pickKey};

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
  let w = cityWeight[i];
  if (w <= 0.0) { return; }

  let key = -log(hash01(i, TICK_SEED)) / w;
  atomicMin(&pickKey[mine], bitcast<u32>(key));
}
