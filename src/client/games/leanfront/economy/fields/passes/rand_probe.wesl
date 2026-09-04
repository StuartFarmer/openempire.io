// Scaffolding: does the WESL transcription of `PseudoRandom` produce the CPU's
// stream, word for word?
//
// The draws depend on it completely, so verifying it through a draw would
// conflate a generator bug with a frontier bug — the same conflation that made
// the ledger cutover look like an architecture problem when it was an ordering
// one. This pass answers only the generator question: seed from the same
// numbers the CPU seeds from, and write out the first few draws.
//
// Retired with the rest of the measurement rig (task 5.3).
import package::passes::rand::{rngFromSeed, rngNext};
import package::bindings::{playerSeed, randOut};

/** Seeds probed, and draws taken from each. Must match the CPU checker. */
const SEEDS: u32 = 64u;
const DRAWS: u32 = 8u;

fn tile(x: i32, y: i32, i: u32) {
  if (i >= SEEDS) { return; }
  var r = rngFromSeed(playerSeed[i]);
  for (var k = 0u; k < DRAWS; k = k + 1u) {
    randOut[i * DRAWS + k] = rngNext(&r);
  }
}
