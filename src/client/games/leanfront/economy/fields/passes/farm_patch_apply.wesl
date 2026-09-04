// Field expansion, APPLIED — phase 2 of `FarmGrowth.farmTick`, the last piece
// of the economy with no GPU twin.
//
// Everything it needs is already computed per tile and reduced per district:
// `driveAccum` is the field's summed maturity (the credit stream), `acreAccum`
// its tile count (the labour gate's acreage), and `patchTile` the frontier tile
// the draw picked. What is left is per-DISTRICT arithmetic and one scattered
// write, so this pass runs one thread per district slot rather than one per
// tile.
//
// The CPU's rules, in order:
//   - bank `min(driveCap, summedMaturity)` as credit; a field with nothing
//     growing banks nothing and its credit is left untouched
//   - under the cost, keep saving
//   - at or over the cost, check LABOUR: the field's residents must have spare
//     hands for one more tile, or the plot waits — credit is HELD at exactly the
//     cost, so a district that finds people next tick places immediately rather
//     than starting over
//   - no eligible frontier tile: hold at the cost, same as the labour case
//   - otherwise place one plot at the claim threshold and spend the cost
//
// CREDIT IS CPU-MIRRORED, keyed by nucleus tile, and uploaded per slot each
// refresh. It cannot simply live here: slots are reassigned in ascending tile
// order every refresh, so a single farm dying renumbers everything after it and
// would hand one district's savings to another. The array is O(districts) in
// each direction — 2.5 KB at the measured peak — which is exactly the size of
// thing D4 says may cross back.
//
// RESIDENTS likewise come from the CPU: `shed.peopleByFarm` is the shed's
// labour pooling, per district, and population stays a per-player quantity
// under D1.
import package::bindings::{driveAccum, acreAccum, slotCredit, slotResidents, patchTile, maturity_in, patchReason};

/** Must match MAX_CELLS in system.ts. */
const CELLS: u32 = 16384u;
const NONE: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;
const COST: i32 = __FIELD_PATCH_COST_MILLI__;
const DRIVE_CAP: i32 = __FIELD_PATCH_DRIVE_CAP_MILLI__;
const FARMERS_PER_TILE: i32 = __FARMERS_PER_FIELD_TILE__;

fn tile(x: i32, y: i32, i: u32) {
  if (i >= CELLS) { return; }
  let slot = i;
  patchReason[slot] = 0u;

  // The credit stream: the field's summed TILLED maturity, capped so a mature
  // field paces its expansion instead of spraying plots.
  let drive = min(DRIVE_CAP, driveAccum[slot]);
  if (drive <= 0) { return; }  // nothing growing: credit untouched
  patchReason[slot] = 1u;

  let credit = slotCredit[slot] + drive;
  if (credit < COST) {
    slotCredit[slot] = credit;
    patchReason[slot] = 2u;
    return;
  }

  // Labour surplus gate: size follows people, checked at the moment of
  // expansion. Held at exactly COST so the plot is ready the tick hands arrive.
  let need = (acreAccum[slot] + 1) * FARMERS_PER_TILE;
  if (slotResidents[slot] < need) {
    slotCredit[slot] = COST;
    patchReason[slot] = 3u;
    return;
  }

  // No eligible frontier — desert, borders, or the city hemming the field in.
  let t = patchTile[slot];
  if (t == NONE) {
    slotCredit[slot] = COST;
    patchReason[slot] = 4u;
    return;
  }

  // The plot pops in at the claim threshold and ripens toward its suitability
  // from there. Written into the CURRENT maturity facet, because the ledger and
  // the acreage histogram read it later in this same dispatch (D3).
  maturity_in[t] = CLAIM;
  slotCredit[slot] = credit - COST;
  patchReason[slot] = 5u;
}
