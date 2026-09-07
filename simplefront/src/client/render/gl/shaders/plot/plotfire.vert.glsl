#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;      // unit quad 0..1
layout(location = 1) in vec4 aInstData; // tileX, tileY, startSec, seed

uniform mat3 uCamera;

out vec2 vUV;
flat out float vStart;
flat out float vSeed;

void main() {
  vUV = aPos;
  vStart = aInstData.z;
  vSeed = aInstData.w;

  vec2 worldPos = aInstData.xy + aPos;
  vec3 clip = uCamera * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
