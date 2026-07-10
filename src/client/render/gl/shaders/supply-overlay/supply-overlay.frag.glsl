#version 300 es
precision highp float;

// R8 quality map: 0 = not the local player's tile (transparent);
// 1..255 encodes supply quality 0..1 (see SupplyOverlayPass / the client
// SupplyOverlay derive).
uniform sampler2D uQuality;
uniform vec3 uLowColor;
uniform vec3 uHighColor;
// x = alpha at quality 0 (frontier pops), y = alpha at quality 1 (subtle).
uniform vec2 uAlpha;

in vec2 vUV;
out vec4 fragColor;

void main() {
  float v = texture(uQuality, vUV).r * 255.0;
  if (v < 0.5) discard;
  float q = clamp((v - 1.0) / 254.0, 0.0, 1.0);
  vec3 color = mix(uLowColor, uHighColor, q);
  float alpha = mix(uAlpha.x, uAlpha.y, q);
  fragColor = vec4(color, alpha);
}
