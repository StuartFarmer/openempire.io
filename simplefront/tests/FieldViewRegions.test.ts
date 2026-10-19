import { afterEach, expect, test } from "vitest";
import { simplefront } from "../src/client/games/simplefront/system";
import {
  compileFieldSystem,
  defineFieldSystem,
  type FieldSystem,
} from "../src/client/webgpu/FieldDynamics";
import {
  type FieldFrame,
  FieldKernel,
  type FieldKernelConfig,
} from "../src/client/webgpu/FieldKernel";

const sourceSystem = (incremental: boolean): FieldSystem =>
  defineFieldSystem({
    id: "regions-test",
    name: "Regions test",
    views: {
      color: {
        source: `
          import package::layers;
          fn color(x: i32, y: i32, i: u32) -> vec4f {
            return vec4f(layers::state::val(i), f32(x), f32(y), 1.0);
          }
        `,
        incremental,
      },
    },
    modules: {
      "layers/state.wesl": `
        fn init(x: i32, y: i32, i: u32) -> f32 { return 0.0; }
      `,
    },
  });

test("incremental source views compile a clipped region entry point from the full view", async () => {
  const compiled = await compileFieldSystem(sourceSystem(true));
  const view = compiled.kernelConfig.passes.find(
    (pass) => pass.name === "view/color",
  )!;

  expect(view.regionCode).toContain("ViewRegions");
  expect(view.regionCode).toMatch(/if\s*\(any\(xy\s*>=\s*GRID\.size\)\)/);
  expect(view.regionCode).toContain("color(x, y, refOf(x, y))");
  expect(view.binds).toEqual(["state.read", "out"]);
  expect(compiled.runView).toBeTypeOf("function");
});

test("only SimpleFront opts into incremental view compilation", async () => {
  expect(simplefront.views.simplefront.incremental).toBe(true);
  const ordinary = await compileFieldSystem(sourceSystem(false));
  expect(
    ordinary.kernelConfig.passes.find((pass) => pass.name === "view/color")!
      .regionCode,
  ).toBeUndefined();
});

test("compiled views route an optional chunk list through the region pass", async () => {
  const compiled = await compileFieldSystem(sourceSystem(true));
  const calls: [string, Uint32Array?][] = [];
  const frame = {
    pass: (name: string) => calls.push([name]),
    passRegions: (name: string, chunks: Uint32Array) =>
      calls.push([name, chunks]),
  } as unknown as FieldFrame;
  const chunks = new Uint32Array([2, 5]);

  compiled.runView(frame, "color", chunks);
  compiled.runView(frame, "color");

  expect(calls).toEqual([["view/color", chunks], ["view/color"]]);
});

interface FakeBuffer {
  readonly bytes: ArrayBuffer;
  destroyed: boolean;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface FakeCommand {
  copies: Uint32Array[];
  dispatches: number[][];
  bindGroups: number[];
}

function fakeGpu(submitFails = false) {
  const layouts: GPUBindGroupLayoutDescriptor[] = [];
  const commands: FakeCommand[] = [];
  const submitted: FakeCommand[] = [];
  const buffers: FakeBuffer[] = [];
  const queueWrites: Uint32Array[] = [];

  const device = {
    queue: {
      writeBuffer(
        _buffer: GPUBuffer,
        _offset: number,
        data: ArrayBuffer | ArrayBufferView,
      ) {
        const view = ArrayBuffer.isView(data)
          ? new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)
          : new Uint32Array(data);
        queueWrites.push(view.slice());
      },
      submit(encoded: FakeCommand[]) {
        if (submitFails) throw new Error("submit failed");
        submitted.push(...encoded);
      },
      async onSubmittedWorkDone() {},
    },
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
      const buffer: FakeBuffer = {
        bytes: new ArrayBuffer(Number(descriptor.size)),
        destroyed: false,
        getMappedRange() {
          return this.bytes;
        },
        unmap() {},
        destroy() {
          this.destroyed = true;
        },
      };
      buffers.push(buffer);
      return buffer as unknown as GPUBuffer;
    },
    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor) {
      layouts.push(descriptor);
      return { descriptor } as unknown as GPUBindGroupLayout;
    },
    createShaderModule() {
      return {
        async getCompilationInfo() {
          return { messages: [] };
        },
      } as unknown as GPUShaderModule;
    },
    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor) {
      return { descriptor } as unknown as GPUPipelineLayout;
    },
    async createComputePipelineAsync(descriptor: GPUComputePipelineDescriptor) {
      return { descriptor } as unknown as GPUComputePipeline;
    },
    createCommandEncoder() {
      const command: FakeCommand = {
        copies: [],
        dispatches: [],
        bindGroups: [],
      };
      commands.push(command);
      return {
        copyBufferToBuffer(source: FakeBuffer) {
          command.copies.push(new Uint32Array(source.bytes.slice(0)));
        },
        beginComputePass() {
          return {
            setPipeline() {},
            setBindGroup(index: number) {
              command.bindGroups.push(index);
            },
            dispatchWorkgroups(...sizes: number[]) {
              command.dispatches.push(sizes);
            },
            end() {},
          };
        },
        finish() {
          return command;
        },
      } as unknown as GPUCommandEncoder;
    },
    createTexture() {
      return {
        createView: () => ({}),
        destroy() {},
      } as unknown as GPUTexture;
    },
    createBindGroup(descriptor: GPUBindGroupDescriptor) {
      return { descriptor } as unknown as GPUBindGroup;
    },
  } as unknown as GPUDevice;

  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: { getPreferredCanvasFormat: () => "rgba8unorm" },
  });

  return { device, layouts, commands, submitted, buffers, queueWrites };
}

