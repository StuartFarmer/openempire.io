#version 300 es
precision highp float;

// R8 urban density (0..255) per tile — the self-growing city (add-urban-core-
// growth). Rendered as a built-up wash: unbuilt land is untouched, density
// grades from a faint settlement tint to a bright urban core.
uniform sampler2D uDensity;
uniform vec3 uLowColor;
uniform vec3 uHighColor;
uniform vec2 uAlpha; // x = alpha at low density, y = alpha at full density

in vec2 vUV;
out vec4 fragColor;

void main() {
  float v = texture(uDensity, vUV).r * 255.0;
  if (v < 0.5) discard;
  float q = clamp(v / 255.0, 0.0, 1.0);
  vec3 color = mix(uLowColor, uHighColor, q);
  float alpha = mix(uAlpha.x, uAlpha.y, q);
  fragColor = vec4(color, alpha);
}
