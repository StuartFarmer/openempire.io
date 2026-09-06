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

  test.each([-1, 1.5, Number.NaN])(
    "rejects invalid element count %s",
    async (elements) => {
      const { kernel, copyBufferToBuffer } = readableKernel();

      await expect(kernel.readBuffer("food", elements, 0)).rejects.toThrow(
        "elements",
      );
      expect(copyBufferToBuffer).not.toHaveBeenCalled();
    },
  );
});

test("destroys an owned device when kernel construction fails", async () => {
  const destroy = vi.fn();
  const device = { addEventListener: vi.fn(), destroy };
  const adapter = {
    limits: { maxStorageBuffersPerShaderStage: 8 },
    info: undefined,
    requestDevice: vi.fn().mockResolvedValue(device),
  };
  const previous = Object.getOwnPropertyDescriptor(navigator, "gpu");
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
      getPreferredCanvasFormat: vi.fn(),
    },
  });

  try {
    await expect(
      FieldKernel.create(null, {
        buffers: [
          { name: "duplicate", type: "u32" },
          { name: "duplicate", type: "u32" },
        ],
        passes: [],
      }),
    ).rejects.toThrow('Duplicate field buffer "duplicate"');
  } finally {
    if (previous) Object.defineProperty(navigator, "gpu", previous);
    else delete (navigator as { gpu?: GPU }).gpu;
  }

  expect(destroy).toHaveBeenCalledOnce();
});
