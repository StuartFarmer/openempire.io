// Pack the FINAL terrain color into a readable u32 buffer (add-games-on-terrain)
// so a game's overlay views can composite over the rendered world. Reuses the
// exact color logic (color::layerColor) — the same image the terrain view
// shows — honoring P.viewMode. Runs in the color tiers, so `tint` tracks the
// season (snow line, warmth) like the terrain image.
import package::bindings::tint;
import package::passes::color::layerColor;

fn tile(x: i32, y: i32, i: u32) {
  let c = clamp(layerColor(x, y, i), vec3f(0.0), vec3f(255.0));
  // rgb8 packed into the low 24 bits.
  tint[i] = (u32(c.r) << 16u) | (u32(c.g) << 8u) | u32(c.b);
}
