#version 300 es
// PlotPass — tribal 2×2 plot patterns painted over territory.
//
// uPlotTex value per tile: 0 = none, else 1 + typeIdx*4 + (localY*2 + localX)
// where typeIdx is 0 Settlement / 1 Farmland / 2 Barn and local* is the
// tile's parity inside its plot (encoded CPU-side; no anchor lookups here).
//
// uGhost = (anchorX, anchorY, typeIdx or -1 when off, valid 1/0) — the
// paint-mode preview: the pattern tinted green (placeable) or red (not).
precision highp float;
precision highp usampler2D;

uniform usampler2D uPlotTex;
uniform vec2 uMapSize;
uniform vec4 uGhost;

in vec2 vWorldPos;
out vec4 fragColor;

// 3 types × 4 pattern pixels (parity order: TL, TR, BL, BR).
const vec3 PLOT_COLORS[12] = vec3[12](
  // Settlement — plaster + terracotta roofs (parked-branch palette)
  vec3(0.957, 0.886, 0.502),
  vec3(0.933, 0.769, 0.322),
  vec3(0.675, 0.463, 0.180),
  vec3(0.376, 0.243, 0.133),
  // Farmland — two rows of brown, the lower darker (tilled earth)
  vec3(0.545, 0.420, 0.250),
  vec3(0.565, 0.435, 0.262),
  vec3(0.360, 0.260, 0.145),
  vec3(0.380, 0.276, 0.155),
  // Barn — weathered wood, darkening toward the eaves
  vec3(0.520, 0.320, 0.220),
  vec3(0.470, 0.280, 0.190),
  vec3(0.400, 0.235, 0.155),
  vec3(0.350, 0.200, 0.130)
);

void main() {
  ivec2 tile = ivec2(floor(vWorldPos));
  if (tile.x < 0 || tile.y < 0 ||
      tile.x >= int(uMapSize.x) || tile.y >= int(uMapSize.y)) {
    discard;
  }

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  uint v = texelFetch(uPlotTex, tile, 0).r;
  if (v > 0u) {
    color = PLOT_COLORS[int(v) - 1];
    alpha = 1.0;
  }

  // Paint-mode ghost: 2×2 pattern at the hovered anchor, validity-tinted.
  if (uGhost.z >= 0.0) {
    ivec2 d = tile - ivec2(uGhost.xy);
    if (d.x >= 0 && d.x < 2 && d.y >= 0 && d.y < 2) {
      vec3 pattern = PLOT_COLORS[int(uGhost.z) * 4 + d.y * 2 + d.x];
      vec3 tint = uGhost.w > 0.5 ? vec3(0.35, 1.0, 0.35) : vec3(1.0, 0.3, 0.3);
      color = mix(pattern, tint, 0.45);
      alpha = 0.85;
    }
  }

  if (alpha == 0.0) {
    discard;
  }
  fragColor = vec4(color, alpha);
}
