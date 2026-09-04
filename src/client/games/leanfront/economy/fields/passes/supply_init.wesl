// Military supply flood, seed pass (GPU spike). Sources are the player's Core
// and every completed Settlement, uploaded as a mask (SupplyField.recompute's
// `addSource`, which already filters to nodes standing on the player's own
// ground). Unlike the food shed this flood carries NO source id — only the
// step distance — so there is no tie to break and the parallel form is exactly
// equivalent to the CPU's BFS.
import package::bindings::{supplyNode, supplyDist_out};

const UNREACHED: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  if (supplyNode[i] != 0u) {
    supplyDist_out[i] = 0u;
    return;
  }
  supplyDist_out[i] = UNREACHED;
}
