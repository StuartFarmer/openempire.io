#version 300 es
precision highp float;

// R8 fertility map: 0 = water/impassable (transparent);
// 1..255 encodes the baked fertility byte 0..255 (see FertilityOverlayPass).
uniform sampler2D uFertility;
uniform vec3 uLowColor;
uniform vec3 uHighColor;
// x = alpha at fertility 0 (barren), y = alpha at fertility 1 (lush).
uniform vec2 uAlpha;

in vec2 vUV;
out vec4 fragColor;

void main() {
  float v = texture(uFertility, vUV).r * 255.0;
  if (v < 0.5) discard;
  float q = clamp((v - 1.0) / 254.0, 0.0, 1.0);
  vec3 color = mix(uLowColor, uHighColor, q);
  float alpha = mix(uAlpha.x, uAlpha.y, q);
  fragColor = vec4(color, alpha);
}
