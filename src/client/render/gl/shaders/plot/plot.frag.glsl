#version 300 es
// PlotPass — tribal single-tile plots painted over territory.
//
// uPlotTex value per tile: 0 = none, 1 = Settlement, 2 = Farmland, 3 = Barn.
// The 2×2 "sprite" is generated inside the tile from the sub-tile UV
// (fract of world position): farmland renders the tile's own base terrain
// color on the top row over a darkened copy below (tilled earth that blends
// with the local biome — reference: the foundation FarmlandBuilding);
// settlement and barn are flat reference-palette tiles.
//
// uGhost = (tileX, tileY, typeIdx or -1 when off, valid 1/0) — the
// paint-mode preview tinted green (placeable) or red (not).
precision highp float;
precision highp usampler2D;

uniform usampler2D uPlotTex;
uniform sampler2D uTerrainTex;
uniform vec2 uMapSize;
uniform vec4 uGhost;

in vec2 vWorldPos;
out vec4 fragColor;

// Flat colors (reference palette): settlement plaster-blue, barn silo-gold.
const vec3 SETTLEMENT_COLOR = vec3(0.459, 0.612, 0.737); // rgb(117 156 188)
const vec3 BARN_COLOR = vec3(0.839, 0.635, 0.227); // rgb(214 162 58)

vec3 plotColor(int type, ivec2 tile, vec2 subUV) {
  if (type == 1) {
    return SETTLEMENT_COLOR;
  }
  if (type == 3) {
    return BARN_COLOR;
  }
  // Farmland: tilled rows from the tile's own terrain color.
  vec3 base = texelFetch(uTerrainTex, tile, 0).rgb;
  return subUV.y < 0.5 ? base : base * 0.72;
}

void main() {
  ivec2 tile = ivec2(floor(vWorldPos));
  if (tile.x < 0 || tile.y < 0 ||
      tile.x >= int(uMapSize.x) || tile.y >= int(uMapSize.y)) {
    discard;
  }
  vec2 subUV = fract(vWorldPos);

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  uint v = texelFetch(uPlotTex, tile, 0).r;
  if (v > 0u) {
    color = plotColor(int(v), tile, subUV);
    alpha = 1.0;
  }

  // Paint-mode ghost: the hovered tile's pattern, validity-tinted.
  if (uGhost.z >= 0.0 && tile.x == int(uGhost.x) && tile.y == int(uGhost.y)) {
    vec3 pattern = plotColor(int(uGhost.z) + 1, tile, subUV);
    vec3 tint = uGhost.w > 0.5 ? vec3(0.35, 1.0, 0.35) : vec3(1.0, 0.3, 0.3);
    color = mix(pattern, tint, 0.45);
    alpha = 0.85;
  }

  if (alpha == 0.0) {
    discard;
  }
  fragColor = vec4(color, alpha);
}
