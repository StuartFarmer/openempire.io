// Conquest combat, ported from OpenFront's core sim (Config.attackLogic /
// terrainType). System-specific rules — kept in the game's own lib, not shared.
// Values-as-args (registry imports are scanned only in layer/view files).

// The `incursion` layer packs (attacker id, pressure) into one u32:
// bits 24..31 = attacker, bits 0..23 = pressure in 1/4096 units.
fn packAttack(attacker: u32, pressure: f32) -> u32 {
  return (attacker << 24u) | min(u32(max(pressure, 0.0) * 4096.0), 0xffffffu);
}

fn attackerOf(a: u32) -> u32 {
  return a >> 24u;
}

fn pressureOf(a: u32) -> f32 {
  return f32(a & 0xffffffu) / 4096.0;
}

// Terrain type → attack DEFENSE magnitude, ported from OpenFront:
//   magnitude < 10  → Plains   (mag 80)
//   magnitude < 20  → Highland (mag 100)
//   else            → Mountain (mag 120)
// The terrain base gives elevation in 0..1; height above sea maps to those
// thresholds (10/31, 20/31). Returned normalized (mag / 100) as a defense
// multiplier: mountains cost more, plains less.
fn terrainMag(elevation: f32, seaLevel: f32) -> f32 {
  let above = clamp((elevation - seaLevel) / max(0.01, 1.0 - seaLevel), 0.0, 1.0);
  if (above < 0.323) { return 0.80; }
  if (above < 0.645) { return 1.00; }
  return 1.20;
}

// Terrain type → advance SPEED, ported from OpenFront (Plains 16.5, Highland
// 20, Mountain 25), normalized (speed / 20). Higher ground advances slower.
fn terrainSpeed(elevation: f32, seaLevel: f32) -> f32 {
  let above = clamp((elevation - seaLevel) / max(0.01, 1.0 - seaLevel), 0.0, 1.0);
  if (above < 0.323) { return 0.825; }
  if (above < 0.645) { return 1.0; }
  return 1.25;
}

// Defense of a tile: owned land defends with its garrison + a militia levy
// from civilians + the terrain, plus a floor; neutral land is a low bar the
// terrain still stiffens (a mountain resists even an unclaimed grab).
fn defenseOf(
  troops: f32, pop: f32, mag: f32, isNeutral: bool,
  neutralDefense: f32, militiaFrac: f32, terrainWeight: f32,
) -> f32 {
  let terrain = terrainWeight * mag;
  let held = troops + militiaFrac * pop + terrain + 0.02;
  return select(held, neutralDefense + terrain, isNeutral);
}

// OpenFront's troop-ratio attacker loss shape (Config.attackLogic): the closer
// the forces, the costlier the attack — within(defender/attacker, 0.6, 2)·mag.
// Per-tile garrison stands in for OpenFront's per-player troops/tile.
fn attackerLoss(attackTroops: f32, defenderTroops: f32, mag: f32) -> f32 {
  let ratio = clamp(defenderTroops / max(1e-4, attackTroops), 0.6, 2.0);
  return ratio * mag * 0.8;
}

// The conquest rule — deterministic with a hysteresis margin so the front is
// stable (no mutual-flip oscillation). Both owner and troops call it, so their
// flip decisions agree.
fn conquers(
  pressure: f32, attacker: u32, owner: u32, defense: f32, margin: f32,
) -> bool {
  return attacker != 0u && attacker != owner && pressure > defense * margin;
}
