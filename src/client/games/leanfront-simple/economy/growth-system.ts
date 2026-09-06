import type { FieldSystem } from "../../../webgpu/FieldDynamics";
import nextStock from "./layers/nextStock.wesl?raw";

export const simpleGrowthSystem: FieldSystem = {
  id: "leanfront-simple-growth",
  name: "LeanFront Simple growth",
  views: {},
  derive: {
    typeImports: "import package::types::Params;",
    uniform: { wgslType: "Params", bytes: 16 },
    fields: {
      stock: { type: "u32" },
      level: { type: "u32" },
      kind: { type: "u32" },
      nextStock: { type: "u32", readable: true },
    },
    steps: [
      {
        pass: "nextStock",
        binds: ["P", "stock", "level", "kind", "nextStock!"],
      },
    ],
  },
  modules: {
    "types.wesl": /* wgsl */ `
struct Params {
  capacityPerLevel: u32,
  cityGrowthRate: f32,
  farmGrowthRate: f32,
  pad: f32,
}
`,
    "passes/nextStock.wesl": nextStock,
  },
};
