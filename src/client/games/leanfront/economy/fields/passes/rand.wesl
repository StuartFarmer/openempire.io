// The SIMULATION'S random number generator, transcribed for the GPU.
//
// `PseudoRandom` (src/core/PseudoRandom.ts) is sfc32 seeded by four rounds of
// splitmix32 and warmed up twelve steps. Every operation in it is a 32-bit
// integer op, chosen precisely so the sequence is identical across platforms —
// which is what makes this transcription possible at all. A generator built on
// float arithmetic could not be reproduced here.
//
// What is NOT reproduced is the seed. The CPU seeds each draw with
// `simpleHash("urban:<player id>:<tick>")` or
// `simpleHash("patch:<player id>:<tick>:<nucleus>")`, and the player id is a
// STRING — nothing the GPU holds. So the CPU computes the seeds (one per
// player, one per district, both O(entities) and trivially cheap) and uploads
// them; the GPU owns only the stream.
//
// Only `next()` is ported. `nextInt`/`nextID` and the rest of the class have no
// caller here, and an unported method cannot silently disagree.

/** sfc32 state — the same four words the CPU class holds. */
struct Rng {
  s0: u32,
  s1: u32,
  s2: u32,
  s3: u32,
}

/** One splitmix32 round, advancing `h` in place. WGSL's u32 arithmetic wraps
 *  and its `>>` on u32 is logical, so this is `Math.imul` and `>>>` exactly. */
fn splitmix(h: ptr<function, u32>) -> u32 {
  *h = *h + 0x9e3779b9u;
  var t = *h ^ (*h >> 16u);
  t = t * 0x21f0aaadu;
  t = t ^ (t >> 15u);
  t = t * 0x735a2d97u;
  return t ^ (t >> 15u);
}

/** The raw sfc32 word. `next()` is this over 2^32. */
fn rngNextU32(r: ptr<function, Rng>) -> u32 {
  let t = (*r).s0 + (*r).s1 + (*r).s3;
  (*r).s3 = (*r).s3 + 1u;
  (*r).s0 = (*r).s1 ^ ((*r).s1 >> 9u);
  (*r).s1 = (*r).s2 + ((*r).s2 << 3u);
  (*r).s2 = ((*r).s2 << 21u) | ((*r).s2 >> 11u);
  (*r).s2 = (*r).s2 + t;
  return t;
}

/** The constructor: four splitmix words, then twelve steps of warm-up to
 *  diffuse low-entropy seeds. The warm-up is load-bearing — the draw seeds are
 *  a string hash, which is exactly the low-entropy case it exists for. */
fn rngFromSeed(seed: u32) -> Rng {
  var h = seed;
  var r = Rng(0u, 0u, 0u, 0u);
  r.s0 = splitmix(&h);
  r.s1 = splitmix(&h);
  r.s2 = splitmix(&h);
  r.s3 = splitmix(&h);
  for (var i = 0u; i < 12u; i = i + 1u) {
    let _unused = rngNextU32(&r);
  }
  return r;
}

/** Uniform in [0,1), as `PseudoRandom.next()` returns it.
 *
 *  The CPU divides in f64 and this divides in f32, so the two values differ by
 *  up to one f32 ulp (~6e-8). MEASURED (task 1.8b): across 10,226 real draws,
 *  perturbing the draw by up to 1024 ulp changed no outcome, and the first
 *  changed outcome needs ~4096. The threshold walk has three orders of
 *  magnitude of slack over this. */
fn rngNext(r: ptr<function, Rng>) -> f32 {
  return f32(rngNextU32(r)) / 4294967296.0;
}

/** `rand.nextFloat(0, total)` — the only form either draw uses. */
fn rngNextFloat(r: ptr<function, Rng>, total: f32) -> f32 {
  return rngNext(r) * total;
}
