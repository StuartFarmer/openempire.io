// Live air temperature. The baked temperature plane is the ANNUAL MEAN; the
// seasonal model swings around it with the sun's declination: amplitude grows
// with latitude and axial tilt, and the phase flips across the equator
// (northern winter = southern summer).
import package::kernel::GRID;
import package::params;
import package::layers;
import package::sim;

fn seasonalSwing(y: i32) -> f32 {
  // +1 at the north pole … -1 at the south pole.
  let latitude = 1.0 - 2.0 * (f32(y) / f32(GRID.size.y));
  let phase = 6.2831853 * f32(sim::tick()) / params::yearTicks();
  // Declination ∝ tilt; continental lag and ocean damping are ignored (v1).
  return sin(phase) * latitude * (params::tilt() / 90.0) * params::seasonStrength();
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return layers::temperature::val(i);
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  return clamp(layers::temperature::val(i) + seasonalSwing(y), 0.0, 1.0);
}
