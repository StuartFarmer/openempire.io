import type { WorldEngineManifestConfig } from "../../core/game/TerrainMapLoader";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../../games/alternative/world/WorldEngineElevation";
import {
  buildWaterMask,
  WATER_LAKE,
  WATER_LAND,
  WATER_SEA,
} from "../lab/systems/terrain/waterMask";
import { FieldKernel } from "../webgpu/FieldKernel";
import {
  buildWorldgenParams,
  worldgenKernelConfig,
  type WebGpuViewMode,
  type WorldgenRuntimeParams,
  type WorldgenSeasonalParams,
} from "../webgpu/WebGpuWorldEngine";

// Runtime terrain derivation (export-primary-fields): a headless worldgen
// kernel on the shell's shared device that derives climate → drainage →
// biome → terrain colors from the map's PRIMARY fields — elevation.bin, the
// shipped water classification (map.bin), and the baked temperature plane
// (layers.bin) as the real climate base. Water flags come straight from the
// map (flags_from_mask): no ocean flood, no threshold lake detection —
// 100% faithful to the shipped map. Re-run tiers:
//
//   seasonal tier  — climate + biome + color; runs per sim tick while a
//                    derived view is watched (year phase sweeps, the ice
//                    line advances and retreats).
//   recolor tier   — everything except the iterated fill/flow passes; runs
//                    when a climate/color knob changes.
//   full tier      — the whole stack including drainage; load time only.

// The water classification + buildWaterMask now live with the terrain system
// (its `prepare` hook, unify-field-viewer phase 3.2). Re-exported here so the
// shell's existing decode path keeps working until phase 5.
export { buildWaterMask, WATER_LAKE, WATER_LAND, WATER_SEA };

export interface DerivationFields {
  /** Decoded elevation.bin (world-engine space, 0..1). */
  elevation: Float32Array;
  /** buildWaterMask output. */
  waterMask: Uint32Array;
  /** The baked temperature plane (layers.bin), 0..1. */
  tempBase: Float32Array;
  /** The baked humidity plane (layers.bin) — real moisture, 0..1. */
  humidityBase: Float32Array;
  /** hydro.bin lake plane — standing water mask (map.bin misses inland
   * lakes), 0 or 1. */
  lakeBase: Float32Array;
  /** hydro.bin river plane — channel strength, 0..1. */
  riverBase: Float32Array;
  /** season.bin amplitude, in NORMALIZED temp units (°C / 65). Optional —
   * absent maps use the latitude model. */
  seasonAmp?: Float32Array;
  /** season.bin phase, year fraction of the peak, 0..1. */
  seasonPhase?: Float32Array;
}

export class TerrainDerivation {
  private width = 0;
  private height = 0;

  private constructor(private readonly kernel: FieldKernel) {}

  static async create(device: GPUDevice): Promise<TerrainDerivation> {
    const kernel = await FieldKernel.create(
      null,
      await worldgenKernelConfig(),
      {
        device,
      },
    );
    return new TerrainDerivation(kernel);
  }

  get outView(): GPUTextureView | null {
    return this.kernel.outView;
  }

  destroy(): void {
    this.kernel.destroy();
  }

  /** Merge the manifest config with the map's true dimensions (the
   * normalizer clamps to the interactive generator's cap). */
  normalizeConfig(
    config: WorldEngineManifestConfig,
    width: number,
    height: number,
  ): FoundationWorldEngineMapConfig {
    return {
      ...normalizeFoundationWorldEngineMapConfig(config),
      width,
      height,
    };
  }

  /**
   * Full tier: upload the primary fields and run the whole stack — mask
   * flags, climate over the real base, depression fill, flow routing, river
   * accumulation, biome, colors.
   */
  async derive(
    fields: DerivationFields,
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    const { width, height } = config;
    for (const [name, field] of Object.entries(fields)) {
      if (field && field.length !== width * height) {
        throw new Error(
          `${name} has ${field.length} values, expected ${width}x${height}`,
        );
      }
    }
    if (width !== this.width || height !== this.height) {
      this.kernel.resize(width, height);
      this.width = width;
      this.height = height;
    }
    this.kernel.writeBuffer("elevation", fields.elevation);
    this.kernel.writeBuffer("waterMask", fields.waterMask);
    this.kernel.writeBuffer("tempBase", fields.tempBase);
    this.kernel.writeBuffer("humidityBase", fields.humidityBase);
    this.kernel.writeBuffer("lakeBase", fields.lakeBase);
    this.kernel.writeBuffer("riverBase", fields.riverBase);
    // Season fields are optional; when absent the buffers stay cleared and
    // useSeasonField must be false (the caller's responsibility).
    if (fields.seasonAmp)
      this.kernel.writeBuffer("seasonAmp", fields.seasonAmp);
    if (fields.seasonPhase) {
      this.kernel.writeBuffer("seasonPhase", fields.seasonPhase);
    }
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");

    const maxDim = Math.max(width, height);
    const frame = this.kernel.beginFrame();
    frame.pass("flagsFromMask");
    frame.pass("histogram");
    frame.pass("quantile");
    frame.pass("climate");
    frame.pass("fillInit");
    frame.iterate("fillStep", Math.min(maxDim, 320));
    frame.pass("flowDir");
    frame.pass("waterInit");
    frame.iterate("waterStep", Math.min(maxDim, 320));
    frame.pass("waterMax");
    frame.pass("irrigationInit");
    frame.iterate("irrigationStep", 8);
    frame.pass("humidityBiome");
    frame.pass("color");
    await frame.finish();
  }

  /**
   * Recolor tier: re-run every cheap pass over the settled fill/flow
   * buffers. Flags rebuild from the mask; rivers keep the last computed
   * watermap (precipitation knobs fully land on the next map load).
   */
  async recolor(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    this.assertDerived();
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");
    const frame = this.kernel.beginFrame();
    frame.pass("flagsFromMask");
    frame.pass("histogram");
    frame.pass("quantile");
    frame.pass("climate");
    frame.pass("waterMax");
    frame.pass("irrigationInit");
    frame.iterate("irrigationStep", 8);
    frame.pass("humidityBiome");
    frame.pass("color");
    await frame.finish();
  }

  /**
   * Seasonal tier: the per-tick sweep — temperature, temperature-dependent
   * biome bits (including the ice line), colors. Three grid passes.
   */
  tickSeasons(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    this.assertDerived();
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
    const frame = this.kernel.beginFrame();
    frame.pass("climate");
    frame.pass("humidityBiome");
    frame.pass("color");
    return frame.finish().then(() => undefined);
  }

  /** Re-render only the color pass — switching debug view modes. */
  async repaint(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    this.assertDerived();
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
    const frame = this.kernel.beginFrame();
    frame.pass("color");
    await frame.finish();
  }

  private assertDerived(): void {
    if (this.width === 0) {
      throw new Error("TerrainDerivation: derive() has not run yet");
    }
  }
}
