import package::territory;
import package::layers;
// Field compiler scans the entry point: declare the territory helper's reads.
import package::layers::{tint, density, supply};
import package::params;
import package::players;

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let base = territory::color(x, y, i);
  let plot = layers::plot::val(i);
  let owner = layers::owner::val(i);
  // Keep existing borders, battle fronts, targeting, seeds and damage readable.
  // A seed is a historical marker on its own tile; it defines no catchment.
  if ((plot >> 16u) == 0u || layers::land::val(i) == 0.0 ||
      (plot & 255u) == 1u || layers::owner::any8_ne(x, y, owner) ||
      layers::front::val(i) != 0u || layers::highlight::val(i) != 0u ||
      layers::damage::val(i) != 0u || params::supplyOverlay() > 0.5 ||
      params::ambientView() > 0.5) {
    return base;
  }
  let hovered = u32(max(0.0, round(params::hoveredPlayer())));
  let mine = owner != 0u && players::val(min(owner, players::count() - 1u)).mine != 0u;
  let fade = clamp(params::maskFade(), 0.0, 1.0);
  var brightness = 1.0;
  if (owner != 0u && owner == hovered) {
    brightness = 1.0;
  } else if (mine) {
    if (hovered != 0u) { brightness = 1.0 - clamp(params::ownFocusDim(), 0.0, 1.0) * fade; }
  } else {
    brightness = 1.0 - clamp(params::maskDarkness(), 0.0, 1.0) * fade;
  }
  // 128..254 is an urban sprite with quantised brightness. 255 remains a
  // regular terrain pixel; 1..4 retains the shared legacy plot encoding.
  return vec4f(base.rgb, (128.0 + round(brightness * 126.0)) / 255.0);
}
