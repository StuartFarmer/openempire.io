#version 300 es
// PlotPass — tribal single-tile plots painted over territory.
//
// uPlotTex value per tile: 0 = none, 1 = Settlement, 2 = Farmland, 3 = Barn.
// The 2×2 "sprite" is generated inside the tile from the sub-tile UV
// (fract of world position), matching the hand-authored tile spec:
//
//   Farmland (layout 0 0 / 1 1 — top row color 0, bottom row color 1) ripens
//   through four variants driven by uPlotMatTex (maturity 0..255):
//   Initial → Planted → Growing → Grown. As a field senesces / food runs low
//   the maturity byte falls and the variant walks back down (Grown → Planted).
//
//   Settlement (layout 0 1 / 0 1 — left column color 0, right column color 1)
//   is a little house whose hue (red / blue / yellow — fixed S/L, hue shifts)
//   is chosen per tile so a cluster reads as mixed rooftops.
//
// uGhost = (tileX, tileY, typeIdx or -1 when off, valid 1/0) — the
// paint-mode preview tinted green (placeable) or red (not).
precision highp float;
precision highp usampler2D;

uniform usampler2D uPlotTex;
uniform usampler2D uPlotMatTex;
uniform sampler2D uTerrainTex; // retained for pass compatibility (unused here)
uniform vec2 uMapSize;
uniform vec4 uGhost;

in vec2 vWorldPos;
out vec4 fragColor;

// ── Farmland maturity variants (0 0 / 1 1) ────────────────────────────────
const vec3 FARM_INIT_0 = vec3(0.4745, 0.4039, 0.3333); // 796755 tilled soil
const vec3 FARM_INIT_1 = vec3(0.6275, 0.5255, 0.3843); // a08662
const vec3 FARM_PLANT_0 = vec3(0.3529, 0.3059, 0.2667); // 5a4e44 seeded, damp
const vec3 FARM_PLANT_1 = vec3(0.4745, 0.4039, 0.3333); // 796755
const vec3 FARM_GROW_0 = vec3(0.1922, 0.7216, 0.0549); // 31b80e green shoots
const vec3 FARM_GROW_1 = vec3(0.6000, 0.8980, 0.3137); // 99e550
const vec3 FARM_RIPE_0 = vec3(0.9843, 0.7647, 0.2118); // fbc336 golden grain
const vec3 FARM_RIPE_1 = vec3(0.9843, 0.9490, 0.2118); // fbf236

// ── Settlement house hues (0 1 / 0 1) ─────────────────────────────────────
const vec3 HOUSE_RED_0 = vec3(0.4000, 0.0588, 0.0588); // 660f0f
const vec3 HOUSE_RED_1 = vec3(0.6471, 0.0784, 0.0784); // a51414
const vec3 HOUSE_BLUE_0 = vec3(0.0784, 0.3059, 0.5020); // 144e80
const vec3 HOUSE_BLUE_1 = vec3(0.0784, 0.4275, 0.6627); // 146da9
const vec3 HOUSE_YELLOW_0 = vec3(0.5059, 0.4941, 0.0902); // 817e17
const vec3 HOUSE_YELLOW_1 = vec3(0.6471, 0.6275, 0.0667); // a5a011

// Flat color: barn silo-gold (kept from the reference palette).
const vec3 BARN_COLOR = vec3(0.839, 0.635, 0.227);

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Farmland: pick the growth variant by maturity, then the row (0 0 / 1 1).
vec3 farmlandColor(vec2 subUV, float mat) {
  vec3 c0, c1;
  if (mat < 0.19) {
    c0 = FARM_INIT_0;
    c1 = FARM_INIT_1;
  } else if (mat < 0.44) {
    c0 = FARM_PLANT_0;
    c1 = FARM_PLANT_1;
  } else if (mat < 0.72) {
    c0 = FARM_GROW_0;
    c1 = FARM_GROW_1;
  } else {
    c0 = FARM_RIPE_0;
    c1 = FARM_RIPE_1;
  }
  return subUV.y < 0.5 ? c0 : c1;
}

// Settlement: a house whose hue is stable per tile, columns 0 1 / 0 1.
vec3 settlementColor(ivec2 tile, vec2 subUV) {
  int hue = int(floor(hash21(vec2(tile)) * 3.0)); // 0 red, 1 blue, 2 yellow
  vec3 c0, c1;
  if (hue == 0) {
    c0 = HOUSE_RED_0;
    c1 = HOUSE_RED_1;
  } else if (hue == 1) {
    c0 = HOUSE_BLUE_0;
    c1 = HOUSE_BLUE_1;
  } else {
    c0 = HOUSE_YELLOW_0;
    c1 = HOUSE_YELLOW_1;
  }
  return subUV.x < 0.5 ? c0 : c1;
}

vec3 plotColor(int type, ivec2 tile, vec2 subUV) {
  if (type == 1) {
    return settlementColor(tile, subUV);
  }
  if (type == 3) {
    return BARN_COLOR;
  }
  // Farmland (type 2): maturity 0..255 → 0..1.
  float mat = float(texelFetch(uPlotMatTex, tile, 0).r) / 255.0;
  return farmlandColor(subUV, mat);
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
