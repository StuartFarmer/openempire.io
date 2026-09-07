// Herds grow where they eat, die at a base rate, diffuse toward neighboring
// tiles, and cannot exist off land.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  var v = layers::herd::val(i);
  v += params::herdBirth() * v * layers::grass::val(i);
  v -= params::herdDeath() * v;
  v += params::herdSpread() * (layers::herd::avg8(x, y) - v);
  return select(0.0, clamp(v, 0.0, 1.0), layers::land::val(i) != 0.0);
}
