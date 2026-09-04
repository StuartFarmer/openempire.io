// Carrying capacity — the OPPORTUNITY MAP. How many people the land can feed,
// from soil fertility × warmth × a hard moisture gate. Unowned and seasonal:
// it falls in winter and drops to ~0 in the frost zone, so the frontier a
// player can hold breathes with the year. Everything the empire realizes —
// population, and through it troops — is bounded by this.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) {
    return 0.0;
  }
  let tempC = layers::temperature::val(i) * 65.0 - 30.0;
  // Warmth and moisture are GATES, not fractions: they open toward 1 on
  // habitable land rather than multiplying it down. So fertile temperate soil
  // reads near its full fertility, while frost and desert cut it to 0.
  let warmGate = smoothstep(-2.0, params::baseTempC() + 3.0, tempC);
  let moisture = params::rainWeight() * layers::humidity::val(i) +
    params::riverWeight() * layers::water::val(i);
  let wetGate = smoothstep(params::dryThreshold(), params::wetThreshold(), moisture);
  return clamp(layers::crop::val(i) * warmGate * wetGate, 0.0, 1.0);
}
