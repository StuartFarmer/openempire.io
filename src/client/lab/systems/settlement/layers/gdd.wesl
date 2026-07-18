// Growing-degree-days: warmth accumulated over the growing season, the driver
// of crop maturity. Each tick above baseTemp adds to the tally; a hard frost
// (below 0 °C) ends the season and resets it — so a tile only ever matures a
// crop if it strings together enough frost-free warm days. Normalized so 1.0
// is "enough accumulated warmth for a full crop".
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  let tempC = layers::temperature::val(i) * 65.0 - 30.0;
  if (tempC < 0.0) {
    return 0.0; // frost ends the season
  }
  let g = layers::gdd::val(i) +
    params::gddGain() * max(0.0, tempC - params::baseTempC());
  return clamp(g, 0.0, 1.0);
}
