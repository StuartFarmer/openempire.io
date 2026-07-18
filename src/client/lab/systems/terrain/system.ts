import type { FieldSystem } from "../../../webgpu/FieldDynamics";
import { SEASON_AMP_SCALE } from "../../../webgpu/MapInputs";
import {
  PARAMS_BYTES,
  WORLDGEN_MODULES,
} from "../../../webgpu/WebGpuWorldEngine";
import { buildWaterMask } from "./waterMask";

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
    // Declared map inputs (phase 3): which sidecar plane fills each input
    // field. loadMapInputs reproduces the shell's hand-decode from this.
    inputs: {
      elevation: { from: "elevation" },
      tempBase: { from: "layers", plane: "temperature" },
      humidityBase: { from: "layers", plane: "humidity" },
      lakeBase: { from: "hydro", plane: "lake" },
      riverBase: { from: "hydro", plane: "river" },
      seasonAmp: { from: "season", plane: "amplitude", scale: SEASON_AMP_SCALE },
      seasonPhase: { from: "season", plane: "phase" },
      // The connected-components sea/lake mask — no single sidecar gives it.
      waterMask: { from: "prepare" },
    },
    // Turn map.bin + decoded elevation into the sea/lake classification.
    prepare: ({ width, height, config, sidecars, inputs }) => {
      const out: Record<string, Float32Array | Uint32Array> = {};
      const terrain = sidecars.map;
      const elevation = inputs.elevation;
      if (!terrain || !(elevation instanceof Float32Array)) return out;
      const seaLevel = (config as { seaLevel: number }).seaLevel;
      out.waterMask = buildWaterMask(
        terrain,
        elevation,
        seaLevel,
        width,
        height,
      );
      return out;
    },
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
    // Tiers (two-tier reactivity): "recolor" re-runs every cheap pass over the
    // settled fill/flow buffers (climate/color knob change); "season" is the
    // per-tick sweep (year phase → temperature → ice line → color); "repaint"
    // is a view-mode switch (color only). Untagged steps (fill/flow/water) run
    // only in the full derivation (load time). Matches TerrainDerivation.
    steps: [
      {
        pass: "flags_from_mask",
        binds: ["waterMask", "lakeBase", "flags!"],
        tiers: ["recolor"],
      },
      {
        pass: "histogram",
        binds: [
          "elevation",
          "flags",
          "hist:array<atomic<u32>, 256>!",
          "G:GlobalsAtomic!",
        ],
        tiers: ["recolor"],
      },
      {
        pass: "quantile",
        binds: ["hist:array<u32, 256>", "G:Globals!"],
        kind: "single",
        tiers: ["recolor"],
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
        tiers: ["recolor", "season"],
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
      {
        pass: "water_max",
        binds: ["flags", "water.read", "G:GlobalsAtomic!"],
        tiers: ["recolor"],
      },
      {
        pass: "irrigation_init",
        binds: ["flags", "water.read", "G:Globals", "irrigation.write"],
        advances: ["irrigation"],
        tiers: ["recolor"],
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
        tiers: ["recolor"],
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
        tiers: ["recolor", "season"],
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
        tiers: ["recolor", "season", "repaint"],
      },
    ],
  },
  modules: WORLDGEN_MODULES,
};
