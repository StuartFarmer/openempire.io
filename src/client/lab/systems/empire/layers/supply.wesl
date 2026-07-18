// Logistical reach — the field that decides what you can hold. Settled cores
// (owned tiles whose population clears the settlement threshold) radiate
// supply=1; it spreads to neighbors and decays with distance, paying an extra
// terrain cost over high ground (mountains gate reach). Population only grows,
// and troops only survive, where supply reaches — so an empire fills its
// supplied catchment and stalls beyond it.
import package::params;
import package::layers;

fn init(x: i32, y: i32, i: u32) -> f32 {
  return 0.0;
}

fn update(x: i32, y: i32, i: u32) -> f32 {
  if (layers::land::val(i) == 0.0) {
    return 0.0;
  }
  let settled = layers::owner::val(i) != 0u &&
    layers::pop::val(i) > params::settleThreshold();
  let source = select(0.0, 1.0, settled);
  let cost = params::supplyStep() +
    params::supplyMountainCost() * layers::elevation::val(i);
  let spread = layers::supply::avg8(x, y) - cost;
  return clamp(max(source, spread), 0.0, 1.0);
}
