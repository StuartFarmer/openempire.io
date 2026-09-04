// shared::growth — common population/resource dynamics. Pure (values-as-args).

// Logistic growth toward a carrying capacity.
fn logistic(v: f32, rate: f32, capacity: f32) -> f32 {
  return v + rate * v * (1.0 - v / max(capacity, 1e-4));
}

// Exponential decay by a per-tick fraction.
fn decay(v: f32, rate: f32) -> f32 {
  return v * (1.0 - rate);
}

// Resource-limited growth: grow proportional to available food (0..1), capped.
fn grow(v: f32, rate: f32, food: f32) -> f32 {
  return v + rate * v * clamp(food, 0.0, 1.0);
}
