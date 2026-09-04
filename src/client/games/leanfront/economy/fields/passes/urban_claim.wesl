// Second half of the weighted draw: the winning key is known, so name the tile
// that holds it. Ties (two tiles landing on the same key) go to the lowest tile
// ref, which makes the draw a function of the board rather than of which thread
// happened to get there first.
//
// Eligibility and the key are recomputed rather than stored: `cityWeight`
// carries the whole predicate (see city_weight.wesl), so re-reading one plane
// and redoing two arithmetic ops is far cheaper than a second full-map plane,
// and it keeps the two halves impossible to get out of step.
import package::bindings::{owner, cityWeight, pickKey, pickTile};

const TICK_SEED: u32 = __TICK_SEED__;

fn hash01(t: u32, seed: u32) -> f32 {
  var h = t * 747796405u + seed * 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return clamp(f32(h) / 4294967296.0, 1e-7, 0.9999999);
}

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  let w = cityWeight[i];
  if (w <= 0.0) { return; }

  let key = bitcast<u32>(-log(hash01(i, TICK_SEED)) / w);
  if (key == atomicLoad(&pickKey[mine])) {
    atomicMin(&pickTile[mine], i);
  }
}
