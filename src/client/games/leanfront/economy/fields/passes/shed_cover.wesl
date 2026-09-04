// LABOUR COVERAGE: which claimed tiles are actually STAFFED.
//
// The CPU staffs the nucleus unconditionally (the bootstrap guard — a lone
// spawn farm must start the loop even with no city-dwellers), then takes the
// district's claimed tiles ranked by maturity, tileRef as the tie-break, until
// the pool runs out. Everything ranked but unstaffed is FALLOW: it produces
// nothing and senesces.
//
// THIS IS A COMPARISON AND A MARK, NOT A HISTOGRAM, and the design asked for a
// histogram. The change is measurement-led, and the reasoning matters more than
// the code:
//
//   slots = floor(pool / farmersPerFieldTile) - 1
//
// and the SPILLOVER (shed_spill) has already capped `pool` at
// `need = (1 + claims) x farmersPerFieldTile`. So `slots <= claims` ALWAYS, with
// equality exactly when the cell reached its need. Three cases fall out, and
// only the third needs a ranking at all:
//
//   slots >= claims  every claimed tile staffed   — 589 of 591 districts
//   slots == 0       nothing staffed, all fallow  —   2 of 591
//   0 < slots < claims  RANK, and pick the top    —   0 of 591
//
// (spqr at tick 9303; verdantia at tick 1000 gives 46 / 2 / 0.) The third case
// needs a cell still under-staffed after its whole shed network redistributed —
// a labour-starved empire, not a normal one.
//
// A HISTOGRAM COULD NOT HAVE SERVED THE THIRD CASE ANYWAY, which is the other
// half of why it is gone. A histogram picks a maturity LEVEL, and the CPU ranks
// by `(maturity DESC, tileRef ASC)`; farms settle AT their climate ceiling, so
// equal-maturity groups are large — 1,266 tiles in one district on spqr — and a
// cut-off landing inside one is unresolvable at any bin count.
//
// SO THE THIRD CASE ESCALATES rather than being reimplemented. The pass marks
// those tiles COVER_ESCALATE and the host runs its own exact selection for
// those districts alone. That is not a shortcut around a hard problem: what
// crosses is bounded by how many districts are labour-STARVED, which is
// measured at zero on both boards, and the alternative is a two-level radix
// select — 300-odd lines and its own correctness argument — for a code path
// that has never once executed. If a board ever escalates, the probe says so.
import package::bindings::{owner, farmFlags, maturity_in, shedCell_in, cellSlot, slotLabor, claimAccum, coverFlags};

const FLAG_FIELD_ZONE: u32 = 2u;
const FLAG_NUCLEUS: u32 = 4u;
const UNREACHED: u32 = 0xffffffffu;
const NO_SLOT: u32 = 0xffffffffu;
const CLAIM: f32 = __FIELD_CLAIM_MILLI__;
const PER_FIELD: i32 = __FARMERS_PER_FIELD_TILE__;

/** `ranked` — claimed ground this refresh considered. Nuclei are NOT in it. */
const COVER_RANKED: u32 = 1u;
/** `tilled` — staffed. Ranked-but-not-tilled is fallow. */
const COVER_TILLED: u32 = 2u;
/** The host must decide this district: it is under-staffed but not empty, so
 *  the ranking actually selects. Never observed on a real board. */
const COVER_ESCALATE: u32 = 4u;

fn tile(x: i32, y: i32, i: u32) {
  coverFlags[i] = 0u;
  if (owner[i] == 0u) { return; }

  let cell = shedCell_in[i];
  if (cell == UNREACHED) { return; }
  let slot = cellSlot[cell];
  if (slot == NO_SLOT) { return; }

  // The nucleus is staffed unconditionally and is not ranked — `cellClaims`
  // excludes it and `needOf` adds it back as the +1.
  let flags = farmFlags[i];
  if ((flags & FLAG_NUCLEUS) != 0u) {
    coverFlags[i] = COVER_TILLED;
    return;
  }

  let claimed = maturity_in[i] >= CLAIM || (flags & FLAG_FIELD_ZONE) != 0u;
  if (!claimed) { return; }

  let claims = claimAccum[slot];
  // Integer division truncates toward zero, and the pool is never negative, so
  // this is the CPU's `Math.floor` exactly.
  let staffed = max(0, slotLabor[slot] / PER_FIELD - 1);

  var f = COVER_RANKED;
  if (staffed >= claims) {
    f = f | COVER_TILLED;         // the whole field is worked
  } else if (staffed > 0) {
    f = f | COVER_ESCALATE;       // the ranking selects; the host decides
  }
  // staffed == 0 falls through as ranked-only, i.e. fallow.
  coverFlags[i] = f;
}
