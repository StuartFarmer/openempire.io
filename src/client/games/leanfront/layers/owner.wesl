import package::kernel::GRID;
import package::params;
import package::params::{cityCapacityPerLevel, farmCapacityPerLevel, cityLevelCost, farmLevelCost, razeCost};
import package::layers;
import package::layers::{land, owner, cityLevel, farmLevel};
import package::players;
import package::players::{val, count};
import package::playerOutputs;
import package::sim;
import package::sim::{tick, scalar_tilesOwned, scalar_totalFood};
import package::lib::actions::resolveAction;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerOf, pressureOf};

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

  var spawnClaimed = false;
  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    let resolved = resolveAction(p);
    let d = resolved.decision;
    let cells = GRID.size.x * GRID.size.y;
    let validTile = action.actionTile < cells;
    if (action.actionTick == sim::tick() &&
        ((validTile && i == action.actionTile) || (!validTile && i == 0u))) {
      playerOutputs::set_actionResult(p, (sim::tick() << 8u) | d.result);
    }
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && layers::land::val(i) != 0.0) {
      let tx = i32(resolved.spawnCityTile % GRID.size.x);
      let ty = i32(resolved.spawnCityTile / GRID.size.x);
      let dx = x - tx;
      let dy = y - ty;
      if (dx * dx + dy * dy <= 25 && !spawnClaimed) {
        next = p;
        spawnClaimed = true;
      }
    } else if (action.actionKind == 4u && i == action.actionTile) {
      next = 0u;
    }
  }
  return next;
}
