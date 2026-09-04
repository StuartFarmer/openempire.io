import package::layers;
import package::players;
import package::playerOutputs;

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  var next = layers::farmLevel::val(i);
  for (var p = 1u; p < players::count(); p += 1u) {
    let actionKind = playerOutputs::resolvedActionKind(p);
    let actionTile = playerOutputs::resolvedActionTile(p);
    if (playerOutputs::resolvedResult(p) != 1u) { continue; }
    if (actionKind == 1u && i == playerOutputs::spawnFarmTile(p)) {
      next = 1u;
    } else if (i == actionTile && (actionKind == 3u || actionKind == 4u)) {
      next = playerOutputs::resolvedLevel(p);
    }
  }
  return next;
}
