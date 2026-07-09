#version 300 es
precision highp float;

// Plot fire — burn-down animation over a razed tribal plot's tile.
// Matches the plot art style: the tile splits into flat 2×2 quadrants, each
// flickering independently through ember/orange/yellow fire colors, then the
// whole tile fades through dark ember to nothing.

in vec2 vUV;
flat in float vStart;
flat in float vSeed;

uniform float uTime;     // seconds
uniform float uDuration; // seconds

out vec4 fragColor;

const vec3 EMBER_RED = vec3(0.72, 0.14, 0.04);
const vec3 ORANGE = vec3(1.0, 0.45, 0.08);
const vec3 YELLOW = vec3(1.0, 0.82, 0.25);
const vec3 DARK_EMBER = vec3(0.16, 0.10, 0.08);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float t = (uTime - vStart) / uDuration;
  if (t < 0.0 || t >= 1.0) discard;

  // Which of the 2×2 sub-tile quadrants this fragment sits in.
  float quad = step(0.5, vUV.x) + 2.0 * step(0.5, vUV.y);

  // Per-quadrant flicker: re-roll the flame color ~9×/s, phase-shifted per
  // quadrant so the four cells never pulse in lockstep.
  float frame = floor(uTime * 9.0 + hash(vec2(vSeed, quad)) * 7.0);
  float r = hash(vec2(frame, vSeed * 13.0 + quad));
  vec3 flame = r < 0.34 ? EMBER_RED : (r < 0.72 ? ORANGE : YELLOW);

  // Burn-down envelope: pop in fast, rage, then collapse to dark ember and
  // fade out over the final third.
  float ember = smoothstep(0.62, 0.95, t);
  vec3 color = mix(flame, DARK_EMBER, ember);
  float alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.72, 1.0, t));

  fragColor = vec4(color, alpha * 0.92);
}
