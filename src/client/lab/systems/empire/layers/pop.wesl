// Settled civilian population — the realized economy. On owned, supplied land
// it grows logistically toward the tile's carrying capacity (needs food to
// grow); over capacity with an empty store it starves. On land just taken it
// starts small and backfills. Neutral land slowly reverts to wilderness.
// Population is the base of everything: it makes food and, mobilized, becomes
// the army — so fertile supplied land is worth more people AND more troops.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) {
    return 0.0;
  }
  var p = layers::pop::val(i);
  if (layers::owner::val(i) == 0u) {
    return clamp(p * 0.97, 0.0, 1.0); // unfarmed land reverts
  }
  let cap = layers::potential::val(i);
  let food = layers::food::val(i);
  // Grow logistically toward the land's capacity, throttled by supply. Food
  // does not gate growth (that would chicken-and-egg the bootstrap); it gates
  // STARVATION — when population sits above what the seasonal land can feed
  // and the store is empty (winter, or overshoot), people die back.
  p += params::growthRate() * layers::supply::val(i) * (cap - p);
  if (p > cap && food < 0.02) {
    p -= params::starveRate() * (p - cap);
  }
  return clamp(p, 0.0, 1.0);
}
