// Grazing pressure: how much grass is being eaten per tile per tick.
import package::params;
import package::layers;

fn value(x: i32, y: i32, i: u32) -> f32 {
  // ~0.01 at equilibrium; scale into the visible range.
  return params::grazeRate() * layers::herd::val(i) * layers::grass::val(i) * 20.0;
}
