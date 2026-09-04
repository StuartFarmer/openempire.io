// Reset the per-PLAYER accumulator and draw slots. Second half of reset_cells —
// see that file for why this exists at all; the short version is that
// `atomicMin` over a zeroed buffer never moves, so the city placement draw has
// never named a winner.
import package::bindings::{pickKey, pickTile, roomCount};

/** Player slots, matching the 256 in system.ts. */
const PLAYERS: u32 = 256u;
const NONE: u32 = 0xffffffffu;

fn tile(x: i32, y: i32, i: u32) {
  if (i >= PLAYERS) { return; }
  pickKey[i] = NONE;
  pickTile[i] = NONE;
  roomCount[i] = 0u;
}
