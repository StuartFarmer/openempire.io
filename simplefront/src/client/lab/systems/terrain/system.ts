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
  kind: "study",
  defaultMap: "EarthXL",
  defaultView: "terrain",
  views: {},
  derive: {
    typeImports: "import package::types::{Params, Globals, GlobalsAtomic};",
    // Terrain owns its uniform ("TP") so a composed game keeps "P" for its own
    // params. The pass bodies still read it as `P` (bound by index).
    uniform: { wgslType: "Params", bytes: PARAMS_BYTES, name: "TP" },
    // Declared map inputs (phase 3): which sidecar plane fills each input
    // field. loadMapInputs reproduces the shell's hand-decode from this.
    inputs: {
      elevation: { from: "elevation" },
      tempBase: { from: "layers", plane: "temperature" },
      humidityBase: { from: "layers", plane: "humidity" },
      lakeBase: { from: "hydro", plane: "lake" },
      riverBase: { from: "hydro", plane: "river" },
      seasonAmp: {
        from: "season",
        plane: "amplitude",
        scale: SEASON_AMP_SCALE,
      },
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
      // Map inputs (uploaded by the page/loader before deriving). `elevation`
      // is exposed so games can read raw altitude.
      elevation: { type: "f32", exposed: true },
      waterMask: { type: "u32" },
      lakeBase: { type: "f32" },
      riverBase: { type: "f32" },
      tempBase: { type: "f32" },
      humidityBase: { type: "f32" },
      seasonAmp: { type: "f32" },
      seasonPhase: { type: "f32" },
      // Derived + scratch (pingPong inferred from `advances`). The rich climate
      // outputs a GAME reads are `exposed` to the layer registry.
      flags: { type: "u32", exposed: true },
      temperature: { type: "f32", exposed: true },
      precipitation: { type: "f32", exposed: true },
      fill: { type: "f32", exposed: true },
      dir: { type: "u32" },
      water: { type: "f32", exposed: true },
      waterNormalized: { type: "f32" },
      irrigation: { type: "f32" },
      humidity: { type: "f32", exposed: true },
      // The FINAL terrain color (rgb8 packed) — games composite overlays over
      // it (shared::palette::unpackTint). Written by pack_tint after color.
      tint: { type: "u32", exposed: true },
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
        pass: "climate_temperature",
        binds: [
          "TP",
          "elevation",
          "flags",
          "G:Globals",
          "tempBase",
          "seasonAmp",
          "seasonPhase",
          "temperature!",
        ],
        tiers: ["recolor", "season"],
      },
      {
        pass: "climate_precipitation",
        binds: [
          "TP",
          "elevation",
          "flags",
          "G:Globals",
          "tempBase",
          "humidityBase",
          "seasonAmp",
          "seasonPhase",
          "precipitation!",
        ],
        tiers: ["recolor", "season"],
      },
      {
        pass: "fill_init",
        binds: ["TP", "elevation", "flags", "fill.write"],
        advances: ["fill"],
      },
      {
        pass: "fill_step",
        binds: ["elevation", "flags", "fill.read", "fill.write"],
        advances: ["fill"],
        iterate: 320,
      },
      { pass: "flow_dir", binds: ["TP", "fill.read", "flags", "dir!"] },
      {
        pass: "water_init",
        binds: ["flags", "precipitation", "water.write"],
        advances: ["water"],
      },
      {
        pass: "water_step",
        binds: [
          "TP",
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
        pass: "water_normalize",
        binds: ["water.read", "G:Globals", "waterNormalized!"],
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
          "TP",
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
          "TP",
          "elevation",
          "flags",
          "temperature",
          "precipitation",
          "waterNormalized",
          "fill.read",
          "humidity",
          "riverBase",
          "out",
        ],
        tiers: ["recolor", "season", "repaint"],
      },
      // Pack the rendered terrain color into `tint` for game overlays by
      // sampling the prior color output; runs in the same color tiers.
      {
        pass: "pack_tint",
        binds: ["out.read", "tint!"],
        tiers: ["recolor", "season", "repaint"],
      },
    ],
  },
  modules: WORLDGEN_MODULES,
};

// Compose a game ruleset onto the shared terrain base (add-games-on-terrain):
// the game gains terrain's derivation (the `TP` uniform, inputs, prep, and the
// exposed climate fields its layers read via `layers::…`) plus the worldgen
// pass modules. The game keeps its own layers/views/params/players/ai/input and
// its own `P` uniform. `composeTerrain(game)` is what the viewer mounts; a
// game manifest never references terrain itself.
//
// A game MAY bring its own derivation steps. This used to be impossible —
// `derive: terrain.derive` overwrote them outright — which meant a composed
// game could only ever do one update per layer per tick, and any algorithm
// needing iteration to convergence (a flood, a relaxation, a jump flood) had
// nowhere to live. The two pipelines are merged instead: terrain's steps run
// first so the game's can read the climate fields terrain derives, and the
// game's fields/inputs are added to terrain's.
//
// A game's per-refresh passes should carry their own `tiers` name (untagged
// steps run only in the full load-time derivation) and re-run via
// `runDerive(frame, "<tier>")`.
export function composeTerrain(game: FieldSystem): FieldSystem {
  const base = terrain.derive;
  const own = game.derive;
  if (base === undefined) throw new Error("terrain has no derivation");
  if (own === undefined) {
    return {
      ...game,
      derive: base,
      modules: { ...terrain.modules, ...game.modules },
    };
  }
  // One uniform per derivation, and terrain already owns it ("TP"). A game's
  // derivation passes read game state from buffers, not a second uniform.
  if (own.uniform !== undefined) {
    throw new Error(
      `${game.id}: a composed game's derivation cannot declare its own uniform ` +
        `(terrain owns "TP"); pass game state through derivation fields instead`,
    );
  }
  for (const name of Object.keys(own.fields)) {
    if (name in base.fields) {
      throw new Error(
        `${game.id}: derivation field "${name}" collides with terrain's`,
      );
    }
  }
  return {
    ...game,
    derive: {
      ...base,
      typeImports: [base.typeImports, own.typeImports]
        .filter((s) => s.length > 0)
        .join("\n"),
      fields: { ...base.fields, ...own.fields },
      // Terrain first: a game's passes read the climate fields it derives.
      steps: [...base.steps, ...own.steps],
      inputs: { ...(base.inputs ?? {}), ...(own.inputs ?? {}) },
    },
    modules: { ...terrain.modules, ...game.modules },
  };
}
