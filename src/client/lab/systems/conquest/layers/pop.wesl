// Settled civilian population — the base of the army. On owned land it grows
// logistically toward the tile's carrying capacity, read straight from the
// TERRAIN base: soil fertility (crop) gated by real warmth (temperature) and
// moisture (humidity + drainage water). So temperate, watered, fertile land
// carries more people — and, mobilized, more troops — than desert or ice.
// Neutral land slowly reverts to wilderness.
import package::params;
import package::layers;

// Carrying capacity from the terrain climate — the opportunity map.
fn capacityAt(i: u32) -> f32 {
  let tempC = layers::temperature::val(i) * 65.0 - 30.0;
  let warm = smoothstep(-2.0, params::baseTempC() + 3.0, tempC);
  let moisture = params::rainWeight() * layers::humidity::val(i) +
    params::riverWeight() * layers::water::val(i);
  let wet = smoothstep(params::dryThreshold(), params::wetThreshold(), moisture);
  return clamp(layers::crop::val(i) * warm * wet, 0.0, 1.0);
}

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  var p = layers::pop::val(i);
  if (layers::owner::val(i) == 0u) {
    return clamp(p * 0.97, 0.0, 1.0); // unclaimed land reverts
  }
  let cap = capacityAt(i);
  p += params::growthRate() * (cap - p);
  return clamp(p, 0.0, 1.0);
}
