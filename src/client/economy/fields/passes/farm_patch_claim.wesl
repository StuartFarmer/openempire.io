// Second half of the patch draw: the winning key per cell is known, so name the
// tile that holds it. Ties (two tiles landing on the same key) go to the lowest
// tile ref, which makes the draw deterministic rather than dependent on which
// thread happened to arrive first — the same rule `urban_claim` uses.
//
// Eligibility and the key are recomputed here rather than stored: recomputing
// two arithmetic ops per tile is far cheaper than a second full-map plane, and
// it keeps the two halves impossible to get out of step.
import package::kernel::{inBounds, refOf};
import package::bindings::{owner, density, farmFlags, maturity_in, shedCell_in, patchWeight, cellSlot, patchKey, patchTile};

const FLAG_DAMAGED: u32 = 1u;
const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_FALLOW: u32 = 8u;
const FLAG_TILLED: u32 = 16u;
const FLAG_URBAN_ZONE: u32 = 32u;
const FLAG_PLOT: u32 = 64u;
const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;
const TICK_SEED: u32 = __TICK_SEED__;

/** Deterministic per-tile uniform in (0,1) — the draw's randomness. */
fn hash01(t: u32, seed: u32) -> f32 {
  var h = t * 747796405u + seed * 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return clamp(f32(h) / 4294967296.0, 1e-7, 0.9999999);
}

/** Is `j` a field tile whose frontier `i` could join? Mirrors farmTick's
 *  classification: the persistent Field ZONE or a claimed crop, undamaged, and
 *  not fallow (an unstaffed tile is senescing, and does not expand). */
fn isFrontierSource(j: u32) -> bool {
  if (owner[j] == 0u) { return false; }
  let flags = farmFlags[j];
  if ((flags & FLAG_DAMAGED) != 0u) { return false; }
  if ((flags & FLAG_FALLOW) != 0u) { return false; }
  return maturity_in[j] >= CLAIM || (flags & FLAG_FIELD_ZONE) != 0u;
}

/** The cell a field tile belongs to; its own ref when the shed does not cover
 *  it, matching `shed.hasCell(tile) ? shed.cellAt(tile) : tile`. */
fn cellOf(j: u32) -> u32 {
  let c = shedCell_in[j];
  if (c == UNREACHED) { return j; }
  return c;
}

fn tile(x: i32, y: i32, i: u32) {
  let mine = owner[i];
  if (mine == 0u) { return; }
  let flags = farmFlags[i];
  // Eligibility, matching `eligible()` in placePatch. Ownership already bounds
  // this to owned, passable land.
  if (density[i] > 0.0) { return; }                    // city — first claim holds
  if ((flags & FLAG_URBAN_ZONE) != 0u) { return; }     // once city, always city
  if ((flags & FLAG_PLOT) != 0u) { return; }           // a plot stands here
  if ((flags & FLAG_DAMAGED) != 0u) { return; }        // scarred ground refuses
  if (maturity_in[i] > 0.0) { return; }                // already field ground
  // Ground the shed ranked this refresh is off-limits until re-ranked; `ranked`
  // is exactly the tiles that came back tilled or fallow.
  if ((flags & (FLAG_FALLOW | FLAG_TILLED)) != 0u) { return; }
  let w = patchWeight[i];
  if (w <= 0.0) { return; }

  let key = bitcast<u32>(-log(hash01(i, TICK_SEED)) / w);

  // Race once per DISTINCT neighbouring cell.
  var cells = array<u32, 4>(UNREACHED, UNREACHED, UNREACHED, UNREACHED);
  var n = 0u;
  for (var d = 0u; d < 4u; d = d + 1u) {
    var nx = x;
    var ny = y;
    if (d == 0u) { nx = x - 1; }
    else if (d == 1u) { nx = x + 1; }
    else if (d == 2u) { ny = y - 1; }
    else { ny = y + 1; }
    if (!inBounds(nx, ny)) { continue; }
    let j = refOf(nx, ny);
    if (owner[j] != mine) { continue; }  // borders bound fields
    if (!isFrontierSource(j)) { continue; }
    let c = cellOf(j);
    var dup = false;
    for (var k = 0u; k < n; k = k + 1u) {
      if (cells[k] == c) { dup = true; }
    }
    if (dup) { continue; }
    cells[n] = c;
    n = n + 1u;
    let slot = cellSlot[c];
    if (slot == NO_SLOT) { continue; } // beyond MAX_CELLS
    if (key == atomicLoad(&patchKey[slot])) {
      atomicMin(&patchTile[slot], i);
    }
  }
}
