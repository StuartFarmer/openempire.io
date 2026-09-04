import package::kernel::{GRID, OFF, inBounds};
import package::params;
import package::layers;
import package::players;
import package::sim;
import package::lib::economy::{ActionDecision, decideAction, gompertz};
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerLoss, attackerOf, pressureOf};

fn hasLandNeighbor(tile: u32) -> bool {
  let tx = i32(tile % GRID.size.x);
  let ty = i32(tile / GRID.size.x);
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(tx, ty) + OFF[k];
    if (inBounds(n.x, n.y) && layers::land::at(n.x, n.y) != 0.0) {
      return true;
    }
  }
  return false;
}

fn actionFor(p: u32) -> ActionDecision {
  let action = players::val(p);
  let cells = GRID.size.x * GRID.size.y;
  let valid = action.actionTile < cells;
  let targetTile = min(action.actionTile, cells - 1u);
  return decideAction(
    p, action.actionKind, action.actionTile, action.actionTick, sim::tick(), valid,
    layers::land::val(targetTile), layers::owner::val(targetTile),
    layers::cityLevel::val(targetTile), layers::farmLevel::val(targetTile),
    hasLandNeighbor(targetTile), sim::scalar_tilesOwned(p),
    sim::scalar_totalFood(p), params::cityCapacityPerLevel(),
    params::farmCapacityPerLevel(), params::cityLevelCost(),
    params::farmLevelCost(), params::razeCost(),
  );
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
    let d = actionFor(p);
    if (d.result != 1u || i != action.actionTile) { continue; }
    if (action.actionKind == 4u) {
      city = 0u;
      next = 0.0;
    } else if (action.actionKind == 1u) {
      city = 1u;
      next = params::seedFraction() * params::cityCapacityPerLevel();
    } else if (action.actionKind == 2u) {
      if (city == 0u) {
        next = params::seedFraction() * params::cityCapacityPerLevel();
      }
      city = d.nextCityLevel;
    }
  }
  if (city == 0u) { return next; }
  return gompertz(next, f32(city) * params::cityCapacityPerLevel(),
    params::cityGrowthRate());
}
