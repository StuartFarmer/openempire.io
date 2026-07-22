// The real game rendered over the terrain: YOUR territory shown as untouched
// world and everything else darkened by a global mask (owner from
// the CPU sim) over the rendered world
// (layers::tint), plus the tribal structures drawn as per-tile fills — a
// density-graded urban wash, a flat Settlement fill, and a cultivated Farmland
// tint (mirroring the WebGL DensityPass/PlotPass). Neutral land and sea show the
// terrain unchanged.
import package::layers;
import package::params;
import package::players;
import shared::palette::unpackTint;

// Supply-quality heatmap colour: low (front, out of reach) red → mid amber →
// high (core, well-supplied) green. `q` is the 0..1 supply quality.
fn supplyColor(q: f32) -> vec3f {
  let lowMid = mix(vec3f(0.85, 0.16, 0.12), vec3f(0.95, 0.80, 0.20), clamp(q * 2.0, 0.0, 1.0));
  return mix(lowMid, vec3f(0.18, 0.75, 0.35), clamp(q * 2.0 - 1.0, 0.0, 1.0));
}

fn hue2rgb(h: f32) -> vec3f {
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0));
}

// Deterministic distinct colour per player smallID (golden-ratio hue hopping),
// lightly desaturated so the terrain reads through.
fn ownerColor(id: u32) -> vec3f {
  let h = fract(f32(id) * 0.61803398875);
  return mix(vec3f(1.0), hue2rgb(h), 0.8);
}

fn color(x: i32, y: i32, i: u32) -> vec4f {
  let base = unpackTint(layers::tint::val(i));
  // Sea is never yours, so it sits under the same mask as foreign land.
  if (layers::land::val(i) == 0.0) {
    if (params::supplyOverlay() > 0.5) {
      return vec4f(base, 1.0);
    }
    return vec4f(
      mix(base, vec3f(0.0),
          clamp(params::maskDarkness(), 0.0, 1.0) * clamp(params::maskFade(), 0.0, 1.0)),
      1.0);
  }
  // Supply overlay (legibility toggle): swap the territory view for the human's
  // front→core supply-quality heatmap. Only the human's supplied land carries a
  // nonzero byte, so this lights up exactly your logistical catchment; land the
  // supply flood never reaches stays a desaturated terrain so the heatmap reads.
  if (params::supplyOverlay() > 0.5) {
    let sv = layers::supply::val(i);
    if (sv != 0u) {
      let q = (f32(sv) - 1.0) / 254.0;
      return vec4f(supplyColor(q), 1.0);
    }
    let grey = dot(base, vec3f(0.299, 0.587, 0.114));
    return vec4f(mix(base, vec3f(grey), 0.6), 1.0);
  }
  var col = base;
  // Territory readability: instead of washing every player in a distinct
  // colour (which turns a late-game map into confetti), the world outside YOUR
  // borders is pushed toward black by a single global mask. Your own land is
  // left as the untouched terrain, so the bright region IS your empire and
  // everything else recedes. Other players are told apart by hovering, not by
  // colour.
  let o = layers::owner::val(i);
  let slot = players::val(min(o, players::count() - 1u));
  let isMine = o != 0u && slot.mine != 0u;
  // Urban density wash: faint at the fringe → bright toward the core.
  let d = f32(layers::density::val(i)) / 255.0;
  if (d > 0.0) {
    let urban = vec3f(0.98, 0.90, 0.72);
    col = mix(col, urban, clamp(0.12 + 0.6 * d, 0.0, 0.85));
  }
  // Structures (drawn on top of the tile, full alpha like the WebGL
  // PlotPass). Farmland outputs the PURE terrain colour here: the camera
  // shader draws the sub-tile tilled rows (top = this colour, bottom =
  // ×0.72) from the plot plane — the view texture is one texel per tile,
  // so the sprite pattern must happen at camera resolution.
  let p = layers::plot::val(i);
  if (p == 1u) {
    // Settlement — flat plaster-blue (WebGL PlotPass).
    col = vec3f(0.459, 0.612, 0.737);
  } else if (p == 2u) {
    col = base;
  } else if (p == 3u) {
    // Barn — silo-gold.
    col = vec3f(0.839, 0.635, 0.227);
  }
  // Battle-worn wash: fought-over tiles darken toward brown (WebGL damage
  // overlay), fading as the damage heals.
  let dmg = f32(layers::damage::val(i)) / 255.0;
  if (dmg > 0.0) {
    col = mix(col, vec3f(0.28, 0.18, 0.10), clamp(0.15 + 0.55 * dmg, 0.0, 0.75));
  }
  // THE MASK, applied last over everything the world draws: the land outside
  // your borders — including other nations' cities and fields — is pushed
  // toward black, so the only bright thing on screen is yours. It has to come
  // after the structure/density layers, otherwise a foreign metropolis or farm
  // paints itself back to full brightness straight through the mask.
  let fade = clamp(params::maskFade(), 0.0, 1.0);
  let hoveredId = u32(max(0.0, round(params::hoveredPlayer())));
  let inspecting = hoveredId != 0u;
  let isHovered = o != 0u && o == hoveredId;
  let onEdge = layers::owner::any8_ne(x, y, o);
  if (isHovered) {
    // Looking INTO a country: the mask lifts entirely so you can read its
    // land, cities and fields, and its outline goes white so you know exactly
    // whose territory you are seeing.
    if (onEdge) {
      col = vec3f(1.0);
    }
  } else if (isMine) {
    // Yours is normally untouched terrain. While you are inspecting someone
    // else it dips slightly — enough to move the eye onto them without losing
    // track of home.
    if (onEdge) {
      let bcol = select(ownerColor(o) * 0.58, unpackTint(slot.border), slot.border != 0u);
      col = bcol;
    }
    if (inspecting) {
      col = mix(col, vec3f(0.0), clamp(params::ownFocusDim(), 0.0, 1.0) * fade);
    }
  } else {
    var m = clamp(params::maskDarkness(), 0.0, 1.0);
    // A nation's outline is pushed DARKER than the mask around it, so the
    // political map still reads through the dimming.
    if (o != 0u && onEdge) {
      m = clamp(m + params::maskBorderBoost(), 0.0, 1.0);
    }
    col = mix(col, vec3f(0.0), m * fade);
  }
  // Active front: tint the contested border green (human pushing) → white
  // (even) → red (enemy pushing) by the signed balance byte (128 = even).
  let fr = layers::front::val(i);
  if (fr != 0u) {
    let t = (f32(fr) - 128.0) / 127.0; // -1..1
    let frontCol = select(mix(vec3f(1.0), vec3f(0.9, 0.15, 0.12), -t),
                          mix(vec3f(1.0), vec3f(0.20, 0.85, 0.25), t),
                          t >= 0.0);
    col = mix(col, frontCol, 0.75);
  }
  // Aimed-segment highlight: the stretch of YOUR border a click would
  // attack from, recolored cyan exactly like the WebGL BorderStampPass
  // (render-settings mapOverlay.segmentHighlight 0.3/0.95/1).
  if (layers::highlight::val(i) != 0u) {
    col = vec3f(0.3, 0.95, 1.0);
  }
  return vec4f(col, 1.0);
}
