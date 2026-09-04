import package::kernel::GRID;
import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
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
    let actionKind = playerOutputs::resolvedActionKind(p);
    let actionTile = playerOutputs::resolvedActionTile(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (actionKind == 1u && layers::land::val(i) != 0.0) {
      let spawnCity = playerOutputs::spawnCityTile(p);
      let tx = i32(spawnCity % GRID.size.x);
      let ty = i32(spawnCity / GRID.size.x);
      let dx = x - tx;
      let dy = y - ty;
      if (dx * dx + dy * dy <= 25 && !spawnClaimed) {
        next = p;
        spawnClaimed = true;
      }
    } else if (actionKind == 4u && i == actionTile) {
      next = 0u;
    }
  }
  return next;
}
