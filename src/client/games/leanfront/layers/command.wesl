import package::params;
import package::layers::{land, owner, cityLevel, farmLevel};
import package::players;
import package::players::{val, count};
import package::playerOutputs;
import package::sim;
import package::sim::{tick, scalar_tilesOwned, scalar_totalFood, scalar_totalPeople};
import package::lib::actions::resolveAction;
import package::lib::economy::{toFx, attackCommit};

fn resolvedSpendFx(player: u32, discreteCostFx: u32) -> u32 {
  let intent = players::val(player);
  let totalFx = toFx(sim::scalar_totalFood(player));
  let reservedFx = min(totalFx, discreteCostFx);
  let available = f32(totalFx - reservedFx) / 256.0;
  let attacking = intent.alive != 0u && intent.attacking != 0u;
  let commit = select(0.0, attackCommit(
    intent.commit, sim::scalar_totalPeople(player), available,
    params::attackCostPerPerson(),
  ), attacking);
  let attackFx = toFx(commit * sim::scalar_totalPeople(player) *
    params::attackCostPerPerson());
  return select(reservedFx + attackFx, totalFx,
    attackFx > totalFx - reservedFx);
}

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
  playerOutputs::set_resolvedActionKind(i, action.actionKind);
  playerOutputs::set_resolvedActionTile(i, action.actionTile);
  playerOutputs::set_spawnCityTile(i, resolved.spawnCityTile);
  playerOutputs::set_spawnFarmTile(i, resolved.spawnFarmTile);
  let spendFx = resolvedSpendFx(i, d.costFx);
  let totalFx = toFx(sim::scalar_totalFood(i));
  let keep = select(1.0, f32(totalFx - spendFx) / f32(totalFx), totalFx > 0u);
  playerOutputs::set_foodSpendFx(i, spendFx);
  playerOutputs::set_foodKeepBits(i, bitcast<u32>(keep));
  if (action.actionTick == sim::tick()) {
    playerOutputs::set_actionResult(i, (sim::tick() << 8u) | d.result);
  }
  return d.result;
}
