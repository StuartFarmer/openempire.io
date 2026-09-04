import { describe, expect, test, vi } from "vitest";
import { FieldKernel } from "../src/client/webgpu/FieldKernel";

function readableKernel(capacity = 40) {
  const source = {} as GPUBuffer;
  const staging = {
    mapAsync: vi.fn().mockResolvedValue(undefined),
    getMappedRange: vi.fn(() => new ArrayBuffer(capacity * 4)),
    destroy: vi.fn(),
  };
  const copyBufferToBuffer = vi.fn();
  const encoder = {
    copyBufferToBuffer,
    finish: vi.fn(() => ({}) as GPUCommandBuffer),
  };
  const kernel = Object.create(FieldKernel.prototype) as any;
  kernel.bufferSpecs = new Map([
    ["food", { name: "food", type: "u32", count: capacity, readable: true }],
  ]);
  kernel.fixedBuffers = new Map([["food", [source]]]);
  kernel.gridBuffers = new Map();
  kernel.polarity = new Map();
  kernel.device = {
    createBuffer: vi.fn(() => staging),
    createCommandEncoder: vi.fn(() => encoder),
    queue: { submit: vi.fn() },
  };
  return { kernel: kernel as FieldKernel, source, staging, copyBufferToBuffer };
}

describe("FieldKernel.readBuffer", () => {
  test("copies one requested word from its source element", async () => {
    const { kernel, source, staging, copyBufferToBuffer } = readableKernel();

    await kernel.readBuffer("food", 1, 37);

    expect(copyBufferToBuffer).toHaveBeenCalledWith(
      source,
      37 * 4,
      staging,
      0,
      4,
    );
  });

  test("clamps a ranged read to the remaining capacity", async () => {
    const { kernel, source, staging, copyBufferToBuffer } = readableKernel();

    await kernel.readBuffer("food", 20, 38);

    expect(copyBufferToBuffer).toHaveBeenCalledWith(
      source,
      38 * 4,
      staging,
      0,
      2 * 4,
    );
  });

  test.each([-1, 1.5])("rejects invalid source element %s", async (offset) => {
    const { kernel, copyBufferToBuffer } = readableKernel();

    await expect(kernel.readBuffer("food", 1, offset)).rejects.toThrow(
      "firstElement",
    );
    expect(copyBufferToBuffer).not.toHaveBeenCalled();
  });
});
