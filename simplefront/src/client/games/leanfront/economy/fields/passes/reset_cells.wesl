// Reset the per-DISTRICT accumulators and draw slots at the top of a dispatch.
//
// Nothing did this, and it was hiding two bugs of opposite kinds.
//
// The reductions (`prodAccum`, `capAccum`, `driveAccum`, `acreAccum`,
// `acresAccum`) are `atomicAdd` targets. A freshly created WebGPU buffer is
// zeroed, so a probe that dispatches ONCE gets the right answer and every
// isolation check passed — but in a per-tick loop they would accumulate across
// every tick of the game, without bound. The port would have failed at the
// cutover for a reason no isolation probe could see.
//
// The draw slots are worse, because they were wrong even at one dispatch.
// `patchKey` is an `atomicMin` target holding the smallest exponential-race key,
// so it has to START at the maximum. Starting at zero — which is what a zeroed
// buffer gives — means no key is ever smaller, the minimum never moves off zero,
// and the claim pass's `key == atomicLoad(&patchKey[slot])` is never true. The
// field-expansion race has therefore never named a winner. Same for the city
// draw's `pickKey` (see reset_players).
//
// A separate pass from `reset_players` for the usual reason: nine storage
// buffers here, three there, and this device's cap is ten. The shed
// derivation's two accumulators went into `reset_shed` for exactly that reason
// — adding them here made eleven and the bind group would not build.
import package::bindings::{prodAccum, capAccum, driveAccum, acreAccum, acresAccum, patchKey, patchTile, cropCount, shedCount};

/** Must match MAX_CELLS in system.ts. */
const CELLS: u32 = 16384u;
const NONE: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  // The compaction counter is a single slot, reset by whichever thread is
  // first — it is written before any thread appends, since passes are separate
  // dispatches.
  if (i == 0u) { cropCount[0] = 0u; }
  if (i >= CELLS) { return; }
  prodAccum[i] = 0;
  capAccum[i] = 0;
  driveAccum[i] = 0;
  acreAccum[i] = 0;
  acresAccum[i] = 0;
  // atomicMin sentinels: the largest u32, so any real key wins.
  patchKey[i] = NONE;
  patchTile[i] = NONE;
}
