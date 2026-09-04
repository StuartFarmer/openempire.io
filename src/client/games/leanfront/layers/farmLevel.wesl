import package::kernel::{GRID, OFF, inBounds, refOf};
import package::params;
import package::layers;
import package::players;
import package::sim;
import package::lib::economy::{ActionDecision, decideAction};

fn firstLandNeighbor(tile: u32) -> u32 {
  let tx = i32(tile % GRID.size.x);
  let ty = i32(tile / GRID.size.x);
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(tx, ty) + OFF[k];
    if (inBounds(n.x, n.y) && layers::land::at(n.x, n.y) != 0.0) {
      return refOf(n.x, n.y);
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
    firstLandNeighbor(targetTile) != 0xffffffffu, sim::scalar_tilesOwned(p),
    sim::scalar_totalFood(p), params::cityCapacityPerLevel(),
    params::farmCapacityPerLevel(), params::cityLevelCost(),
    params::farmLevelCost(), params::razeCost(),
  );
}

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  var next = layers::farmLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    let d = actionFor(p);
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && i == firstLandNeighbor(action.actionTile)) {
      next = 1u;
    } else if (i == action.actionTile &&
        (action.actionKind == 3u || action.actionKind == 4u)) {
      next = d.nextFarmLevel;
    }
  }
  return next;
}
