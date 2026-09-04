// Placeholder dynamic layer. The spike is a compute rig driven by `runDerive`
// and read back with `readBuffer` — it draws nothing — but a FieldSystem must
// declare at least one renderable view, and a view must point at a layer.
fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}
