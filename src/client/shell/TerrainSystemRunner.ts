import type { WorldEngineManifestConfig } from "../../core/game/TerrainMapLoader";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../../games/alternative/world/WorldEngineElevation";
import { terrain } from "../lab/systems/terrain/system";
import {
  compileFieldSystem,
  type CompiledFieldSystem,
} from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import {
  buildWorldgenParams,
  type WebGpuViewMode,
  type WorldgenRuntimeParams,
  type WorldgenSeasonalParams,
} from "../webgpu/WebGpuWorldEngine";

// The shell's runtime terrain derivation, run through the `terrain`
// FieldDynamics system (unify-field-viewer): compileFieldSystem → headless
// FieldKernel → runDerive on the shell's shared device. A drop-in for the
// hand-wired TerrainDerivation — same inputs, same Params, pixel-identical
// output (verified in phase 2.4) — with the same re-run tiers driven by the
// system's step `tiers` instead of hand-listed pass programs:
//
//   full     — the whole stack (load time); reuploads the input fields.
//   recolor  — every cheap pass over the settled fill/flow buffers (a
//              climate/color knob changed); skips the iterated drainage.
//   season   — the per-tick sweep: climate → biome → color (year phase).
//   repaint  — the color pass only (view-mode switch).
//
// Inputs arrive as the declared-field record from `loadMapInputs` (keyed by
// derive-field name), so the system derives from exactly the fields the
// declaration produced.
export class TerrainSystemRunner {
  private width = 0;
  private height = 0;

  private constructor(
    private readonly kernel: FieldKernel,
    private readonly compiled: CompiledFieldSystem,
  ) {}

  static async create(device: GPUDevice): Promise<TerrainSystemRunner> {
    const compiled = await compileFieldSystem(terrain);
    const kernel = await FieldKernel.create(null, compiled.kernelConfig, {
      device,
    });
    return new TerrainSystemRunner(kernel, compiled);
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
   * Full tier: upload the primary fields and run the whole stack — mask flags,
   * climate over the real base, depression fill, flow routing, river
   * accumulation, biome, colors.
   */
  async derive(
    fields: Readonly<Record<string, Float32Array | Uint32Array>>,
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    const { width, height } = config;
    if (width !== this.width || height !== this.height) {
      this.kernel.resize(width, height);
      this.width = width;
      this.height = height;
    }
    // Upload every declared input field (elevation, waterMask, tempBase, …).
    for (const [name, data] of Object.entries(fields)) {
      this.kernel.writeBuffer(name, data);
    }
    this.writeParams(config, view, seasonal, runtime);
    // Atomic accumulators must start zeroed before the histogram/water reduce.
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");

    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame);
    await frame.finish();
  }

  /**
   * Recolor tier: re-run every cheap pass over the settled fill/flow buffers.
   * Flags rebuild from the mask; rivers keep the last computed watermap
   * (precipitation knobs fully land on the next map load).
   */
  async recolor(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    this.assertDerived();
    this.writeParams(config, view, seasonal, runtime);
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");
    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame, "recolor");
    await frame.finish();
  }

  /**
   * Seasonal tier: the per-tick sweep — temperature, temperature-dependent
   * biome bits (including the ice line), colors.
   */
  tickSeasons(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    this.assertDerived();
    this.writeParams(config, view, seasonal, runtime);
    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame, "season");
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
    this.writeParams(config, view, seasonal, runtime);
    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame, "repaint");
    await frame.finish();
  }

  private writeParams(
    config: FoundationWorldEngineMapConfig,
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): void {
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
  }

  private assertDerived(): void {
    if (this.width === 0) {
      throw new Error("TerrainSystemRunner: derive() has not run yet");
    }
  }
}
