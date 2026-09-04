// Per-tile garrison (0..1). Owned tiles regenerate; tiles under attack take
// attrition; front tiles of an attacking player drain (troops committed to
// the push); freshly conquered tiles start with a garrison carved from the
// winning pressure. Same phase as `owner`, same conquest rule.
import package::params;
import package::layers;
import package::players;
import package::sim;
import package::lib::combat::{attackerOf, pressureOf, defenseOf, conquers};

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  let me = layers::owner::val(i);
  let t = layers::troops::val(i);
  let a = layers::attack::val(i);
  let pressure = pressureOf(a);
  let defense = defenseOf(
    t,
    me == 0u,
    params::defensePower(),
    params::neutralDefense(),
  );
  let flip = conquers(
    pressure, attackerOf(a), me, defense,
    params::flipMargin(), sim::rand(x, y), params::flipChance(),
  );
  if (flip) {
    return clamp(pressure * params::conquestGarrison(), 0.05, 1.0);
  }
  if (me == 0u) { return 0.0; }

  var v = t + params::regen() * (1.0 - t);
  v -= pressure * params::attrition();
  let p = players::val(me);
  if (p.attacking == 1u && layers::owner::any8_ne(x, y, me)) {
    v -= params::commitDrain() * p.commit;
  }
  return clamp(v, 0.0, 1.0);
}
