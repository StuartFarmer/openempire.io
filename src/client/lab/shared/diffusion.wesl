// shared::diffusion — one relaxation/spread step. Pure (values-as-args).

// Move a fraction `rate` of the way from `prev` toward a neighborhood value
// `neigh` (pair with a layer's avg8/sum8 read). Rate 1 = full replace, 0 = hold.
fn blend(prev: f32, neigh: f32, rate: f32) -> f32 {
  return prev + rate * (neigh - prev);
}
