import package::bindings::{P, stock, level, kind, nextStock};

fn tile(x: i32, y: i32, i: u32) {
  let capacity = P.capacityPerLevel * level[i];
  let current = stock[i];
  var next = current;
  if (current < capacity) {
    let rate = select(P.cityGrowthRate, P.farmGrowthRate, kind[i] == 2u);
    let ratio = f32(capacity) / max(1.0, f32(current));
    let scaled = rate * f32(current);
    let raw = scaled * log(ratio);
    let growth = u32(max(1.0, floor(raw)));
    next = min(capacity, current + growth);
  }
  nextStock[i] = next;
}
