// Shared WGSL noise stack: bit-exact port of the CPU world engine's hash
// (Math.imul semantics via u32 arithmetic), smoothstep value noise, and fbm.
// Used by the worldgen prelude and the FieldDynamics prelude.
export const NOISE_WGSL = /* wgsl */ `
fn hash01(seed: i32, x: i32, y: i32) -> f32 {
  var h = bitcast<u32>(seed);
  h ^= bitcast<u32>(x) * 374761393u;
  h ^= bitcast<u32>(y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967295.0;
}

fn sstep(t: f32) -> f32 { return t * t * (3.0 - 2.0 * t); }

fn valueNoise(seed: i32, x: f32, y: f32, frequency: f32) -> f32 {
  let sx = x * frequency;
  let sy = y * frequency;
  let x0 = floor(sx);
  let y0 = floor(sy);
  let tx = sstep(sx - x0);
  let ty = sstep(sy - y0);
  let xi = i32(x0);
  let yi = i32(y0);
  let a = hash01(seed, xi, yi);
  let b = hash01(seed, xi + 1, yi);
  let c = hash01(seed, xi, yi + 1);
  let d = hash01(seed, xi + 1, yi + 1);
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

fn fbm(seed: i32, x: f32, y: f32, baseFrequency: f32, octaves: i32, persistence: f32) -> f32 {
  var total = 0.0;
  var amplitude = 1.0;
  var maxAmplitude = 0.0;
  var frequency = baseFrequency;
  for (var i = 0; i < octaves; i += 1) {
    total += valueNoise(seed + i * 1013, x, y, frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2.0;
  }
  return total / maxAmplitude;
}
`;
