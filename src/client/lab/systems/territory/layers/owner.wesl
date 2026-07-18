// Territory ownership (player ids; 0 = unclaimed). A tile flips to the
// attacker when its incoming pressure beats the local defense. Runs in the
// phase after `attack`, so it reads this tick's attack and last tick's
// owner/troops; `troops` runs in the same phase with the identical conquest
// rule, so the two always agree.
import package::params;
import package::layers;
import package::sim;
import shared::pack::{attackerOf, pressureOf};
import shared::combat::{garrisonDefense, conquersStochastic};

fn init(x: i32, y: i32, i: u32) -> u32 {
  return 0u;
}

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::land::val(i) == 0.0) { return 0u; }
  let me = layers::owner::val(i);
  let a = layers::attack::val(i);
  let defense = garrisonDefense(
    layers::troops::val(i),
    me == 0u,
    params::defensePower(),
    params::neutralDefense(),
  );
  let flip = conquersStochastic(
    pressureOf(a), attackerOf(a), me, defense,
    params::flipMargin(), sim::rand(x, y), params::flipChance(),
  );
  if (flip) {
    return attackerOf(a);
  }
  return me;
}
