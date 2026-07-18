// The army — mobilized population. On owned land, troops regenerate toward
// the player's mobilization level times the local POPULATION, throttled by
// supply: fertile, well-fed land raises a bigger army than desert, which is
// the whole ecological-leverage thesis. Troops bleed to enemy pressure, waste
// away beyond supply, and starve when the food store is empty (a mobilized
// force that outruns its farms). A conquered tile starts with a garrison
// carved from the winning pressure. Same phase and conquest rule as `owner`.
import package::params;
import package::layers;
import package::players;
import shared::pack::{attackerOf, pressureOf};
import shared::combat::{defenseOf, conquers};

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  let me = layers::owner::val(i);
  let t = layers::troops::val(i);
  let a = layers::incursion::val(i);
  let pressure = pressureOf(a);
  let defense = defenseOf(
    t, layers::pop::val(i), layers::elevation::val(i),
    me == 0u,
    params::neutralDefense(), params::militiaFrac(), params::terrainDefense(),
  );
  if (conquers(pressure, attackerOf(a), me, defense, params::flipMargin())) {
    return clamp(pressure * params::conquestGarrison(), 0.03, 1.0);
  }
  if (me == 0u) { return clamp(t * 0.95, 0.0, 1.0); }

  let p = players::val(me);
  let reach = layers::supply::val(i);
  let mobTarget = p.commit * layers::pop::val(i);
  var v = t;
  v += params::mobilizeRate() * reach * (mobTarget - t);
  v -= pressure * params::attrition();
  // Starving (empty store) and unsupplied armies waste away.
  v -= params::starveAttrition() * v * (1.0 - clamp(layers::food::val(i) * 3.0, 0.0, 1.0));
  v -= params::unsupplyAttrition() * v * (1.0 - reach);
  return clamp(v, 0.0, 1.0);
}
