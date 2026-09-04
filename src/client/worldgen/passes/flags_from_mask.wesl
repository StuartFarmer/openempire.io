// 100%-faithful flags: the shipped map classifies every tile. waterMask
// (CPU-built from map.bin + bathymetry) says 0 land, 1 sea, 2 lake. Real
// inland lakes (Great Lakes, Great Salt Lake, Baikal…) are LAND in map.bin
// (the coastline mask has no lake holes), so they arrive via the hydro.bin
// LAKE plane instead — the shipped standing-water mask, distinct from
// rivers. Biome bits arrive later from humidity_biome.
import package::bindings::{lakeBase, waterMask, flags};

fn tile(x: i32, y: i32, i: u32) {
  let m = waterMask[i];
  var f = select(select(0u, 2u, m == 2u), 1u, m == 1u);
  if (f == 0u && lakeBase[i] > 0.5) {
    f = 2u;
  }
  flags[i] = f;
}
