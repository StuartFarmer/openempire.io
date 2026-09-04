// Pure combat helpers shared by the territory layers. Lib modules take all
// values as arguments (registry imports are scanned only in layer/view files).

// The attack layer packs (attacker id, pressure) into one u32:
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

// The single conquest rule, used identically by the owner and troops layers
// so their flip decisions always agree. The margin is hysteresis (an attack
// must clearly beat the defense, killing mutual-flip oscillation); the roll
// is a per-tile stochastic gate that sets the front's advance speed —
// deterministic per (seed, tick, tile), so both layers see the same outcome.
fn defenseOf(troops: f32, isNeutral: bool, defensePower: f32, neutralDefense: f32) -> f32 {
  return select(troops * defensePower + 0.02, neutralDefense, isNeutral);
}

fn conquers(pressure: f32, attacker: u32, owner: u32, defense: f32, margin: f32, roll: f32, chance: f32) -> bool {
  return attacker != 0u && attacker != owner && pressure > defense * margin && roll < chance;
}
