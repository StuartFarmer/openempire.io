import package::kernel::{OFF, inBounds};
import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
import package::lib::economy::gompertz;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerLoss, attackerOf, pressureOf};

const PEOPLE_MOVE_RATE: f32 = 0.08;

fn peopleMovement(x: i32, y: i32, owner: u32, stock: f32) -> f32 {
  if (owner == 0u) { return 0.0; }
  var neighborDifference = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y) || layers::owner::at(n.x, n.y) != owner) {
      continue;
    }
    neighborDifference += layers::troops::at(n.x, n.y) - stock;
  }
  return neighborDifference * PEOPLE_MOVE_RATE / 8.0;
}

fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }

fn update(x: i32, y: i32, i: u32) -> f32 {
  let me = layers::owner::val(i);
  let old = layers::troops::val(i);
  let attack = layers::incursion::val(i);
  let pressure = pressureOf(attack);
  let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
  let defense = defenseOf(old, mag, me == 0u, params::neutralDefense(),
    params::terrainWeight());
  var next = old + peopleMovement(x, y, me, old);
  if (conquers(pressure, attackerOf(attack), me, defense,
      params::flipMargin())) {
    next = max(0.03, pressure * params::conquestGarrison());
  } else if (me != 0u && pressure > 0.0) {
    next = max(0.0, next - params::attrition() *
      attackerLoss(old, pressure, mag) * 0.02);
  }

  var city = layers::cityLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let actionKind = playerOutputs::resolvedActionKind(p);
    let actionTile = playerOutputs::resolvedActionTile(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (actionKind == 4u) {
      if (i != actionTile) { continue; }
      city = 0u;
      next = 0.0;
    } else if (actionKind == 1u) {
      if (i != playerOutputs::spawnCityTile(p)) { continue; }
      city = 1u;
      next = params::seedFraction() * params::cityCapacityPerLevel();
    } else if (actionKind == 2u) {
      if (i != actionTile) { continue; }
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
