import { afterEach, describe, expect, test, vi } from "vitest";
import {
  growSimplePlotsCpu,
  type SimplePlotEconomyConfig,
  type SimplePlotInput,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import { SimpleGpuGrowth } from "../src/client/games/leanfront-simple/economy/SimpleGpuGrowth";
import { FieldKernel } from "../src/client/webgpu/FieldKernel";

const farm = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 1,
  tile: 8,
  owner: 2,
  kind: "farm",
  level: 1,
  stock: 2_000,
  ...overrides,
});

const city = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 2,
  tile: 9,
  owner: 2,
  kind: "city",
  level: 1,
  stock: 2_000,
  ...overrides,
});

const config: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};

afterEach(() => vi.restoreAllMocks());

describe("LeanFront Simple GPU growth", () => {
  test.each([
    ["empty", []],
    ["seeded", [farm({ stock: 2_000 })]],
    ["near cap", [city({ stock: 19_999 })]],
    ["upgraded", [farm({ level: 4, stock: 31_337 })]],
    ["overflow", [city({ stock: 25_000 })]],
    ["large", [farm({ level: 1_000, stock: 8_000_000 })]],
    ["precise large", [farm({ level: 1_000, stock: 16_777_001 })]],
  ] satisfies readonly [string, readonly SimplePlotInput[]][])(
    "matches CPU for %s records",
    async (_name, records) => {
      const gpu = await SimpleGpuGrowth.create();
      if (!gpu) return;
      const actual = await gpu.grow(records, config);
      expect(actual).toEqual(await growSimplePlotsCpu(records, config));
      for (const growth of actual) {
        expect(growth.nextStock - growth.stock).toBe(growth.growth);
      }
      gpu.dispose();
    },
  );

  test("returns null without WebGPU", async () => {
    vi.spyOn(FieldKernel, "isSupported").mockReturnValue(false);
    expect(await SimpleGpuGrowth.create()).toBeNull();
  });

  test("dispose destroys its kernel", async () => {
    const destroy = vi.fn();
    vi.spyOn(FieldKernel, "isSupported").mockReturnValue(true);
    vi.spyOn(FieldKernel, "create").mockResolvedValue({ destroy } as never);

    const gpu = await SimpleGpuGrowth.create();

    expect(gpu).not.toBeNull();
    gpu?.dispose();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("uploads one compact batch and reads exactly its requested words", async () => {
    const resize = vi.fn();
    const writeUniform = vi.fn();
    const writeBuffer = vi.fn();
    const pass = vi.fn();
    const finish = vi.fn().mockResolvedValue({});
    const readBuffer = vi.fn(
      async (_name: string, count: number) =>
        new Uint32Array(count).fill(2_276).buffer,
    );
    const destroy = vi.fn();
    vi.spyOn(FieldKernel, "isSupported").mockReturnValue(true);
    vi.spyOn(FieldKernel, "create").mockResolvedValue({
      resize,
      writeUniform,
      writeBuffer,
      beginFrame: () => ({ pass, finish }),
      readBuffer,
      destroy,
    } as never);

    const gpu = await SimpleGpuGrowth.create();
    await gpu?.grow([farm()], config);
    await gpu?.grow([], config);

    expect(resize).toHaveBeenNthCalledWith(1, 1, 1);
    expect(resize).toHaveBeenNthCalledWith(2, 1, 1);
    const params = writeUniform.mock.calls[0]?.[1] as ArrayBuffer;
    const view = new DataView(params);
    expect([
      view.getUint32(0, true),
      view.getFloat32(4, true),
      view.getFloat32(8, true),
    ]).toEqual([20_000, Math.fround(0.03), Math.fround(0.06)]);
    expect(
      writeBuffer.mock.calls.map(([name, values]) => [
        name,
        [...(values as Uint32Array)],
      ]),
    ).toEqual([
      ["stock", [2_000]],
      ["level", [1]],
      ["kind", [2]],
      ["stock", [0]],
      ["level", [0]],
      ["kind", [0]],
    ]);
    expect(pass).toHaveBeenCalledTimes(2);
    expect(pass).toHaveBeenCalledWith("nextStock");
    expect(finish).toHaveBeenCalledTimes(2);
    expect(readBuffer.mock.calls).toEqual([
      ["nextStock", 1],
      ["nextStock", 0],
    ]);
    gpu?.dispose();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("rejects a short GPU readback", async () => {
    vi.spyOn(FieldKernel, "isSupported").mockReturnValue(true);
    vi.spyOn(FieldKernel, "create").mockResolvedValue({
      resize: vi.fn(),
      writeUniform: vi.fn(),
      writeBuffer: vi.fn(),
      beginFrame: () => ({ pass: vi.fn(), finish: vi.fn() }),
      readBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      destroy: vi.fn(),
    } as never);

    const gpu = await SimpleGpuGrowth.create();

    await expect(gpu?.grow([farm()], config)).rejects.toThrow(
      "readback length mismatch",
    );
  });

  test("permanently falls back to CPU after a rejected GPU batch", async () => {
    vi.resetModules();
    const grow = vi.fn().mockRejectedValue(new Error("device lost"));
    const dispose = vi.fn();
    vi.doMock(
      "../src/client/games/leanfront-simple/economy/SimpleGpuGrowth",
      () => ({
        SimpleGpuGrowth: {
          create: vi.fn().mockResolvedValue({ grow, dispose }),
        },
      }),
    );
    const { createRuntime } =
      await import("../src/client/games/leanfront-simple/runtime");
    const frames: unknown[] = [];
    const economy = {
      install: vi.fn(),
      prepare: async (_game: unknown, batch: typeof growSimplePlotsCpu) =>
        frames.push(await batch([farm()], config)),
      resolvePlotAction: vi.fn(),
      plotFrame: vi.fn(),
      stats: vi.fn(),
      dispose: vi.fn(),
    };

    const runtime = await createRuntime({} as never, economy as never);
    await runtime.beforeTick();
    await runtime.beforeTick();

    expect(grow).toHaveBeenCalledOnce();
    expect(frames).toEqual([
      await growSimplePlotsCpu([farm()], config),
      await growSimplePlotsCpu([farm()], config),
    ]);
    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
