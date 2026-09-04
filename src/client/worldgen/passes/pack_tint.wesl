// Copy the rendered rgba8 terrain color into the u32 tint buffer consumed by
// game overlays. Reading the prior color pass avoids rebinding its inputs.
import package::bindings::{out_tex_in, tint};

fn tile(x: i32, y: i32, i: u32) {
  let c = textureLoad(out_tex_in, vec2i(x, y), 0).rgb * 255.0;
  // rgb8 packed into the low 24 bits.
  tint[i] = (u32(round(c.r)) << 16u) |
    (u32(round(c.g)) << 8u) |
    u32(round(c.b));
}
