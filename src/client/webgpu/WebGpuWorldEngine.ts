import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../../games/alternative/world/WorldEngineElevation";
import { linkDerivation, type DerivationPass } from "./FieldDerivation";
import { FieldKernel, type FieldKernelConfig } from "./FieldKernel";

// GPU port of the world engine, authored as WESL modules: every pass is a
// real `.wesl` file in src/client/worldgen/passes/ (a `fn tile(x, y, i)` or
// `fn once()` importing what it uses from package::kernel / package::types /
// package::palette / package::bindings). This table is the wiring: buffers,
// per-pass bind lists (which generate the package::bindings module each pass
// imports), iteration counts, and the dispatch program.
//
// Per-pixel stages are exact ports of WorldEngineElevation.ts; the serial CPU
// algorithms are reformulated as iterative ping-pong passes:
//   ocean BFS flood fill      -> one-step frontier propagation, N passes
//   priority-flood drainage   -> Barnes-style iterative depression fill
//   topological flow routing  -> steepest-descent gather, N passes
//   land elevation quantile   -> 256-bin atomic histogram + scan
// so results are visually equivalent, not bit-identical, to the CPU engine.

export const WEBGPU_VIEW_MODES = [
  "terrain",
  "elevation",
  "temperature",
  "precipitation",
  "rivers",
  "humidity",
  "biome",
] as const;

export type WebGpuViewMode = (typeof WEBGPU_VIEW_MODES)[number];

export interface WebGpuGenerateResult {
  gpuMs: number;
  dispatches: number;
  width: number;
  height: number;
}

// Params struct size (see worldgen/types.wesl): seed + viewMode + 14 climate
// floats + 3 seasonal + 5 runtime + useSeasonField = 96 (exactly the uniform
// 16-byte alignment; the next field bumps to 112).
export const PARAMS_BYTES = 96;

/** Seasonal model inputs — all zero renders the static annual mean. */
export interface WorldgenSeasonalParams {
  /** Axial tilt in degrees (Earth ≈ 23.4). */
  tilt: number;
  /** Position in the year, 0..1. */
  yearPhase: number;
  /** Amplitude multiplier for the seasonal swing. */
  seasonStrength: number;
}

export const NO_SEASONS: WorldgenSeasonalParams = {
  tilt: 0,
  yearPhase: 0,
  seasonStrength: 0,
};

/** Runtime-derivation extras; the procedural generator leaves them zero. */
export interface WorldgenRuntimeParams {
  /** Land below this temperature classifies as Ice; 0 disables. */
  iceThreshold: number;
  /** True: REAL climate base — temperature and moisture from the shipped
   * tempBase/humidityBase planes, nothing synthetic. */
  useClimateBase: boolean;
  /** Snow-cover gradient width above iceThreshold. */
  snowBand: number;
  /** Smoothstep half-width across biome band edges; 0 = hard cuts. */
  biomeBlend: number;
  /** True: seasonal swing from the uploaded amplitude/phase fields. */
  useSeasonField: boolean;
}

export const NO_RUNTIME: WorldgenRuntimeParams = {
  iceThreshold: 0,
  useClimateBase: false,
  snowBand: 0,
  biomeBlend: 0,
  useSeasonField: false,
};

export const WORLDGEN_MODULES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../worldgen/**/*.wesl", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  ).map(([path, source]) => [path.replace(/^.*\/worldgen\//, ""), source]),
);

const BUFFER_TYPES: Record<string, "f32" | "u32"> = {
  elevation: "f32",
  ocean: "u32",
  waterMask: "u32",
  tempBase: "f32",
  humidityBase: "f32",
  seasonAmp: "f32",
  seasonPhase: "f32",
  lakeBase: "f32",
  riverBase: "f32",
  flags: "u32",
  temperature: "f32",
  precipitation: "f32",
  fill: "f32",
  dir: "u32",
  water: "f32",
  irrigation: "f32",
  humidity: "f32",
  G: "u32",
  hist: "u32",
};

