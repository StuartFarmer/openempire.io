// Per-tile combat damage ("battle-worn ground", rework-settlement-ecology):
// 0..255 — tiles conquered from another player in combat scar and can't grow
// until healed. A render CONDUIT like `owner`/`density` — no `update`, never
// GPU-ticked; the shell overwrites it each tick from the sim's packed damage
// deltas. The overlay draws it as a brown battle-worn wash (WebGL DensityPass
// damage overlay).
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
