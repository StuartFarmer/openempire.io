// Per-tile military supply quality for the HUMAN player (add-supply-lines):
// 0 = out of supply (or not owned), 1..255 = supply quality
// (1/(1+(d/radius)^power) mapped to 1 + round(q·254)). A render CONDUIT like
// `owner`/`density` — no `update`, never GPU-ticked; the shell overwrites it
// each tick from the sim's supply field. The overlay draws it as a
// front→core blue heatmap so logistics stops being invisible.
fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}
