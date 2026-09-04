// Second half of the weighted draw: the winning key is known, so name the tile
// that holds it. Ties (two tiles landing on the same key) go to the lowest tile
// ref, which makes the draw deterministic rather than dependent on which thread
// happened to get there first.
import package::bindings::{owner, density, farmFlags, suitability, pickKey, pickTile};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const POP_PER_DENSITY: f32 = __POP_PER_DENSITY__;
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
  let flags = farmFlags[i];
  if (density[i] >= POP_PER_DENSITY) { return; }
  if ((flags & FLAG_FIELD_ZONE) != 0u) { return; }
  if ((flags & FLAG_DAMAGED) != 0u) { return; }
  let w = suitability[i];
  if (w <= 0.0) { return; }

  let key = bitcast<u32>(-log(hash01(i, TICK_SEED)) / w);
  if (key == atomicLoad(&pickKey[mine])) {
    atomicMin(&pickTile[mine], i);
  }
}