const kernelConfig = (regions: boolean): FieldKernelConfig => ({
  buffers: [{ name: "state", type: "u32" }],
  passes: [
    {
      name: "view/test",
      binds: ["state", "out"],
      raw: true,
      code: "@compute @workgroup_size(8, 8) fn main() {}",
      ...(regions
        ? {
            regionCode: "@compute @workgroup_size(8, 8) fn main() {}",
          }
        : {}),
    },
  ],
});

async function makeKernel(regions = true, submitFails = false) {
  const gpu = fakeGpu(submitFails);
  const kernel = await FieldKernel.create(null, kernelConfig(regions), {
    device: gpu.device,
  });
  kernel.resize(65, 33);
  return { kernel, gpu };
}

afterEach(() => {
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: undefined,
  });
});

test.each([
  [1, 16],
  [2, 32],
  [2048, 32768],
])("dispatches %i regions as %i workgroups", async (count, workgroups) => {
  const { kernel, gpu } = await makeKernel();
  const chunks = new Uint32Array(count);
  const frame = kernel.beginFrame();
  frame.passRegions("view/test", chunks);
  const result = await frame.finish();

  expect(result.dispatches).toBe(1);
  const submitted = gpu.submitted[gpu.submitted.length - 1];
  expect(submitted.dispatches).toEqual([[workgroups]]);
  expect(submitted.bindGroups).toEqual([0, 1]);
});

test("zero regions encode no upload or dispatch", async () => {
  const { kernel, gpu } = await makeKernel();
  const frame = kernel.beginFrame();
  frame.passRegions("view/test", new Uint32Array());
  const result = await frame.finish();

  expect(result.dispatches).toBe(0);
  const submitted = gpu.submitted[gpu.submitted.length - 1];
  expect(submitted.copies).toEqual([]);
  expect(submitted.dispatches).toEqual([]);
});

test("region IDs are copied from per-frame staging before each dispatch", async () => {
  const { kernel, gpu } = await makeKernel();
  const first = kernel.beginFrame();
  first.passRegions("view/test", new Uint32Array([1]));
  const second = kernel.beginFrame();
  second.passRegions("view/test", new Uint32Array([5]));

  await first.finish();
  await second.finish();

  expect(gpu.submitted.map((command) => command.copies[0][0])).toEqual([1, 5]);
  expect(gpu.queueWrites).toHaveLength(1); // resize's GRID write only
});

test("releases per-frame region staging when submission fails", async () => {
  const { kernel, gpu } = await makeKernel(true, true);
  const frame = kernel.beginFrame();
  frame.passRegions("view/test", new Uint32Array([1]));

  await expect(frame.finish()).rejects.toThrow("submit failed");

  const staging = gpu.buffers[gpu.buffers.length - 1];
  expect(staging.destroyed).toBe(true);
});

test("rejects invalid IDs, oversized lists, and a second region dispatch", async () => {
  const { kernel, gpu } = await makeKernel();
  const badId = kernel.beginFrame();
  expect(() => badId.passRegions("view/test", new Uint32Array([6]))).toThrow(
    /chunk ID 6.*range/i,
  );
  const oversized = kernel.beginFrame();
  expect(() =>
    oversized.passRegions("view/test", new Uint32Array(2049)),
  ).toThrow(/2,048/);
  const twice = kernel.beginFrame();
  twice.passRegions("view/test", new Uint32Array([0]));
  expect(() => twice.passRegions("view/test", new Uint32Array([1]))).toThrow(
    /one region dispatch/i,
  );
  expect(gpu.commands.every((command) => command.dispatches.length <= 1)).toBe(
    true,
  );
});

test("a pass without region code falls back to its full-grid dispatch", async () => {
  const { kernel, gpu } = await makeKernel(false);
  const frame = kernel.beginFrame();
  frame.passRegions("view/test", new Uint32Array([5]));
  await frame.finish();
  expect(gpu.submitted[gpu.submitted.length - 1].dispatches).toEqual([[9, 5]]);

  const empty = kernel.beginFrame();
  empty.passRegions("view/test", new Uint32Array());
  expect((await empty.finish()).dispatches).toBe(0);
});

test("the optional region group is uniform and leaves group zero unchanged", async () => {
  const { kernel, gpu } = await makeKernel();
  const passLayout = gpu.layouts.find(
    (layout) => layout.label === "field-pass-view/test",
  )!;
  const regionLayout = gpu.layouts.find(
    (layout) => layout.label === "field-view-regions",
  )!;

  expect(
    passLayout.entries.filter(
      (entry) =>
        entry.buffer?.type === "storage" ||
        entry.buffer?.type === "read-only-storage",
    ),
  ).toHaveLength(1);
  expect(regionLayout.entries).toEqual([
    {
      binding: 0,
      visibility: 4,
      buffer: { type: "uniform" },
    },
  ]);
  kernel.destroy();
  expect(gpu.buffers.some((buffer) => buffer.destroyed)).toBe(true);
});
