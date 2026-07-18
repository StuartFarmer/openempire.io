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

// Parity harness (unify-field-viewer phase 2.4): the SAME derivation as
// TerrainDerivation, but run through the `terrain` FieldDynamics system —
// compileFieldSystem → FieldKernel → runDerive — instead of the hand-wired
// dispatch program. Feeds the identical inputs + Params, so its out texture
// should match TerrainDerivation pixel-for-pixel. Once verified, this replaces
// TerrainDerivation and the raw WebGpuWorldEngine (phase 5).
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

  /**
   * Full derivation through the system — mirrors TerrainDerivation.derive.
   * Inputs come as the declared-field record from `loadMapInputs` (keyed by
   * derive-field name); each present field is uploaded to its buffer, so the
   * system derives from exactly the fields the declaration produced.
   */
  async derive(
    fields: Readonly<Record<string, Float32Array | Uint32Array>>,
    config: Parameters<typeof buildWorldgenParams>[0],
    view: WebGpuViewMode,
    seasonal: WorldgenSeasonalParams,
    runtime: WorldgenRuntimeParams,
  ): Promise<void> {
    const width = config.width;
    const height = config.height;
    if (width !== this.width || height !== this.height) {
      this.kernel.resize(width, height);
      this.width = width;
      this.height = height;
    }
    // Upload every declared input field (elevation, waterMask, tempBase, …).
    for (const [name, data] of Object.entries(fields)) {
      this.kernel.writeBuffer(name, data);
    }
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(config, view, seasonal, runtime),
    );
    // Atomic accumulators must start zeroed.
    this.kernel.clearBuffer("G");
    this.kernel.clearBuffer("hist");

    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame);
    await frame.finish();
  }
}
