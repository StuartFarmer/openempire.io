import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
import package::lib::economy::gompertz;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerLoss, attackerOf, pressureOf};

fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }

fn update(x: i32, y: i32, i: u32) -> f32 {
  let me = layers::owner::val(i);
  let old = layers::troops::val(i);
  let attack = layers::incursion::val(i);
  let pressure = pressureOf(attack);
  let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
  let defense = defenseOf(old, mag, me == 0u, params::neutralDefense(),
    params::terrainWeight());
  var next = old;
  if (conquers(pressure, attackerOf(attack), me, defense,
      params::flipMargin())) {
    next = max(0.03, pressure * params::conquestGarrison());
  } else if (me != 0u && pressure > 0.0) {
    next = max(0.0, next - params::attrition() *
      attackerLoss(old, pressure, mag) * 0.02);
  }

  var city = layers::cityLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (action.actionKind == 4u) {
      if (i != action.actionTile) { continue; }
      city = 0u;
      next = 0.0;
    } else if (action.actionKind == 1u) {
      if (i != playerOutputs::spawnCityTile(p)) { continue; }
      city = 1u;
      next = params::seedFraction() * params::cityCapacityPerLevel();
    } else if (action.actionKind == 2u) {
      if (i != action.actionTile) { continue; }
      if (city == 0u) {
        next = params::seedFraction() * params::cityCapacityPerLevel();
      }
      city = playerOutputs::resolvedLevel(p);
    }
  }
  if (city == 0u) { return next; }
  return gompertz(next, f32(city) * params::cityCapacityPerLevel(),
    params::cityGrowthRate());
}
