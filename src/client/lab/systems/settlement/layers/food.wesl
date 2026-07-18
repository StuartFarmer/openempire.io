// Stored food. Mature crops (biomass weighted by growing-degree-days) are
// harvested into the store; the population eats from it; the rest slowly
// spoils. This is the buffer that decouples the seasonal harvest from the
// year-round appetite — a tile survives winter on what it banked in summer.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  var f = layers::food::val(i);
  f += params::harvestRate() * layers::crops::val(i) * layers::gdd::val(i);
  f -= params::eatRate() * layers::pop::val(i);
  f -= params::foodDecay() * f;
  return select(0.0, clamp(f, 0.0, 1.0), layers::land::val(i) != 0.0);
}
