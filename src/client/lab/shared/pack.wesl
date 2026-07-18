// shared::pack — attacker+pressure bit-packing into one u32.
// bits 24..31 = attacker id, bits 0..23 = pressure in 1/4096 units. Shared so
// every system that reads or writes a packed-claim layer agrees on the layout.
// Pure helpers (values-as-args), per the lib convention.

fn packAttack(attacker: u32, pressure: f32) -> u32 {
  return (attacker << 24u) | min(u32(max(pressure, 0.0) * 4096.0), 0xffffffu);
}

fn attackerOf(a: u32) -> u32 {
  return a >> 24u;
}

fn pressureOf(a: u32) -> f32 {
  return f32(a & 0xffffffu) / 4096.0;
}
