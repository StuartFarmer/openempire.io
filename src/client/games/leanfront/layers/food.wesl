import package::params;
import package::layers;
import package::playerOutputs;
import package::lib::economy::gompertz;
import package::lib::conquest::{terrainMag, defenseOf, conquers, attackerOf, pressureOf};

fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }

fn update(x: i32, y: i32, i: u32) -> f32 {
  let me = layers::owner::val(i);
  var next = layers::food::val(i);
  if (me != 0u) {
    let keep = bitcast<f32>(playerOutputs::foodKeepBits(me));
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

  for (var p = 1u; p < 5u; p += 1u) {
    let actionKind = playerOutputs::resolvedActionKind(p);
    let actionTile = playerOutputs::resolvedActionTile(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (actionKind == 1u && i == playerOutputs::spawnFarmTile(p)) {
      farm = 1u;
      next = params::seedFraction() * params::farmCapacityPerLevel();
    } else if (i == actionTile && actionKind == 3u) {
      if (farm == 0u) {
        next = params::seedFraction() * params::farmCapacityPerLevel();
      }
      farm = playerOutputs::resolvedLevel(p);
    } else if (i == actionTile && actionKind == 4u) {
      farm = 0u;
      next = 0.0;
    }
  }
  if (farm == 0u) { return 0.0; }
  return gompertz(next, f32(farm) * params::farmCapacityPerLevel(),
    params::farmGrowthRate());
}
