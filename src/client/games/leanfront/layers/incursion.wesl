import package::kernel::{GRID, OFF, inBounds, refOf};
import package::params;
import package::layers;
import package::players;
import package::playerOutputs;
import package::lib::conquest::packAttack;

fn effectiveCommit(p: u32) -> f32 {
  return bitcast<f32>(playerOutputs::attackCommitBits(p));
}

fn contribution(nx: i32, ny: i32, tx: i32, ty: i32) -> f32 {
  let o = layers::owner::at(nx, ny);
  if (o == 0u) { return 0.0; }
  let p = players::val(o);
  if (p.alive == 0u || p.attacking == 0u) { return 0.0; }
  let step = normalize(vec2f(f32(tx - nx), f32(ty - ny)));
  let toTarget = vec2f(p.targetX - f32(nx), p.targetY - f32(ny));
  let w = select(clamp(dot(normalize(toTarget), step), 0.0, 1.0), 0.5,
    length(toTarget) < 1.0);
  return layers::troops::at(nx, ny) * effectiveCommit(o) *
    params::attackPower() * (0.25 + 0.75 * w);
}

fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }

fn update(x: i32, y: i32, i: u32) -> u32 {
  if (layers::land::val(i) == 0.0) { return 0u; }
  let me = layers::owner::val(i);
  var bestAttacker = 0u;
  var bestPressure = 0.0;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    let o = layers::owner::at(n.x, n.y);
    if (o == 0u || o == me) { continue; }
    var seen = false;
    for (var j = 0; j < k; j += 1) {
      let m = vec2i(x, y) + OFF[j];
      if (inBounds(m.x, m.y) && layers::owner::at(m.x, m.y) == o) {
        seen = true;
        break;
      }
    }
    if (seen) { continue; }
    var total = 0.0;
    for (var j = k; j < 8; j += 1) {
      let m = vec2i(x, y) + OFF[j];
      if (inBounds(m.x, m.y) && layers::owner::at(m.x, m.y) == o) {
        total += contribution(m.x, m.y, x, y);
      }
    }
    if (total > bestPressure) {
      bestPressure = total;
      bestAttacker = o;
    }
  }
  return packAttack(bestAttacker, bestPressure);
}
