// Per-tile urban density from the CPU sim (add-shell-input-and-structures):
// 0..255 (the tribal "city" is a spreading density field, not a discrete unit).
// A render CONDUIT like `owner` — no `update`, never GPU-ticked; the shell
// overwrites it each tick from the sim's packed density deltas. The overlay
// draws it as a density-graded wash (mirroring the WebGL DensityPass).
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
