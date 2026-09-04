import package::players;
import package::playerOutputs;

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (i == 0u || i >= players::count()) { return 0u; }
  let actionKind = playerOutputs::resolvedActionKind(i);
  let d = playerOutputs::resolvedResult(i);
  if (actionKind == 1u && d == 1u) {
    playerOutputs::set_hasSpawned(i, 1u);
    return 1u;
  }
  return playerOutputs::hasSpawned(i);
}
