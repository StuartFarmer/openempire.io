import package::kernel::GRID;
import package::layers;
import package::layers::{land, owner, cityLevel, farmLevel};
import package::params::{cityCapacityPerLevel, farmCapacityPerLevel, cityLevelCost, farmLevelCost, razeCost};
import package::players;
import package::players::{val, count};
import package::sim::{tick, scalar_tilesOwned, scalar_totalFood};
import package::lib::actions::resolveAction;

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  var next = layers::farmLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    let resolved = resolveAction(p);
    let d = resolved.decision;
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && i == resolved.spawnFarmTile) {
      next = 1u;
    } else if (i == action.actionTile &&
        (action.actionKind == 3u || action.actionKind == 4u)) {
      next = d.nextFarmLevel;
    }
  }
  return next;
}