// The worldgen wiring is a derivation pass table (shared FieldDerivation).
const PASS_TABLE: readonly DerivationPass[] = [
  { name: "elevation", module: "elevation", binds: ["P", "elevation!"] },
  {
    name: "oceanInit",
    module: "ocean_init",
    binds: ["P", "elevation", "waterMask", "ocean.write"],
    advances: ["ocean"],
  },
  {
    name: "oceanStep",
    module: "ocean_step",
    binds: ["P", "elevation", "ocean.read", "ocean.write"],
    advances: ["ocean"],
  },
  {
    name: "oceanScanX",
    module: "ocean_scan_x",
    binds: ["P", "elevation", "ocean.read", "ocean.write"],
    advances: ["ocean"],
  },
  {
    name: "oceanScanY",
    module: "ocean_scan_y",
    binds: ["P", "elevation", "ocean.read", "ocean.write"],
    advances: ["ocean"],
  },
  {
    name: "flagsInit",
    module: "flags_init",
    binds: ["ocean.read", "flags!"],
  },
  {
    // Faithful runtime derivation: flags straight from the shipped map's
    // water classification (+ real lakes from the water plane), bypassing
    // the flood and lake thresholds.
    name: "flagsFromMask",
    module: "flags_from_mask",
    binds: ["waterMask", "lakeBase", "flags!"],
  },
  {
    name: "histogram",
    module: "histogram",
    binds: [
      "elevation",
      "flags",
      "hist:array<atomic<u32>, 256>!",
      "G:GlobalsAtomic!",
    ],
  },
  {
    name: "quantile",
    module: "quantile",
    binds: ["hist:array<u32, 256>", "G:Globals!"],
    kind: "single",
  },
  {
    name: "climate",
    module: "climate",
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
    name: "fillInit",
    module: "fill_init",
    binds: ["P", "elevation", "flags", "fill.write"],
    advances: ["fill"],
  },
  {
    name: "fillStep",
    module: "fill_step",
    binds: ["elevation", "flags", "fill.read", "fill.write"],
    advances: ["fill"],
  },
  {
    name: "flowDir",
    module: "flow_dir",
    binds: ["P", "fill.read", "flags", "dir!"],
  },
  {
    name: "waterInit",
    module: "water_init",
    binds: ["flags", "precipitation", "water.write"],
    advances: ["water"],
  },
  {
    name: "waterStep",
    module: "water_step",
    binds: ["P", "flags", "precipitation", "dir", "water.read", "water.write"],
    advances: ["water"],
  },
  {
    name: "waterMax",
    module: "water_max",
    binds: ["flags", "water.read", "G:GlobalsAtomic!"],
  },
  {
    name: "lakes",
    module: "lakes",
    binds: ["P", "elevation", "fill.read", "water.read", "flags!"],
  },
  {
    name: "lakeSpread",
    module: "lake_spread",
    binds: ["P", "elevation", "fill.read", "flags!"],
  },
  {
    name: "irrigationInit",
    module: "irrigation_init",
    binds: ["flags", "water.read", "G:Globals", "irrigation.write"],
    advances: ["irrigation"],
  },
  {
    name: "irrigationStep",
    module: "irrigation_step",
    binds: [
      "flags",
      "water.read",
      "G:Globals",
      "irrigation.read",
      "irrigation.write",
    ],
    advances: ["irrigation"],
  },
  {
    name: "humidityBiome",
    module: "humidity_biome",
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
    name: "color",
    module: "color",
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
];

// The worldgen shares FieldDerivation's pass-linking; the only worldgen-
// specific inputs are the buffer types, the source modules, and the shared
// struct-types import (worldgen/types.wesl).
const WORLDGEN_TYPE_IMPORTS =
  "import package::types::{Params, Globals, GlobalsAtomic};";

function linkPasses() {
  return linkDerivation({
    passTable: PASS_TABLE,
    modules: WORLDGEN_MODULES,
    bufferTypes: BUFFER_TYPES,
    typeImports: WORLDGEN_TYPE_IMPORTS,
    sourceLabel: (pass) => `worldgen/passes/${pass.module}.wesl`,
  });
}

export async function worldgenKernelConfig(): Promise<FieldKernelConfig> {
  return {
    uniforms: [{ name: "P", bytes: PARAMS_BYTES, wgslType: "Params" }],
    buffers: [
      // clearable so runtime derivation can upload a decoded elevation.bin
      // instead of running the procedural elevation pass.
      { name: "elevation", type: "f32", clearable: true },
      { name: "ocean", type: "u32", pingPong: true },
      // Shipped water classification (0 land / 1 sea / 2 lake); zeroed for
      // procedural generation.
      { name: "waterMask", type: "u32", clearable: true },
      // Real climate base planes (layers.bin); zeroed when the synthetic
      // model is in use.
      { name: "tempBase", type: "f32", clearable: true },
      { name: "humidityBase", type: "f32", clearable: true },
      // Seasonal harmonic (season.bin) — amplitude (normalized temp units) +
      // phase (year fraction); zeroed when using the latitude model.
      { name: "seasonAmp", type: "f32", clearable: true },
      { name: "seasonPhase", type: "f32", clearable: true },
      // Shipped hydro planes (hydro.bin) — lake mask + river channels, kept
      // distinct; zeroed for procedural generation.
      { name: "lakeBase", type: "f32", clearable: true },
      { name: "riverBase", type: "f32", clearable: true },
      { name: "flags", type: "u32" },
      { name: "temperature", type: "f32" },
      { name: "precipitation", type: "f32" },
      { name: "fill", type: "f32", pingPong: true },
      { name: "dir", type: "u32" },
      { name: "water", type: "f32", pingPong: true },
      { name: "irrigation", type: "f32", pingPong: true },
      { name: "humidity", type: "f32" },
      { name: "G", type: "u32", count: 4, clearable: true },
      { name: "hist", type: "u32", count: 256, clearable: true },
    ],
    passes: await linkPasses(),
  };
}

export class WebGpuWorldEngine {
  private constructor(private readonly kernel: FieldKernel) {}

  get adapterInfo(): string {
    return this.kernel.adapterInfo;
  }

  static isSupported(): boolean {
    return FieldKernel.isSupported();
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuWorldEngine> {
    return new WebGpuWorldEngine(
      await FieldKernel.create(canvas, await worldgenKernelConfig()),
    );
  }

  destroy(): void {
    this.kernel.destroy();
  }

  async generate(
    config: Partial<FoundationWorldEngineMapConfig>,
    viewMode: WebGpuViewMode,
  ): Promise<WebGpuGenerateResult> {
    const normalized = normalizeFoundationWorldEngineMapConfig(config);
    const { width, height } = normalized;
    this.kernel.resize(width, height);
    this.kernel.writeUniform("P", buildWorldgenParams(normalized, viewMode));
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");
    this.kernel.clearBuffer("waterMask");
    this.kernel.clearBuffer("tempBase");
    this.kernel.clearBuffer("humidityBase");
    this.kernel.clearBuffer("seasonAmp");
    this.kernel.clearBuffer("seasonPhase");
    this.kernel.clearBuffer("lakeBase");
    this.kernel.clearBuffer("riverBase");

    const maxDim = Math.max(width, height);
    const fillIters = Math.min(maxDim, 320);
    const flowIters = Math.min(maxDim, 320);

    const frame = this.kernel.beginFrame();
    frame.pass("elevation");
    frame.pass("oceanInit");
    // Separable scans reach the interior in a few alternations; the local
    // frontier steps mop up narrow diagonal channels. The flood fixpoint is
    // unique, so the method change does not alter the result.
    for (let k = 0; k < 12; k += 1) {
      frame.pass("oceanScanX");
      frame.pass("oceanScanY");
    }
    frame.iterate("oceanStep", 64);
    frame.pass("flagsInit");
    frame.pass("histogram");
    frame.pass("quantile");
    frame.pass("climate");
    frame.pass("fillInit");
    frame.iterate("fillStep", fillIters);
    frame.pass("flowDir");
    frame.pass("waterInit");
    frame.iterate("waterStep", flowIters);
    frame.pass("waterMax");
    frame.pass("lakes");
    frame.iterate("lakeSpread", 12);
    frame.pass("irrigationInit");
    frame.iterate("irrigationStep", 8);
    frame.pass("humidityBiome");
    frame.pass("color");
    frame.present();
    const result = await frame.finish();
    return { ...result, width, height };
  }
}

export function buildWorldgenParams(
  config: FoundationWorldEngineMapConfig,
  viewMode: WebGpuViewMode,
  seasonal: WorldgenSeasonalParams = NO_SEASONS,
  runtime: WorldgenRuntimeParams = NO_RUNTIME,
): ArrayBuffer {
  const data = new ArrayBuffer(PARAMS_BYTES);
  const view = new DataView(data);
  view.setInt32(0, config.seed, true);
  view.setUint32(4, Math.max(0, WEBGPU_VIEW_MODES.indexOf(viewMode)), true);
  const floats: number[] = [
    config.seaLevel,
    config.continentScale,
    config.mountainStrength,
    config.coastFalloff,
    config.coastRoughness,
    config.latitudeEffect,
    config.elevationCooling,
    config.rainNoise,
    config.warmthRainfall,
    config.riverFlowRetention,
    config.lakeWaterThreshold,
    config.lakeElevationRange,
    config.riverWeakThreshold,
    config.riverStrongThreshold,
    seasonal.tilt,
    seasonal.yearPhase,
    seasonal.seasonStrength,
    runtime.iceThreshold,
    runtime.useClimateBase ? 1 : 0,
    runtime.snowBand,
    runtime.biomeBlend,
    runtime.useSeasonField ? 1 : 0,
  ];
  floats.forEach((value, index) => {
    view.setFloat32(8 + index * 4, value, true);
  });
  return data;
}
