// Seasonal air temperature (baked annual mean + latitude×tilt swing),
// normalized 0..1 = (T + 30) / 65 °C. Drives the carrying-capacity potential
// through warmth and the winter frost that empties the frontier.
import package::kernel::GRID;
import package::params;
import package::layers;
import package::sim;

fn seasonalSwing(y: i32) -> f32 {
  let latitude = 1.0 - 2.0 * (f32(y) / f32(GRID.size.y));
  let phase = 6.2831853 * f32(sim::tick()) / params::yearTicks();
  return sin(phase) * latitude * (params::tilt() / 90.0) * params::seasonStrength();
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return layers::temperature::val(i);
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  return clamp(layers::temperature::val(i) + seasonalSwing(y), 0.0, 1.0);
}
