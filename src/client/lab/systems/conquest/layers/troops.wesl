// The army — mobilized population. On owned land troops regenerate toward the
// player's mobilization × the local population (fertile land raises a bigger
// army), and bleed to enemy pressure at a rate that rises as the forces near
// parity (OpenFront's troop-ratio loss). A conquered tile starts with a
// garrison carved from the winning pressure. Same phase + rule as `owner`.
import package::params;
import package::layers;
import package::players;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerLoss, attackerOf, pressureOf};

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) { return 0.0; }
  let me = layers::owner::val(i);
  let t = layers::troops::val(i);
  let a = layers::incursion::val(i);
  let pressure = pressureOf(a);
  let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
  let defense = defenseOf(
    t, layers::pop::val(i), mag, me == 0u,
    params::neutralDefense(), params::militiaFrac(), params::terrainWeight(),
  );
  if (conquers(pressure, attackerOf(a), me, defense, params::flipMargin())) {
    return clamp(pressure * params::conquestGarrison(), 0.03, 1.0);
  }
  if (me == 0u) { return clamp(t * 0.95, 0.0, 1.0); }

  let p = players::val(me);
  let mobTarget = p.commit * layers::pop::val(i);
  var v = t;
  v += params::mobilizeRate() * (mobTarget - t);
  // OpenFront troop-ratio loss: costlier the closer the forces (mag-scaled).
  v -= params::attrition() * attackerLoss(t, pressure, mag) * 0.02;
  return clamp(v, 0.0, 1.0);
}
