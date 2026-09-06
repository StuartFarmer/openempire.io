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
    this.kernel.writeUniform(
      "P",
      new Float32Array([
        config.capacityPerLevel,
        config.cityGrowthRate,
        config.farmGrowthRate,
        0,
      ]),
    );
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
