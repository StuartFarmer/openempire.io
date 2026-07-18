// Ownership map: player ids spread across the view ramp (one ramp stop per
// player slot, neutral first).
import package::layers;
import package::players;

fn value(x: i32, y: i32, i: u32) -> f32 {
  return f32(layers::owner::val(i)) / f32(players::count() - 1u);
}
