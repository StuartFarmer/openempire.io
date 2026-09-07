// Per-tile front force-balance (add-shell-fronts-erosion-info): 0 = no active
// front here; otherwise 1..255 a signed balance byte (128 = even), from the
// human's perspective — >128 the human's side is pushing (green), <128 the enemy
// is pushing (red). A render CONDUIT like `owner` — no `update`, never GPU-
// ticked; the shell overwrites it each tick from the human's active attacks.
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
