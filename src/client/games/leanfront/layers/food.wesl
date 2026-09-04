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
import package::lib::economy::{gompertz, toFx, attackCommit};
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerOf, pressureOf};

fn effectiveCommit(p: u32) -> f32 {
  let intent = players::val(p);
  if (intent.alive == 0u || intent.attacking == 0u) { return 0.0; }
  let totalFx = toFx(sim::scalar_totalFood(p));
  let costFx = min(totalFx, resolveAction(p).decision.costFx);
  return attackCommit(intent.commit, sim::scalar_totalPeople(p),
    f32(totalFx - costFx) / 256.0, params::attackCostPerPerson());
}

fn attackCostFx(p: u32) -> u32 {
  return toFx(effectiveCommit(p) * sim::scalar_totalPeople(p) *
    params::attackCostPerPerson());
}

fn spendFx(p: u32) -> u32 {
  let totalFx = toFx(sim::scalar_totalFood(p));
  return min(totalFx, resolveAction(p).decision.costFx + attackCostFx(p));
}

fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }

fn update(x: i32, y: i32, i: u32) -> f32 {
  for (var p = 1u; p < players::count(); p += 1u) {
    if (i == p) { playerOutputs::set_foodSpendFx(p, spendFx(p)); }
  }

  let me = layers::owner::val(i);
  var next = layers::food::val(i);
  if (me != 0u) {
    let totalFx = toFx(sim::scalar_totalFood(me));
    let spent = spendFx(me);
    let keep = select(1.0, f32(totalFx - spent) / f32(totalFx), totalFx > 0u);
    next = max(0.0, next * keep);
  }

  var farm = layers::farmLevel::val(i);
  let attack = layers::incursion::val(i);
  let mag = terrainMag(layers::elevation::val(i), params::seaLevel());
  let defense = defenseOf(layers::troops::val(i), mag, me == 0u,
    params::neutralDefense(), params::terrainWeight());
  if (farm != 0u && conquers(pressureOf(attack), attackerOf(attack), me,
      defense, params::flipMargin())) {
    next = params::seedFraction() * params::farmCapacityPerLevel();
  }

  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    let resolved = resolveAction(p);
    let d = resolved.decision;
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && i == resolved.spawnFarmTile) {
      farm = 1u;
      next = params::seedFraction() * params::farmCapacityPerLevel();
    } else if (i == action.actionTile && action.actionKind == 3u) {
      if (farm == 0u) {
        next = params::seedFraction() * params::farmCapacityPerLevel();
      }
      farm = d.nextFarmLevel;
    } else if (i == action.actionTile && action.actionKind == 4u) {
      farm = 0u;
      next = 0.0;
    }
  }
  if (farm == 0u) { return 0.0; }
  return gompertz(next, f32(farm) * params::farmCapacityPerLevel(),
    params::farmGrowthRate());
}
