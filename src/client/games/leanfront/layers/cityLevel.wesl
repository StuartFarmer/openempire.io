import package::layers;
import package::players;
import package::playerOutputs;

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  var next = layers::cityLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let action = players::val(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (action.actionKind == 1u && i == playerOutputs::spawnCityTile(p)) {
      next = playerOutputs::resolvedLevel(p);
    } else if (i == action.actionTile &&
        (action.actionKind == 2u || action.actionKind == 4u)) {
      next = playerOutputs::resolvedLevel(p);
    }
  }
  return next;
}
