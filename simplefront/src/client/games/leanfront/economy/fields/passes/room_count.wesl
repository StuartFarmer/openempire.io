// Urban ROOM, as a reduction rather than an iteration.
//
// EconomyModel.assessUrbanRoom walks `supply.dist` — a Map<TileRef, number> —
// counting tiles that could still take a city tile. That iteration is the whole
// reason the field had to be a Map: a plane cannot enumerate one player's
// supplied tiles without scanning the grid per player.
//
// But the loop's RESULT is a single integer per player. So it is a count grouped
// by owner: every tile tests itself in parallel and atomically bumps its owner's
// slot. The CPU reads back 256 u32s instead of materialising a 200k-entry Map —
// the difference between ~1 KB and the 16.8 ms rebuild that killed the hybrid.
//
// Predicate mirrors assessUrbanRoom exactly: owned, land+passable (already
// encoded in `owner`), not already a city tile, not a Farmland plot, and
// positive suitability evaluated at ZERO local density.
import package::bindings::{owner, density, plotFarm, suitZero, supplyDist_in, roomCount};

const POP_PER_DENSITY: f32 = __POP_PER_DENSITY__;
const UNREACHED: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  // The CPU walks `supply.dist`, so being IN the supply field is itself the
  // first predicate — a tile out of logistical reach is not room, however
  // fertile. Missing this counted every owned tile and overshot by 17k.
  if (supplyDist_in[i] == UNREACHED) { return; }
  if (density[i] >= POP_PER_DENSITY) { return; }
  if (plotFarm[i] != 0u) { return; }
  if (suitZero[i] <= 0.0) { return; }
  atomicAdd(&roomCount[mine], 1u);
}
