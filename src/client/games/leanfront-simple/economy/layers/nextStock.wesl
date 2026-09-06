import package::bindings::{P, stock, level, kind, nextStock};

fn tile(x: i32, y: i32, i: u32) {
  let capacity = P.capacityPerLevel * f32(level[i]);
  let current = f32(stock[i]);
  var next = current;
  if (current < capacity) {
    let rate = select(P.cityGrowthRate, P.farmGrowthRate, kind[i] == 2u);
    let growth = max(1.0, floor(rate * current * log(capacity / max(1.0, current))));
    next = min(capacity, current + growth);
  }
  nextStock[i] = u32(next);
}
