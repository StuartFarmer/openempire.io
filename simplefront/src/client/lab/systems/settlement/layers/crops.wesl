// Standing crop biomass. Logistic growth gated by four real factors: soil
// fertility (the map's crop layer), warmth (temperature above baseTemp), water
// (rainfall + freshwater irrigation), and accumulated growing-degree-days (a
// crop can't bulk up until the season has delivered enough warmth). A hard
// frost kills the standing crop. Water only, no ocean.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  let tempC = layers::temperature::val(i) * 65.0 - 30.0;
  let warmth = clamp((tempC - params::baseTempC()) / params::warmSpanC(), 0.0, 1.0);
  // Moisture is a hard requirement: below the dry threshold nothing grows
  // (real deserts), saturating to full above the wet threshold. A smoothstep,
  // not a linear ramp, so the Sahara stays barren instead of eking out a
  // trickle of food.
  let moisture = params::rainWeight() * layers::humidity::val(i) +
    params::riverWeight() * layers::water::val(i);
  let water = smoothstep(params::dryThreshold(), params::wetThreshold(), moisture);
  let soil = layers::crop::val(i);

  var b = layers::crops::val(i);
  b += params::cropGrowth() * soil * warmth * water * layers::gdd::val(i) * (1.0 - b);
  if (tempC < 0.0) {
    b *= 1.0 - params::frostKill(); // frost kills the standing crop
  }
  return select(0.0, clamp(b, 0.0, 1.0), layers::land::val(i) != 0.0);
}
