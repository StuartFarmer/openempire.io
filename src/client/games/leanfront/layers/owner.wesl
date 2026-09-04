import package::kernel::{GRID, OFF, inBounds, refOf};
import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
import package::sim;
import package::lib::economy::{ActionDecision, decideAction};
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerOf, pressureOf};

fn firstSpawnFarmTile(tile: u32) -> u32 {
  let tx = i32(tile % GRID.size.x);
  let ty = i32(tile / GRID.size.x);
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(tx, ty) + OFF[k];
    if (!inBounds(n.x, n.y) || layers::land::at(n.x, n.y) == 0.0) { continue; }
    let neighbor = refOf(n.x, n.y);
    if (layers::owner::val(neighbor) == 0u &&
        layers::cityLevel::val(neighbor) == 0u &&
        layers::farmLevel::val(neighbor) == 0u) {
      return neighbor;
    }
  }
  return 0xffffffffu;
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
    firstSpawnFarmTile(targetTile) != 0xffffffffu, sim::scalar_tilesOwned(p),
    sim::scalar_totalFood(p), params::cityCapacityPerLevel(),
    params::farmCapacityPerLevel(), params::cityLevelCost(),
    params::farmLevelCost(), params::razeCost(),
  );
}

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  let me = layers::owner::val(i);
  var next = me;
  if (layers::land::val(i) != 0.0) {
    let attack = layers::incursion::val(i);
    let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
    let defense = defenseOf(layers::troops::val(i), mag, me == 0u,
      params::neutralDefense(), params::terrainWeight());
    if (conquers(pressureOf(attack), attackerOf(attack), me, defense,
        params::flipMargin())) {
      next = attackerOf(attack);
    }
  } else {
    next = 0u;
  }

  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    let d = actionFor(p);
    let cells = GRID.size.x * GRID.size.y;
    let validTile = action.actionTile < cells;
    if (action.actionTick == sim::tick() &&
        ((validTile && i == action.actionTile) || (!validTile && i == 0u))) {
      playerOutputs::set_actionResult(p, (sim::tick() << 8u) | d.result);
    }
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && layers::land::val(i) != 0.0) {
      let tx = i32(action.actionTile % GRID.size.x);
      let ty = i32(action.actionTile / GRID.size.x);
      let dx = x - tx;
      let dy = y - ty;
      if (dx * dx + dy * dy <= 25) { next = p; }
    } else if (action.actionKind == 4u && i == action.actionTile) {
      next = 0u;
    }
  }
  return next;
}
