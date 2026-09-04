import package::params;
import package::layers::{land, owner, cityLevel, farmLevel};
import package::players;
import package::players::{val, count};
import package::playerOutputs;
import package::sim;
import package::sim::{tick, scalar_tilesOwned, scalar_totalFood, scalar_totalPeople};
import package::lib::actions::resolveAction;
import package::lib::economy::{toUiFx, attackCommit};

struct ResolvedBudget {
  spend: f32,
  inverseTotal: f32,
  commit: f32,
}

fn resolvedBudget(player: u32, discreteCostFx: u32) -> ResolvedBudget {
  let intent = players::val(player);
  let total = max(0.0, sim::scalar_totalFood(player));
  let reserved = min(total, f32(discreteCostFx) / 256.0);
  let available = max(0.0, total - reserved);
  let attacking = intent.alive != 0u && intent.attacking != 0u;
  let commit = select(0.0, attackCommit(
    intent.commit, sim::scalar_totalPeople(player), available,
    params::attackCostPerPerson(),
  ), attacking);
  let attackSpend = max(0.0, commit * sim::scalar_totalPeople(player) *
    params::attackCostPerPerson());
  let spend = min(total, reserved + attackSpend);
  var inverseTotal = 0.0;
  if (total > 0.0) { inverseTotal = 1.0 / total; }
  return ResolvedBudget(spend, inverseTotal, commit);
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
  let budget = resolvedBudget(i, d.costFx);
  // foodSpendFx is UI-only and saturates; state transitions use the wide f32.
  playerOutputs::set_foodSpendFx(i, toUiFx(budget.spend));
  playerOutputs::set_foodSpendBits(i, bitcast<u32>(budget.spend));
  playerOutputs::set_foodInverseTotalBits(i, bitcast<u32>(budget.inverseTotal));
  playerOutputs::set_attackCommitBits(i, bitcast<u32>(budget.commit));
  if (action.actionTick == sim::tick()) {
    playerOutputs::set_actionResult(i, (sim::tick() << 8u) | d.result);
  }
  return d.result;
}
