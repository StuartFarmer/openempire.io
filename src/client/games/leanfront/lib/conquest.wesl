fn packAttack(attacker: u32, pressure: f32) -> u32 {
  return (attacker << 24u) | min(u32(max(pressure, 0.0) * 4096.0), 0xffffffu);
}

fn attackerOf(a: u32) -> u32 { return a >> 24u; }
fn pressureOf(a: u32) -> f32 { return f32(a & 0xffffffu) / 4096.0; }

fn terrainMag(elevation: f32, seaLevel: f32) -> f32 {
  let above = clamp((elevation - seaLevel) / max(0.01, 1.0 - seaLevel), 0.0, 1.0);
  if (above < 0.323) { return 0.80; }
  if (above < 0.645) { return 1.00; }
  return 1.20;
}

fn defenseOf(troops: f32, mag: f32, isNeutral: bool,
             neutralDefense: f32, terrainWeight: f32) -> f32 {
  let terrain = terrainWeight * mag;
  return select(troops + terrain + 0.02, neutralDefense + terrain, isNeutral);
}

fn attackerLoss(attackTroops: f32, defenderTroops: f32, mag: f32) -> f32 {
  let ratio = clamp(defenderTroops / max(1e-4, attackTroops), 0.6, 2.0);
  return ratio * mag * 0.8;
}

fn conquers(pressure: f32, attacker: u32, owner: u32,
            defense: f32, margin: f32) -> bool {
  return attacker != 0u && attacker != owner && pressure > defense * margin;
}
