#version 300 es
precision highp float;

// Plot fire — burn-down animation over a razed tribal plot's tile, followed
// by a grayscale ash scar. Matches the plot art style: the tile splits into
// flat 2×2 quadrants, each flickering independently through ember/orange/
// yellow fire colors, collapsing to dark ember. Once the flame passes, a
// desaturated ash tile lingers over the ground and slowly fades out —
// revealing whatever regrows beneath (the field greening back from Initial).

in vec2 vUV;
flat in float vStart;
flat in float vSeed;

uniform float uTime;        // seconds
uniform float uDuration;    // seconds — flame phase
uniform float uAshDuration; // seconds — ash-scar fade that follows

out vec4 fragColor;

const vec3 EMBER_RED = vec3(0.72, 0.14, 0.04);
const vec3 ORANGE = vec3(1.0, 0.45, 0.08);
const vec3 YELLOW = vec3(1.0, 0.82, 0.25);
const vec3 DARK_EMBER = vec3(0.16, 0.10, 0.08);

// Grayscale ash tones (charcoal → cold ash) — "greyscale version" of the tile.
const vec3 ASH_DARK = vec3(0.14, 0.13, 0.12);
const vec3 ASH_LIGHT = vec3(0.34, 0.33, 0.31);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Which of the 2×2 sub-tile quadrants this fragment sits in.
  float qx = step(0.5, vUV.x);
  float qy = step(0.5, vUV.y);
  float quad = qx + 2.0 * qy;

  float t = (uTime - vStart) / uDuration;

  if (t < 1.0) {
    if (t < 0.0) discard;

    // Per-quadrant flicker: re-roll the flame color ~9×/s, phase-shifted per
    // quadrant so the four cells never pulse in lockstep.
    float frame = floor(uTime * 9.0 + hash(vec2(vSeed, quad)) * 7.0);
    float r = hash(vec2(frame, vSeed * 13.0 + quad));
    vec3 flame = r < 0.34 ? EMBER_RED : (r < 0.72 ? ORANGE : YELLOW);

    // Burn-down envelope: pop in fast, rage, then collapse to dark ember.
    float ember = smoothstep(0.62, 0.95, t);
    vec3 color = mix(flame, DARK_EMBER, ember);
    float alpha = smoothstep(0.0, 0.06, t);
    fragColor = vec4(color, alpha * 0.92);
    return;
  }

  // Ash phase: a static, grayscale scar over the tile that fades out.
  float at = (uTime - vStart - uDuration) / uAshDuration;
  if (at >= 1.0) discard;

  // Per-quadrant grain so the 2×2 ash tile isn't a flat block.
  float grain = hash(vec2(quad, vSeed * 7.0 + 3.0));
  vec3 ash = mix(ASH_DARK, ASH_LIGHT, grain);

  // Hold opaque, then fade over the back half — the regrowth shows through.
  float alpha = (1.0 - smoothstep(0.45, 1.0, at)) * 0.9;
  fragColor = vec4(ash, alpha);
}
