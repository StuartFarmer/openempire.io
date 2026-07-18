// World-engine palette (0..255 space) for the live terrain colorizer —
// pure data and helpers, safe for lib import.

const COAST = vec3f(191.0, 171.0, 105.0);
const LAND_DRY = vec3f(205.0, 167.0, 88.0);
const LAND_WET = vec3f(35.0, 112.0, 67.0);
const LAND_WARM_DRY = vec3f(194.0, 122.0, 70.0);
const LAND_COLD = vec3f(190.0, 211.0, 216.0);
const SNOW = vec3f(236.0, 240.0, 244.0);
const RIVER = vec3f(72.0, 160.0, 190.0);

var<private> BIOME_COLORS: array<vec3f, 13> = array<vec3f, 13>(
  vec3f(18.0, 69.0, 108.0),
  vec3f(220.0, 234.0, 233.0),
  vec3f(143.0, 156.0, 145.0),
  vec3f(111.0, 139.0, 132.0),
  vec3f(153.0, 142.0, 88.0),
  vec3f(87.0, 119.0, 82.0),
  vec3f(52.0, 103.0, 82.0),
  vec3f(190.0, 154.0, 82.0),
  vec3f(134.0, 145.0, 78.0),
  vec3f(55.0, 117.0, 72.0),
  vec3f(178.0, 146.0, 74.0),
  vec3f(49.0, 114.0, 67.0),
  vec3f(31.0, 91.0, 57.0),
);

var<private> ALTITUDE_STOPS: array<vec4f, 6> = array<vec4f, 6>(
  vec4f(0.0, 191.0, 171.0, 105.0),
  vec4f(0.22, 96.0, 135.0, 72.0),
  vec4f(0.48, 126.0, 127.0, 78.0),
  vec4f(0.7, 133.0, 103.0, 78.0),
  vec4f(0.88, 143.0, 134.0, 126.0),
  vec4f(1.0, 226.0, 230.0, 222.0),
);

var<private> OCEAN_STOPS: array<vec4f, 4> = array<vec4f, 4>(
  vec4f(0.0, 77.0, 151.0, 171.0),
  vec4f(0.32, 38.0, 115.0, 155.0),
  vec4f(0.7, 18.0, 74.0, 125.0),
  vec4f(1.0, 7.0, 38.0, 83.0),
);

fn ramp6(value: f32, stops: ptr<private, array<vec4f, 6>>) -> vec3f {
  let v = clamp(value, 0.0, 1.0);
  for (var s = 0; s < 5; s += 1) {
    let left = (*stops)[s];
    let right = (*stops)[s + 1];
    if (v <= right.x) {
      let t = (v - left.x) / max(0.0001, right.x - left.x);
      return mix(left.yzw, right.yzw, t);
    }
  }
  return (*stops)[5].yzw;
}

fn ramp4(value: f32, stops: ptr<private, array<vec4f, 4>>) -> vec3f {
  let v = clamp(value, 0.0, 1.0);
  for (var s = 0; s < 3; s += 1) {
    let left = (*stops)[s];
    let right = (*stops)[s + 1];
    if (v <= right.x) {
      let t = (v - left.x) / max(0.0001, right.x - left.x);
      return mix(left.yzw, right.yzw, t);
    }
  }
  return (*stops)[3].yzw;
}

// The same biome thresholds the worldgen uses, from live temperature and
// baked humidity.
fn biomeIndex(t: f32, h: f32) -> u32 {
  if (t < 0.2) {
    return select(3u, 2u, h < 0.28);
  } else if (t < 0.38) {
    if (h < 0.25) { return 4u; } else if (h < 0.58) { return 5u; } else { return 6u; }
  } else if (t < 0.64) {
    if (h < 0.2) { return 7u; } else if (h < 0.5) { return 8u; } else { return 9u; }
  }
  if (h < 0.18) { return 7u; } else if (h < 0.46) { return 10u; } else if (h < 0.72) { return 11u; }
  return 12u;
}
