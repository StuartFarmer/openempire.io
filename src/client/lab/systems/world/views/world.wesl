// Live terrain colors from the seasonal simulation — the map generator's
// terrain look (biome + tints + altitude + coast + contours), with biome and
// tints re-derived from the live temp layer every tick so snowlines and
// green fronts move with the seasons. Alpha carries the land mask (0 =
// water) for present-time water effects later.
import package::kernel::{OFF, inBounds};
import package::layers;
import package::lib::palette::{
  COAST, LAND_DRY, LAND_WET, LAND_WARM_DRY, LAND_COLD, SNOW, RIVER,
  BIOME_COLORS, ALTITUDE_STOPS, OCEAN_STOPS, ramp6, ramp4, biomeIndex,
};

fn landColor(x: i32, y: i32, i: u32) -> vec3f {
  let t = layers::temp::val(i);
  let h = layers::humidity::val(i);
  var color = BIOME_COLORS[biomeIndex(t, h)];

  let warm = clamp((t - 0.58) / 0.42, 0.0, 1.0);
  let cold = clamp((0.34 - t) / 0.34, 0.0, 1.0);
  let wet = clamp((h - 0.52) / 0.48, 0.0, 1.0);
  let dry = clamp((0.34 - h) / 0.34, 0.0, 1.0);
  color = mix(color, LAND_DRY, dry * 0.36);
  color = mix(color, LAND_WET, wet * 0.34);
  color = mix(color, LAND_WARM_DRY, warm * dry * 0.24);
  color = mix(color, LAND_COLD, cold * 0.28);

  let altitude = layers::elevation::val(i);
  color = mix(color, ramp6(altitude, &ALTITUDE_STOPS), 0.42);

  // Coast tint, like the generator's shoreline band.
  var coastal = false;
  for (var k = 0; k < 8; k += 1) {
    let n = vec2i(x, y) + OFF[k];
    if (!inBounds(n.x, n.y)) { continue; }
    if (layers::land::at(n.x, n.y) == 0.0) {
      coastal = true;
      break;
    }
  }
  if (coastal) {
    color = mix(color, COAST, 0.6);
  }

  // Hillshade from the elevation plane.
  let west = layers::elevation::at(x - 1, y);
  let east = layers::elevation::at(x + 1, y);
  let north = layers::elevation::at(x, y - 1);
  let south = layers::elevation::at(x, y + 1);
  let light = clamp(1.0 + (west - east + north - south) * 2.4, 0.7, 1.3);
  color = clamp(color * (light * (0.9 + altitude * 0.18)), vec3f(0.0), vec3f(255.0));

  // Contour banding, like the generator's elevation lines.
  let contour = abs(fract(altitude * 13.0) - 0.5);
  if (altitude > 0.12 && contour > 0.46) {
    color = color * 0.88;
  }

  // Rivers from the baked freshwater plane.
  let river = clamp((layers::water::val(i) - 0.55) / 0.45, 0.0, 1.0);
  color = mix(color, RIVER, river * 0.8);

  // Snow: cold land whitens; altitude lowers the snowline.
  let snow = clamp((0.24 + altitude * 0.18 - t) / 0.12, 0.0, 1.0);
  color = mix(color, SNOW, snow * 0.9);

  return color;
}

fn color(x: i32, y: i32, i: u32) -> vec4f {
  if (layers::land::val(i) == 0.0) {
    // Depth-ramped ocean, chilled toward the poles.
    var ocean = ramp4(layers::elevation::val(i), &OCEAN_STOPS);
    let cold = clamp((0.3 - layers::temp::val(i)) / 0.3, 0.0, 1.0);
    ocean = mix(ocean, vec3f(150.0, 180.0, 196.0), cold * 0.45);
    // Sea ice at freezing temperatures.
    let ice = clamp((0.1 - layers::temp::val(i)) / 0.08, 0.0, 1.0);
    ocean = mix(ocean, vec3f(225.0, 234.0, 240.0), ice);
    return vec4f(ocean / 255.0, 0.0);
  }
  return vec4f(landColor(x, y, i) / 255.0, 1.0);
}
