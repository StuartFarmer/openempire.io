// Grass regrows toward the map's crop fertility and is eaten by herds.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return layers::crop::val(i);
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  let grass = layers::grass::val(i);
  let regrow = params::grassGrowth() * layers::crop::val(i) * (1.0 - grass);
  let grazed = params::grazeRate() * layers::herd::val(i) * grass;
  return clamp(grass + regrow - grazed, 0.0, 1.0);
}
