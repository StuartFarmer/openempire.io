// Combat helpers for the empire layers. Lib modules take all values as
// arguments (registry imports are scanned only in layer/view files).
//
// The `incursion` layer packs (attacker id, pressure) into one u32:
// bits 24..31 = attacker, bits 0..23 = pressure in 1/4096 units — same
// encoding as the territory prototype.

fn packAttack(attacker: u32, pressure: f32) -> u32 {
  return (attacker << 24u) | min(u32(max(pressure, 0.0) * 4096.0), 0xffffffu);
}

fn attackerOf(a: u32) -> u32 {
  return a >> 24u;
}

fn pressureOf(a: u32) -> f32 {
  return f32(a & 0xffffffu) / 4096.0;
}

// Defense of a tile: neutral land is cheap to claim (a low fixed bar); owned
// land defends with its garrison, a militia levy from its civilians, a
// terrain bonus (steeper ground is harder), plus a small floor.
fn defenseOf(
  troops: f32, pop: f32, elevation: f32, isNeutral: bool,
  neutralDefense: f32, militiaFrac: f32, terrainDefense: f32,
) -> f32 {
  let held = troops + militiaFrac * pop + terrainDefense * elevation + 0.02;
  return select(held, neutralDefense, isNeutral);
}

// The single conquest rule, used identically by the owner and troops layers
// so their flip decisions always agree. DETERMINISTIC: an attacker takes the
// tile when its pressure clearly beats the defense — the margin is hysteresis
// that kills mutual-flip oscillation and holds a stable frontline.
fn conquers(pressure: f32, attacker: u32, owner: u32, defense: f32, margin: f32) -> bool {
  return attacker != 0u && attacker != owner && pressure > defense * margin;
}

// STOCHASTIC ALTERNATIVE (documented, NOT wired in — see the add-age-of-food
// spec). Probabilistic capture weighted by the force ratio, gated by a
// deterministic per-(seed,tick,tile) roll shared across the owner/troops
// passes so they agree. Swap this in for `conquers` to A/B test messier,
// more emergent frontlines:
//
//   fn conquersStochastic(pressure, attacker, owner, defense, margin, roll, chance) -> bool {
//     return attacker != 0u && attacker != owner
//       && pressure > defense * margin && roll < chance;
//   }
