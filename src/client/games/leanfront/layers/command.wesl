import package::params::{cityCapacityPerLevel, farmCapacityPerLevel, cityLevelCost, farmLevelCost, razeCost};
import package::layers::{land, owner, cityLevel, farmLevel};
import package::players;
import package::players::{val, count};
import package::playerOutputs;
import package::sim;
import package::sim::{tick, scalar_tilesOwned, scalar_totalFood};
import package::lib::actions::resolveAction;

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (i == 0u || i >= players::count()) { return 0u; }

  let action = players::val(i);
  let resolved = resolveAction(i);
  let d = resolved.decision;
  var level = 0u;
  if (action.actionKind == 1u || action.actionKind == 2u) {
    level = d.nextCityLevel;
  } else if (action.actionKind == 3u) {
    level = d.nextFarmLevel;
  }

  playerOutputs::set_resolvedResult(i, d.result);
  playerOutputs::set_resolvedCostFx(i, d.costFx);
  playerOutputs::set_resolvedLevel(i, level);
  playerOutputs::set_spawnCityTile(i, resolved.spawnCityTile);
  playerOutputs::set_spawnFarmTile(i, resolved.spawnFarmTile);
  if (action.actionTick == sim::tick()) {
    playerOutputs::set_actionResult(i, (sim::tick() << 8u) | d.result);
  }
  return d.result;
}
