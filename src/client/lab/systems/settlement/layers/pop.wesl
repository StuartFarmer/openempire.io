// Population density — the agents, modeled as a field. Births scale with
// stored food, deaths with its absence (starvation), and people migrate down
// the crowding gradient toward emptier neighbors (which, combined with the
// food-driven birth/death, pulls settlement toward the fertile tiles). Seeded
// thinly on fertile land so settlement emerges rather than being painted.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  let fertile = layers::land::val(i) != 0.0 && layers::crop::val(i) > 0.25;
  return select(0.0, 0.04, fertile);
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  var p = layers::pop::val(i);
  let food = layers::food::val(i);
  // Food is the carrying capacity: logistic growth relaxes population toward
  // it (booming below, starving above), and a baseline mortality shifts the
  // equilibrium down — so a tile only holds people where food clears
  // deathRate/birthRate. Deserts and frozen ground stay empty even as
  // migration keeps spilling into them. Migration then packs the survivors
  // toward the fertile cores.
  p += params::birthRate() * p * (food - p);
  p -= params::deathRate() * p;
  p += params::migrate() * (layers::pop::avg8(x, y) - p);
  return select(0.0, clamp(p, 0.0, 1.0), layers::land::val(i) != 0.0);
}
