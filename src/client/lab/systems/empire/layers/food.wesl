// Food store — the buffer that decouples the seasonal harvest from the
// year-round appetite, and the ledger that makes mobilization cost something.
// Only civilians farm (population minus the mobilized troops), so raising an
// army shrinks production; everyone eats. The store banks summer surplus
// against winter, and empties under over-mobilization or over-expansion.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0 || layers::owner::val(i) == 0u) {
    return clamp(layers::food::val(i) * 0.9, 0.0, 1.0);
  }
  let farmers = max(0.0, layers::pop::val(i) - layers::troops::val(i));
  var f = layers::food::val(i);
  f += params::harvestRate() * farmers * layers::potential::val(i);
  f -= params::eatRate() * (layers::pop::val(i) + layers::troops::val(i));
  f -= params::foodDecay() * f;
  return clamp(f, 0.0, 1.0);
}
