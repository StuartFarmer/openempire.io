// Grass regrows toward the map's crop fertility — gated by the TERRAIN's real
// seasonal warmth (layers::temperature is the terrain base's climate field, not
// the raw plane) — and is eaten by herds. Grass greens in summer, dies back in
// winter, and stays sparse in the cold.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  let grass = layers::grass::val(i);
  // Terrain temperature is 0..1 = (T+30)/65 °C; grass grows above ~freezing.
  let warmth = smoothstep(0.42, 0.58, layers::temperature::val(i));
  let capacity = layers::crop::val(i) * warmth;
  let regrow = params::grassGrowth() * capacity * (1.0 - grass);
  let grazed = params::grazeRate() * layers::herd::val(i) * grass;
  return clamp(grass + regrow - grazed, 0.0, 1.0);
}
