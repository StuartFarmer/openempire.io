// The real game rendered over the terrain: each player's territory (owner from
// the CPU sim) washed in a distinct colour over the rendered world
// (layers::tint), plus the tribal structures drawn as per-tile fills — a
// density-graded urban wash, a flat Settlement fill, and a cultivated Farmland
// tint (mirroring the WebGL DensityPass/PlotPass). Neutral land and sea show the
// terrain unchanged.
import package::layers;
import shared::palette::unpackTint;

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
  // Sea shows the terrain unchanged.
  if (layers::land::val(i) == 0.0) {
    return vec4f(base, 1.0);
  }
  var col = base;
  // Territory wash (owner from the sim).
  let o = layers::owner::val(i);
  if (o != 0u) {
    col = mix(base, ownerColor(o), 0.55);
  }
  // Urban density wash: faint at the fringe → bright toward the core.
  let d = f32(layers::density::val(i)) / 255.0;
  if (d > 0.0) {
    let urban = vec3f(0.98, 0.90, 0.72);
    col = mix(col, urban, clamp(0.12 + 0.6 * d, 0.0, 0.85));
  }
  // Structure fills (drawn on top of the tile).
  let p = layers::plot::val(i);
  if (p == 1u) {
    // Settlement — flat plaster-blue (WebGL PlotPass).
    col = vec3f(0.459, 0.612, 0.737);
  } else if (p == 2u) {
    // Farmland — cultivated tint derived from the local terrain colour.
    col = mix(base * 0.72, vec3f(0.42, 0.52, 0.18), 0.5);
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
  return vec4f(col, 1.0);
}
