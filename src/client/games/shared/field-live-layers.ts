const zero = `
fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
`;

export const FIELD_LIVE_LAYERS = {
  "layers/damage.wesl": zero,
  "layers/density.wesl": zero,
  "layers/front.wesl": zero,
  "layers/plot.wesl": zero,
  "layers/supply.wesl": zero,
  "layers/highlight.wesl": `
import package::layers;
fn init(x: i32, y: i32, i: u32) -> u32 { return 0u; }
fn update(x: i32, y: i32, i: u32) -> u32 { return layers::highlight::val(i); }
`,
} as const;

export const FIELD_BORDER_MODULES = {
  "passes/field_border_zero.wesl": `
import package::bindings::fieldBorderCount;
fn once() { atomicStore(&fieldBorderCount[0], 0u); }
`,
  "passes/field_border.wesl": `
import package::kernel::GRID;
import package::bindings::{owner_in, fieldBorderCount, fieldBorderTiles};

fn tile(x: i32, y: i32, i: u32) {
  if (owner_in[i] != 1u) { return; }
  let w = GRID.size.x;
  let edge =
    (x > 0 && owner_in[i - 1u] != 1u) ||
    (x < i32(w) - 1 && owner_in[i + 1u] != 1u) ||
    (y > 0 && owner_in[i - w] != 1u) ||
    (y < i32(GRID.size.y) - 1 && owner_in[i + w] != 1u);
  if (!edge) { return; }
  let slot = atomicAdd(&fieldBorderCount[0], 1u);
  fieldBorderTiles[slot] = i;
}
`,
} as const;

export const FIELD_BORDER_DERIVE = {
  typeImports: "",
  fields: {
    fieldBorderCount: { type: "u32", count: 1, readable: true },
    fieldBorderTiles: { type: "u32", readable: true },
  },
  steps: [
    {
      pass: "field_border_zero",
      binds: ["fieldBorderCount:array<atomic<u32>, 1>!"],
      kind: "single" as const,
      tiers: ["border"],
    },
    {
      pass: "field_border",
      binds: [
        "owner.read:array<u32>",
        "fieldBorderCount:array<atomic<u32>, 1>!",
        "fieldBorderTiles!",
      ],
      tiers: ["border"],
    },
  ],
} as const;

export const LIVE_FIELD_PARAMS = {
  supplyOverlay: { value: 0, min: 0, max: 1, step: 1 },
  maskDarkness: { value: 0.62, min: 0, max: 1, step: 0.02 },
  maskBorderBoost: { value: 0.1, min: 0, max: 1, step: 0.02 },
  maskFade: { value: 0, min: 0, max: 1, step: 0.01, hidden: true },
  ownFocusDim: { value: 0.3, min: 0, max: 1, step: 0.02 },
  hoveredPlayer: { value: 0, min: 0, max: 255, step: 1, hidden: true },
  ambientView: { value: 0, min: 0, max: 1, step: 1, hidden: true },
} as const;
