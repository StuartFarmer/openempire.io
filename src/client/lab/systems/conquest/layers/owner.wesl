// Territory ownership (player ids; 0 = neutral). A tile flips to the strongest
// incoming attacker when its pressure beats the terrain-typed defense — plains
// yield to a light push, mountains only to a decisive one (OpenFront's
// terrain cost). Runs in the phase after `incursion`; `troops` runs alongside
// with the identical conquest rule so the two always agree.
import package::params;
import package::layers;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerOf, pressureOf};

fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::land::val(i) == 0.0) { return 0u; }
  let me = layers::owner::val(i);
  let a = layers::incursion::val(i);
  let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
  let defense = defenseOf(
    layers::troops::val(i), layers::pop::val(i), mag, me == 0u,
    params::neutralDefense(), params::militiaFrac(), params::terrainWeight(),
  );
  if (conquers(pressureOf(a), attackerOf(a), me, defense, params::flipMargin())) {
    return attackerOf(a);
  }
  return me;
}
