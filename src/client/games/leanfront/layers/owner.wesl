// Per-tile ownership from the REAL CPU simulation (bridge-core-sim-to-shell).
// This layer is a render CONDUIT, not a GPU sim: it has no `update`, so it is
// never ticked or swapped — the shell overwrites it each tick with the sim's
// tileStateBuffer (owner smallID = state & 0xfff; 0 = neutral). The overlay
// view reads it and washes each player's colour over the terrain.
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
