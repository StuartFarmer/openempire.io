// Territory ownership (player ids; 0 = neutral wilderness). A tile flips to
// the strongest incoming attacker when its pressure beats the local defense:
// neutral land yields to a light push (organic expansion into the supplied
// catchment), enemy land only to a decisive one (war). Runs in the phase
// after `incursion`, so it reads this tick's pressure and last tick's
// owner/pop/troops; `troops` runs in the same phase with the identical
// conquest rule, so the two always agree.
import package::params;
import package::layers;
import package::lib::combat::{attackerOf, pressureOf, defenseOf, conquers};

fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::land::val(i) == 0.0) { return 0u; }
  let me = layers::owner::val(i);
  let a = layers::incursion::val(i);
  let defense = defenseOf(
    layers::troops::val(i), layers::pop::val(i), layers::elevation::val(i),
    me == 0u,
    params::neutralDefense(), params::militiaFrac(), params::terrainDefense(),
  );
  if (conquers(pressureOf(a), attackerOf(a), me, defense, params::flipMargin())) {
    return attackerOf(a);
  }
  return me;
}
