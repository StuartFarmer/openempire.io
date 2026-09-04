import package::kernel::{GRID, OFF, inBounds, refOf};
import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
import package::sim;
import package::lib::economy::{ActionDecision, decideAction, gompertz, toFx, attackCommit};
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

fn effectiveCommit(p: u32) -> f32 {
  let intent = players::val(p);
  if (intent.alive == 0u || intent.attacking == 0u) { return 0.0; }
  let totalFx = toFx(sim::scalar_totalFood(p));
  let costFx = min(totalFx, actionFor(p).costFx);
  return attackCommit(intent.commit, sim::scalar_totalPeople(p),
    f32(totalFx - costFx) / 256.0, params::attackCostPerPerson());
}

fn attackCostFx(p: u32) -> u32 {
  return toFx(effectiveCommit(p) * sim::scalar_totalPeople(p) *
    params::attackCostPerPerson());
}

fn spendFx(p: u32) -> u32 {
  let totalFx = toFx(sim::scalar_totalFood(p));
  return min(totalFx, actionFor(p).costFx + attackCostFx(p));
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
    let d = actionFor(p);
    if (d.result != 1u) { continue; }
    if (action.actionKind == 1u && i == firstSpawnFarmTile(action.actionTile)) {
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
