import type { FieldSystem } from "../../../webgpu/FieldDynamics";
import {
  PARAMS_BYTES,
  WORLDGEN_MODULES,
} from "../../../webgpu/WebGpuWorldEngine";

// The worldgen terrain derivation, re-expressed as a FieldDynamics `derive`
// system (unify-field-viewer, phase 2). The pass BODIES are the existing
// worldgen `.wesl` files (reused unchanged via WORLDGEN_MODULES); this manifest
// is the wiring the raw WebGpuWorldEngine used to own — buffers, per-pass
// binds, iterate counts, and the dispatch order — now declared through the
// shared derive stage. The passes keep their own Params struct (types.wesl),
// so the system uses a custom `P` uniform; the page encodes it with
// buildWorldgenParams and uploads the map inputs (elevation, hydro, season,
// layers planes) into the input buffers before running the derivation.
//
// This is the FAITHFUL runtime path: flags come from the shipped water
// classification (flags_from_mask), not the procedural ocean flood. Output is
// the color step's out texture. Parity with the hand-wired TerrainDerivation
// is verified before the shell flips to it (phase 5).
export const terrain: FieldSystem = {
  id: "terrain",
  name: "Terrain",
  views: {},
  derive: {
    typeImports: "import package::types::{Params, Globals, GlobalsAtomic};",
    uniform: { wgslType: "Params", bytes: PARAMS_BYTES },
    fields: {
      // Map inputs (uploaded by the page/loader before deriving).
      elevation: { type: "f32" },
      waterMask: { type: "u32" },
      lakeBase: { type: "f32" },
      riverBase: { type: "f32" },
      tempBase: { type: "f32" },
      humidityBase: { type: "f32" },
      seasonAmp: { type: "f32" },
      seasonPhase: { type: "f32" },
      // Derived + scratch (pingPong inferred from `advances`).
      flags: { type: "u32" },
      temperature: { type: "f32" },
      precipitation: { type: "f32" },
      fill: { type: "f32" },
      dir: { type: "u32" },
      water: { type: "f32" },
      irrigation: { type: "f32" },
      humidity: { type: "f32" },
      // Fixed-size accumulators for the reduce-to-uniform (histogram → quantile).
      hist: { type: "u32", count: 256 },
      G: { type: "u32", count: 4 },
    },
    steps: [
      { pass: "flags_from_mask", binds: ["waterMask", "lakeBase", "flags!"] },
      {
        pass: "histogram",
        binds: [
          "elevation",
          "flags",
          "hist:array<atomic<u32>, 256>!",
          "G:GlobalsAtomic!",
        ],
      },
      {
        pass: "quantile",
        binds: ["hist:array<u32, 256>", "G:Globals!"],
        kind: "single",
      },
      {
        pass: "climate",
        binds: [
          "P",
          "elevation",
          "flags",
          "G:Globals",
          "tempBase",
          "humidityBase",
          "seasonAmp",
          "seasonPhase",
          "temperature!",
          "precipitation!",
        ],
      },
      {
        pass: "fill_init",
        binds: ["P", "elevation", "flags", "fill.write"],
        advances: ["fill"],
      },
      {
        pass: "fill_step",
        binds: ["elevation", "flags", "fill.read", "fill.write"],
        advances: ["fill"],
        iterate: 320,
      },
      { pass: "flow_dir", binds: ["P", "fill.read", "flags", "dir!"] },
      {
        pass: "water_init",
        binds: ["flags", "precipitation", "water.write"],
        advances: ["water"],
      },
      {
        pass: "water_step",
        binds: [
          "P",
          "flags",
          "precipitation",
          "dir",
          "water.read",
          "water.write",
        ],
        advances: ["water"],
        iterate: 320,
      },
      { pass: "water_max", binds: ["flags", "water.read", "G:GlobalsAtomic!"] },
      {
        pass: "irrigation_init",
        binds: ["flags", "water.read", "G:Globals", "irrigation.write"],
        advances: ["irrigation"],
      },
      {
        pass: "irrigation_step",
        binds: [
          "flags",
          "water.read",
          "G:Globals",
          "irrigation.read",
          "irrigation.write",
        ],
        advances: ["irrigation"],
        iterate: 8,
      },
      {
        pass: "humidity_biome",
        binds: [
          "P",
          "temperature",
          "precipitation",
          "irrigation.read",
          "humidityBase",
          "humidity!",
          "flags!",
        ],
      },
      {
        pass: "color",
        binds: [
          "P",
          "elevation",
          "flags",
          "temperature",
          "precipitation",
          "water.read",
          "fill.read",
          "humidity",
          "riverBase",
          "G:Globals",
          "out",
        ],
      },
    ],
  },
  modules: WORLDGEN_MODULES,
};
