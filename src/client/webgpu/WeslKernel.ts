import { NOISE_WGSL } from "./WgslNoise";

// The shared `package::kernel` WESL module: binding 0 (GRID), grid helpers,
// and the noise stack. Every WESL-linked pass — lab systems and the worldgen
// alike — imports from it.
export const KERNEL_WESL = /* wesl */ `
struct FieldGrid {
  size: vec2u,
  pad0: u32,
  pad1: u32,
}

@group(0) @binding(0) var<uniform> GRID: FieldGrid;

var<private> OFF: array<vec2i, 8> = array<vec2i, 8>(
  vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1),
  vec2i(-1, 0), vec2i(1, 0),
  vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1),
);

fn clamp01(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }

fn inBounds(x: i32, y: i32) -> bool {
  return x >= 0 && x < i32(GRID.size.x) && y >= 0 && y < i32(GRID.size.y);
}

fn refOf(x: i32, y: i32) -> u32 {
  return u32(y) * GRID.size.x + u32(x);
}

${NOISE_WGSL}
`;

/** Dispatch wrapper importing `fn tile(x, y, i)` from a pass module. */
export function gridMainWesl(passModule: string): string {
  return `
import ${passModule}::tile;
import package::kernel::{GRID, refOf};

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GRID.size.x || gid.y >= GRID.size.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  tile(x, y, refOf(x, y));
}
`;
}

/** Dispatch wrapper importing `fn once()` from a pass module. */
export function singleMainWesl(passModule: string): string {
  return `
import ${passModule}::once;

@compute @workgroup_size(1)
fn main() { once(); }
`;
}
