import { compileFieldSystem } from "../../../webgpu/FieldDynamics";
import { FieldKernel } from "../../../webgpu/FieldKernel";
import {
  growSimplePlot,
  type SimplePlotEconomyConfig,
  type SimplePlotGrowth,
  type SimplePlotInput,
} from "./SimpleEconomy";
import { simpleGrowthSystem } from "./growth-system";

export class SimpleGpuGrowth {
  private constructor(private readonly kernel: FieldKernel) {}

  static async create(): Promise<SimpleGpuGrowth | null> {
    if (!FieldKernel.isSupported()) return null;
    let kernel: FieldKernel | null = null;
    try {
      const compiled = await compileFieldSystem(simpleGrowthSystem);
      kernel = await FieldKernel.create(null, compiled.kernelConfig);
      return new SimpleGpuGrowth(kernel);
    } catch {
      kernel?.destroy();
      return null;
    }
  }

  async grow(
    records: readonly SimplePlotInput[],
    config: SimplePlotEconomyConfig,
  ): Promise<readonly SimplePlotGrowth[]> {
    if (
      config.capacityPerLevel > 0xffffffff ||
      records.some(
        (record) =>
          record.stock < 0 ||
          record.stock > 0xffffffff ||
          record.level < 1 ||
          record.level > 0xffffffff ||
          config.capacityPerLevel * record.level > 0xffffffff,
      )
    ) {
      return records.map((record) => growSimplePlot(record, config));
    }
    const length = Math.max(1, records.length);
    const stock = new Uint32Array(length);
    const level = new Uint32Array(length);
    const kind = new Uint32Array(length);
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i]!;
      stock[i] = record.stock;
      level[i] = Math.max(1, Math.floor(record.level));
      kind[i] = record.kind === "farm" ? 2 : 1;
    }
    this.kernel.resize(length, 1);
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setUint32(0, config.capacityPerLevel, true);
    view.setFloat32(4, config.cityGrowthRate, true);
    view.setFloat32(8, config.farmGrowthRate, true);
    this.kernel.writeUniform("P", params);
    this.kernel.writeBuffer("stock", stock);
    this.kernel.writeBuffer("level", level);
    this.kernel.writeBuffer("kind", kind);
    const frame = this.kernel.beginFrame();
    frame.pass("nextStock");
    await frame.finish();
    const nextStock = new Uint32Array(
      await this.kernel.readBuffer("nextStock", records.length),
    );
    if (nextStock.length !== records.length) {
      throw new Error("GPU growth readback length mismatch");
    }
    return records.map((record, index) => ({
      ...growSimplePlot(record, config),
      nextStock: nextStock[index]!,
    }));
  }

  dispose(): void {
    this.kernel.destroy();
  }
}
