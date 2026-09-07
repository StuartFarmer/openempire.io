// Per-tile tribal structure from the CPU sim (add-shell-input-and-structures):
// 0 none, 1 Settlement, 2 Farmland, 3 Barn. Like `owner`, this is a render
// CONDUIT — no `update`, never GPU-ticked; the shell overwrites it each tick
// from game.units(...) + claimed farm-CA tiles. The overlay draws per-tile fills
// (mirroring the WebGL PlotPass).
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
