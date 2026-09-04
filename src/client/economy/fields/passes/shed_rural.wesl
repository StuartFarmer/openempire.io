// THE RURAL COHORT, and the snapshot the feeding model reads.
//
// Every civilian NOT housed in a city tile is rural, and rural people are
// exactly who tends farms. A young village has no urban tiles at all, so
// without this the labour model is a bootstrap death-trap: no city, no farmers,
// no food, no city. Rural labour splits equally across the player's farms, and
// the division REMAINDER joins the first farm — left in the shed-less camp
// cohort it would starve against zero production.
//
// `perFarm` and `remainder` arrive uploaded rather than derived here, because
// both are per-player scalars over the player's farm COUNT: the CPU knows how
// many farms a player has without touching a tile, and computing it on the
// device would mean reducing a count only to divide by it.
//
// THE SNAPSHOT IS THE POINT OF THIS PASS RUNNING WHERE IT DOES. `peopleByFarm`
// is the raw residents per cell — who EATS there — and it is taken BEFORE the
// spillover caps pools at their staffing need. Tilling is by staffing, feeding
// is by residence: a metro's surplus workers still dine at home even when a
// neighbouring field employs them. Taking this snapshot after `shed_spill`
// would silently make the two the same quantity and starve every dense core.
//
// One thread per district slot, not per tile.
import package::bindings::{slotTile, owner, poolAccum, playerRural, playerRuralRem, playerFirstSlot, slotPeople};

/** Must match MAX_CELLS in system.ts. */
const CELLS: u32 = 16384u;
const NO_TILE: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  if (i >= CELLS) { return; }
  let t = slotTile[i];
  if (t == NO_TILE) { return; }
  let mine = owner[t];
  if (mine == 0u) { return; }

  var pool = poolAccum[i] + playerRural[mine];
  // `farms[0]` is the player's lowest-numbered slot, because slots are assigned
  // in ascending tile order (parent D4) — so "first farm" is a property of the
  // farm SET, not of any iteration order.
  if (i == playerFirstSlot[mine]) { pool = pool + playerRuralRem[mine]; }

  poolAccum[i] = pool;
  slotPeople[i] = pool; // residents, uncapped — read by feeding
}
