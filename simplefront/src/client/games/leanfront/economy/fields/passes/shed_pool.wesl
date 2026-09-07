// LABOUR POOLING: each district is tended by the people whose homes fall in its
// nearest-farm cell of the shed. One `atomicAdd` per covered, inhabited tile.
//
// DENSITY IS HOUSING, NOT HEADCOUNT. A full city tile HOUSES popPerDensity
// people, but the nation may hold fewer, so each tile contributes its share of
// the REAL urban civilians: `floor(housed x occupancy)` with
// `occupancy = min(idlePop, housing) / housing` over the player's whole
// territory. Without it a half-empty capital reads as ten thousand phantom
// mouths. `occupancy` is per PLAYER and arrives uploaded — it needs the
// player's total housing and idle pool, both of which the CPU already holds as
// scalars, and neither of which is per-tile work.
//
// f32, DELIBERATELY, and this is the reasoning rather than an oversight. The
// CPU floors an f64 product; WGSL has no f64, and the exact integer route is
// closed by magnitude — `housed` reaches popPerDensity (10,000, 16,500 in the
// presets) and `urbanCivilians` reaches millions, so the exact product passes
// 5e10 and overflows u32 before any division could happen. Recovering it needs
// long division over an emulated 64-bit product on every one of ~555,000
// covered tiles.
//
// The gate that matters is satisfied anyway: D5 requires the REDUCTION to be
// integer, because a float `atomicAdd` completes in nondeterministic order and
// would vary run to run on the same device. Summing `floor(...)` into an i32
// does that exactly. Whether the floor lands on the CPU's integer is FIDELITY,
// which D9 already settled — and measured, on verdantia at tick 1000: 2 tiles
// of 65 differ, worst ONE PERSON against district pools in the thousands, on a
// board where this same pipeline carries city weights 70% from the CPU's by
// design.
import package::bindings::{owner, density, shedCell_in, cellSlot, playerOcc, poolAccum};

const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  let housed = density[i];
  if (housed <= 0.0) { return; }

  // Only tiles inside the shed pool their people — a house beyond every cell's
  // reach feeds nobody's field.
  let cell = shedCell_in[i];
  if (cell == UNREACHED) { return; }
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; }

  let people = i32(floor(housed * playerOcc[mine]));
  if (people <= 0) { return; }
  atomicAdd(&poolAccum[slot], people);
}
