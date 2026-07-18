// shared::combat — conquest resolution. Pure helpers (values-as-args); each
// system passes its own balance parameters. Two defense formulas and two
// conquest rules, so a game picks the shape it wants and both its owner/troops
// passes call the SAME function (their flip decisions must agree).

// Additive defense: garrison + a militia levy from civilians + a terrain
// bonus (steeper ground defends better) + a small floor. Neutral land is
// cheap to claim (a low fixed bar).
fn defenseOf(
  troops: f32, pop: f32, elevation: f32, isNeutral: bool,
  neutralDefense: f32, militiaFrac: f32, terrainDefense: f32,
) -> f32 {
  let held = troops + militiaFrac * pop + terrainDefense * elevation + 0.02;
  return select(held, neutralDefense, isNeutral);
}

// Multiplicative garrison defense: troops scaled by a defense-power factor
// (a leaner model than defenseOf), plus the neutral bar.
fn garrisonDefense(
  troops: f32, isNeutral: bool, defensePower: f32, neutralDefense: f32,
) -> f32 {
  return select(troops * defensePower + 0.02, neutralDefense, isNeutral);
}

// The deterministic conquest rule: an attacker takes the tile when its
// pressure CLEARLY beats the defense. The margin is hysteresis — it kills
// mutual-flip oscillation and holds a stable frontline.
fn conquers(
  pressure: f32, attacker: u32, owner: u32, defense: f32, margin: f32,
) -> bool {
  return attacker != 0u && attacker != owner && pressure > defense * margin;
}

// Stochastic variant: a per-tile roll gates the advance speed for messier,
// more emergent fronts. The roll must be deterministic per (seed, tick, tile)
// so the owner and troops passes see the same outcome.
fn conquersStochastic(
  pressure: f32, attacker: u32, owner: u32, defense: f32,
  margin: f32, roll: f32, chance: f32,
) -> bool {
  return attacker != 0u && attacker != owner
    && pressure > defense * margin && roll < chance;
}
