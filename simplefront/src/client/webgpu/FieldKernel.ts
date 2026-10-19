// FieldKernel: a generic per-tile field simulation runtime for WebGPU.
//
// The world is a stack of named layers (grid-sized storage buffers, optionally
// double-buffered) plus small aux buffers (reductions, globals) and uniforms.
// Gameplay/generation logic is expressed as passes: a WGSL `fn tile(x, y, i)`
// body plus a declarative bind list. The kernel generates the binding
// declarations and dispatch wrapper, tracks ping-pong polarity, and schedules
// dispatches — so a pass author writes only the per-tile rule. This is the
// substrate a dynamics-graph compiler can target: one generated pass per rule.
//
// Bind reference grammar (one string per binding, in binding order from 1;
// binding 0 is always the kernel's GRID uniform):
//   "elevation"                       read-only storage, var `elevation`
//   "flags!"                          read_write storage, var `flags`
//   "water.read" / "water.write"      ping-pong facets, vars `water_in`/`water_out`
//   "G:Globals" / "G:GlobalsAtomic!"  WGSL type override for struct/atomic views
//   "P"                               uniform (matched by registered uniform name)
//   "out"                             the kernel's rgba8unorm storage texture, var `out_tex`
//   "out.read"                        the same texture sampled as `out_tex_in`

export type FieldScalarType = "f32" | "u32" | "i32";

export interface FieldBufferSpec {
  name: string;
  type: FieldScalarType;
  /** Double-buffer this layer; passes bind `.read`/`.write` facets. */
  pingPong?: boolean;
  /** Element count. Defaults to grid width*height (reallocated on resize). */
  count?: number;
  /** Allow clearBuffer()/writeBuffer() (adds COPY_DST). */
  clearable?: boolean;
  /** Allow readBuffer() (adds COPY_SRC). */
  readable?: boolean;
}

export interface FieldUniformSpec {
  name: string;
  bytes: number;
  /** WGSL struct type name; the struct itself is declared in the prelude. */
  wgslType: string;
}

export interface FieldPassSpec {
  name: string;
  binds: readonly string[];
  /** Ping-pong layers to swap after each dispatch of this pass. */
  advances?: readonly string[];
  /** "grid" (default): one thread per tile via `fn tile(x,y,i)`; "single": one thread via `fn once()`. */
  kind?: "grid" | "single";
  /**
   * The code is complete WGSL (own binding declarations, own entry point) —
   * e.g. output of a WESL link. The kernel skips prelude/declaration/main
   * generation and uses `binds` only to build the layout and bind groups.
   */
  raw?: boolean;
  code: string;
  /** Optional complete WGSL entry point that renders selected 32x32 chunks. */
  regionCode?: string;
}

export interface FieldKernelConfig {
  /** WGSL shared by every pass: structs, helper fns. */
  prelude?: string;
  uniforms?: readonly FieldUniformSpec[];
  buffers: readonly FieldBufferSpec[];
  passes: readonly FieldPassSpec[];
}

export interface FieldFrameResult {
  gpuMs: number;
  dispatches: number;
}

const WORKGROUP = 8;
const REGION_CHUNK_SIZE = 32;
const MAX_VIEW_REGIONS = 2048;
const REGION_UNIFORM_BYTES = MAX_VIEW_REGIONS * 4;

// The TS dom lib ships the WebGPU interfaces but not the GPUBufferUsage /
// GPUTextureUsage constant namespaces; these are the spec-defined bit values.
const BUFFER_USAGE = {
  MAP_READ: 0x1,
  MAP_WRITE: 0x2,
  COPY_SRC: 0x4,
  COPY_DST: 0x8,
  UNIFORM: 0x40,
  STORAGE: 0x80,
} as const;
const TEXTURE_USAGE = { TEXTURE_BINDING: 0x4, STORAGE_BINDING: 0x8 } as const;

// Helpers every pass can use. GRID is binding 0 of every pass.
const KERNEL_PRELUDE = /* wgsl */ `
struct FieldGrid {
  size: vec2u,
  pad0: u32,
  pad1: u32,
}

@group(0) @binding(0) var<uniform> GRID: FieldGrid;

var<private> OFF: array<vec2i, 8> = array<vec2i, 8>(
  vec2i(-1, -1), vec2i(0, -1), vec2i(1, -1),
  vec2i(-1, 0), vec2i(1, 0),
  vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1),
);

fn clamp01(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }

fn inBounds(x: i32, y: i32) -> bool {
  return x >= 0 && x < i32(GRID.size.x) && y >= 0 && y < i32(GRID.size.y);
}

fn refOf(x: i32, y: i32) -> u32 {
  return u32(y) * GRID.size.x + u32(x);
}
`;

const GRID_MAIN = /* wgsl */ `
@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= GRID.size.x || gid.y >= GRID.size.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  tile(x, y, refOf(x, y));
}
`;

const SINGLE_MAIN = /* wgsl */ `
@compute @workgroup_size(1)
fn main() { once(); }
`;

const RENDER_WGSL = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(positions[vi], 0.0, 1.0);
}

@group(0) @binding(0) var tex: texture_2d<f32>;

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(tex, vec2i(position.xy), 0);
}
`;

type BindFacet = "static" | "read" | "write";

interface ParsedBind {
  resource: string;
  facet: BindFacet;
  readWrite: boolean;
  typeOverride: string | null;
  kind: "buffer" | "uniform" | "texture" | "sampledTexture";
  varName: string;
}

interface PassRuntime {
  spec: FieldPassSpec;
  binds: readonly ParsedBind[];
  pipeline: GPUComputePipeline;
  regionPipeline: GPUComputePipeline | null;
  layout: GPUBindGroupLayout;
  /** Ping-pong resources this pass binds, for polarity cache keys. */
  pingPongResources: readonly string[];
  bindGroupCache: Map<string, GPUBindGroup>;
}

export class FieldKernel {
  private constructor(
    readonly device: GPUDevice,
    private readonly context: GPUCanvasContext | null,
    private readonly canvas: HTMLCanvasElement | null,
    private readonly config: FieldKernelConfig,
    public readonly adapterInfo: string,
    private readonly ownsDevice: boolean,
  ) {}

  private readonly uniformBuffers = new Map<string, GPUBuffer>();
  private readonly fixedBuffers = new Map<string, GPUBuffer[]>();
  private gridBuffers = new Map<string, GPUBuffer[]>();
  private readonly polarity = new Map<string, number>();
  private readonly bufferSpecs = new Map<string, FieldBufferSpec>();
  private passes = new Map<string, PassRuntime>();
  private gridUniform: GPUBuffer | null = null;
  private regionUniform: GPUBuffer | null = null;
  private regionLayout: GPUBindGroupLayout | null = null;
  private regionBindGroup: GPUBindGroup | null = null;
  private outTexture: GPUTexture | null = null;
  private outTextureView: GPUTextureView | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private widthValue = 0;
  private heightValue = 0;
  private destroyed = false;

  get width(): number {
    return this.widthValue;
  }

  get height(): number {
    return this.heightValue;
  }

  /** The view pass target, for sampling by an external renderer (headless mode). */
  get outView(): GPUTextureView | null {
    return this.outTextureView;
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  /**
   * Create a kernel. With `canvas` null the kernel runs headless — no canvas
   * context and no present pipeline; sample `outView` from your own renderer
   * instead. With `options.device` the kernel joins an existing device (so
   * its textures are shareable) and destroy() leaves that device alone.
   */
  static async create(
    canvas: HTMLCanvasElement | null,
    config: FieldKernelConfig,
    options: { device?: GPUDevice } = {},
  ): Promise<FieldKernel> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }
    const ownsDevice = options.device === undefined;
    let device = options.device ?? null;
    let adapterInfo = "shared device";
    let kernel: FieldKernel | null = null;
    try {
      if (!device) {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw new Error("No WebGPU adapter available");
        }
        device = await adapter.requestDevice({
          label: "field-kernel",
          // Wide passes (the worldgen colorizer) bind more storage buffers
          // than the default limit of 8.
          requiredLimits: {
            maxStorageBuffersPerShaderStage: Math.min(
              adapter.limits.maxStorageBuffersPerShaderStage,
              16,
            ),
          },
        });
        device.addEventListener("uncapturederror", (event) => {
          console.error("WebGPU uncaptured error:", event.error.message);
        });
        const info = adapter.info;
        adapterInfo =
          [info?.description, info?.vendor, info?.architecture]
            .filter((part) => !!part)
            .join(" · ") || "unknown adapter";
      }

      let context: GPUCanvasContext | null = null;
      const format = navigator.gpu.getPreferredCanvasFormat();
      if (canvas) {
        // The TS dom lib's getContext overloads don't know "webgpu" yet.
        context = canvas.getContext(
          "webgpu",
        ) as unknown as GPUCanvasContext | null;
        if (!context) {
          throw new Error("Could not create a WebGPU canvas context");
        }
        context.configure({ device, format, alphaMode: "opaque" });
      }

      kernel = new FieldKernel(
        device,
        context,
        canvas,
        config,
        adapterInfo,
        ownsDevice,
      );
      await kernel.build(format);
      return kernel;
    } catch (error) {
      kernel?.destroy();
      if (kernel === null && ownsDevice) device?.destroy();
      throw error;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const buffers of [
      ...this.fixedBuffers.values(),
      ...this.gridBuffers.values(),
    ]) {
      for (const buffer of buffers) buffer.destroy();
    }
    for (const buffer of this.uniformBuffers.values()) buffer.destroy();
    this.gridUniform?.destroy();
    this.regionUniform?.destroy();
    this.outTexture?.destroy();
    if (this.ownsDevice) this.device.destroy();
  }

  private async build(canvasFormat: GPUTextureFormat): Promise<void> {
    for (const spec of this.config.buffers) {
      if (this.bufferSpecs.has(spec.name)) {
        throw new Error(`Duplicate field buffer "${spec.name}"`);
      }
      if (spec.name === "out" || spec.name === "GRID") {
        throw new Error(`Field buffer name "${spec.name}" is reserved`);
      }
      this.bufferSpecs.set(spec.name, spec);
      if (spec.count !== undefined) {
        this.fixedBuffers.set(spec.name, this.allocateBuffer(spec, spec.count));
      }
    }
    for (const spec of this.config.uniforms ?? []) {
      this.uniformBuffers.set(
        spec.name,
        this.device.createBuffer({
          label: `field-uniform-${spec.name}`,
          size: spec.bytes,
          usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
        }),
      );
    }
    this.gridUniform = this.device.createBuffer({
      label: "field-grid",
      size: 16,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });

    if (this.config.passes.some((pass) => pass.regionCode !== undefined)) {
      this.regionUniform = this.device.createBuffer({
        label: "field-view-regions",
        size: REGION_UNIFORM_BYTES,
        usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
      });
      this.regionLayout = this.device.createBindGroupLayout({
        label: "field-view-regions",
        entries: [
          {
            binding: 0,
            visibility: 0x4 /* COMPUTE */,
            buffer: { type: "uniform" },
          },
        ],
      });
      this.regionBindGroup = this.device.createBindGroup({
        label: "field-view-regions",
        layout: this.regionLayout,
        entries: [{ binding: 0, resource: { buffer: this.regionUniform } }],
      });
    }

    const pipelinePromises = this.config.passes.map(async (spec) => {
      const binds = spec.binds.map((ref) => this.parseBind(spec.name, ref));
      const layout = this.device.createBindGroupLayout({
        label: `field-pass-${spec.name}`,
        entries: [
          {
            binding: 0,
            visibility: 0x4 /* COMPUTE */,
            buffer: { type: "uniform" },
          },
          ...binds.map((bind, index) => this.layoutEntry(bind, index + 1)),
        ],
      });
      const makePipeline = async (
        code: string,
        label: string,
        bindGroupLayouts: GPUBindGroupLayout[],
      ): Promise<GPUComputePipeline> => {
        const module = this.device.createShaderModule({ label, code });
        // WGSL errors are the DSL's type errors — surface them against the
        // numbered assembled source, tagged with the pass name.
        const compilation = await module.getCompilationInfo();
        const wgslErrors = compilation.messages.filter(
          (message) => message.type === "error",
        );
        if (wgslErrors.length > 0) {
          const numbered = code
            .split("\n")
            .map((line, index) => `${String(index + 1).padStart(4)} | ${line}`)
            .join("\n");
          throw new Error(
            `WGSL errors in pass "${label}":\n` +
              wgslErrors
                .map((m) => `  ${label}:${m.lineNum}:${m.linePos} ${m.message}`)
                .join("\n") +
              `\n\nAssembled source:\n${numbered}`,
          );
        }
        return this.device
          .createComputePipelineAsync({
            label,
            layout: this.device.createPipelineLayout({ bindGroupLayouts }),
            compute: { module, entryPoint: "main" },
          })
          .catch((error: unknown) => {
            throw new Error(
              `Pipeline creation failed for pass "${label}": ${(error as Error).message}`,
            );
          });
      };
      const pipeline = await makePipeline(
        this.assemblePass(spec, binds),
        `field-pass-${spec.name}`,
        [layout],
      );
      const regionPipeline = spec.regionCode
        ? await makePipeline(
            spec.regionCode,
            `field-pass-${spec.name}/regions`,
            [layout, this.regionLayout!],
          )
        : null;
      const pingPongResources = [
        ...new Set(
          binds
            .filter((bind) => bind.facet !== "static")
            .map((bind) => bind.resource),
        ),
      ];
      return [
        spec.name,
        {
          spec,
          binds,
          pipeline,
          regionPipeline,
          layout,
          pingPongResources,
          bindGroupCache: new Map(),
        },
      ] as const;
    });

    // Headless kernels have no canvas to present to.
    let renderPipelinePromise: Promise<GPURenderPipeline> | null = null;
    if (this.canvas) {
      const renderModule = this.device.createShaderModule({
        label: "field-present",
        code: RENDER_WGSL,
      });
      renderPipelinePromise = this.device.createRenderPipelineAsync({
        label: "field-present",
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "vs" },
        fragment: {
          module: renderModule,
          entryPoint: "fs",
          targets: [{ format: canvasFormat }],
        },
        primitive: { topology: "triangle-list" },
      });
    }

    const entries = await Promise.all(pipelinePromises);
    for (const [name, runtime] of entries) {
      if (this.passes.has(name)) {
        throw new Error(`Duplicate field pass "${name}"`);
      }
      this.passes.set(name, runtime);
    }
    this.renderPipeline = renderPipelinePromise
      ? await renderPipelinePromise
      : null;
  }

  private parseBind(passName: string, ref: string): ParsedBind {
    let rest = ref;
    let readWrite = false;
    if (rest.endsWith("!")) {
      readWrite = true;
      rest = rest.slice(0, -1);
    }
    let typeOverride: string | null = null;
    const colon = rest.indexOf(":");
    if (colon >= 0) {
      typeOverride = rest.slice(colon + 1);
      rest = rest.slice(0, colon);
    }
    let facet: BindFacet = "static";
    if (rest.endsWith(".read")) {
      facet = "read";
      rest = rest.slice(0, -".read".length);
    } else if (rest.endsWith(".write")) {
      facet = "write";
      readWrite = true;
      rest = rest.slice(0, -".write".length);
    }
    const resource = rest;

    if (resource === "out") {
      return {
        resource,
        facet: "static",
        readWrite: facet !== "read",
        typeOverride: null,
        kind: facet === "read" ? "sampledTexture" : "texture",
        varName: facet === "read" ? "out_tex_in" : "out_tex",
      };
    }
    if (this.uniformBuffers.has(resource)) {
      return {
        resource,
        facet: "static",
        readWrite: false,
        typeOverride,
        kind: "uniform",
        varName: resource,
      };
    }
    const spec = this.bufferSpecs.get(resource);
    if (!spec) {
      throw new Error(`Pass "${passName}" binds unknown resource "${ref}"`);
    }
    if (spec.pingPong && facet === "static") {
      throw new Error(
        `Pass "${passName}" must bind ping-pong layer "${resource}" as .read or .write`,
      );
    }
    if (!spec.pingPong && facet !== "static") {
      throw new Error(
        `Pass "${passName}" binds "${ref}" but "${resource}" is not ping-pong`,
      );
    }
    return {
      resource,
      facet,
      readWrite,
      typeOverride,
      kind: "buffer",
      varName:
        facet === "read"
          ? `${resource}_in`
          : facet === "write"
            ? `${resource}_out`
            : resource,
    };
  }

  private layoutEntry(
    bind: ParsedBind,
    binding: number,
  ): GPUBindGroupLayoutEntry {
    const visibility = 0x4; /* COMPUTE */
    if (bind.kind === "texture") {
      return {
        binding,
        visibility,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
      };
    }
    if (bind.kind === "sampledTexture") {
      return { binding, visibility, texture: { sampleType: "float" } };
    }
    if (bind.kind === "uniform") {
      return { binding, visibility, buffer: { type: "uniform" } };
    }
    return {
      binding,
      visibility,
      buffer: { type: bind.readWrite ? "storage" : "read-only-storage" },
    };
  }

  private assemblePass(
    spec: FieldPassSpec,
    binds: readonly ParsedBind[],
  ): string {
    if (spec.raw) return spec.code;
    const decls = binds
      .map((bind, index) => {
        const binding = index + 1;
        if (bind.kind === "texture") {
          return `@group(0) @binding(${binding}) var ${bind.varName}: texture_storage_2d<rgba8unorm, write>;`;
        }
        if (bind.kind === "sampledTexture") {
          return `@group(0) @binding(${binding}) var ${bind.varName}: texture_2d<f32>;`;
        }
        if (bind.kind === "uniform") {
          const uniform = (this.config.uniforms ?? []).find(
            (u) => u.name === bind.resource,
          )!;
          return `@group(0) @binding(${binding}) var<uniform> ${bind.varName}: ${uniform.wgslType};`;
        }
        const bufferSpec = this.bufferSpecs.get(bind.resource)!;
        const type = bind.typeOverride ?? `array<${bufferSpec.type}>`;
        const access = bind.readWrite ? "read_write" : "read";
        return `@group(0) @binding(${binding}) var<storage, ${access}> ${bind.varName}: ${type};`;
      })
      .join("\n");
    const main = (spec.kind ?? "grid") === "grid" ? GRID_MAIN : SINGLE_MAIN;
    return [
      KERNEL_PRELUDE,
      this.config.prelude ?? "",
      decls,
      spec.code,
      main,
    ].join("\n");
  }

  private allocateBuffer(spec: FieldBufferSpec, count: number): GPUBuffer[] {
    const make = (suffix: string): GPUBuffer =>
      this.device.createBuffer({
        label: `field-${spec.name}${suffix}`,
        size: count * 4,
        usage:
          BUFFER_USAGE.STORAGE |
          (spec.clearable ? BUFFER_USAGE.COPY_DST : 0) |
          (spec.readable ? BUFFER_USAGE.COPY_SRC : 0),
      });
    return spec.pingPong ? [make("/a"), make("/b")] : [make("")];
  }

  resize(width: number, height: number): void {
    if (width === this.widthValue && height === this.heightValue) return;
    for (const buffers of this.gridBuffers.values()) {
      for (const buffer of buffers) buffer.destroy();
    }
    this.outTexture?.destroy();
    this.gridBuffers = new Map();
    this.widthValue = width;
    this.heightValue = height;
    const area = width * height;
    for (const spec of this.bufferSpecs.values()) {
      if (spec.count !== undefined) continue;
      this.gridBuffers.set(spec.name, this.allocateBuffer(spec, area));
    }
    this.polarity.clear();
    for (const runtime of this.passes.values()) {
      runtime.bindGroupCache.clear();
    }
    this.device.queue.writeBuffer(
      this.gridUniform!,
      0,
      new Uint32Array([width, height, 0, 0]),
    );
    this.outTexture = this.device.createTexture({
      label: "field-out",
      size: { width, height },
      format: "rgba8unorm",
      usage: TEXTURE_USAGE.STORAGE_BINDING | TEXTURE_USAGE.TEXTURE_BINDING,
    });
    this.outTextureView = this.outTexture.createView();
    if (this.renderPipeline) {
      this.renderBindGroup = this.device.createBindGroup({
        label: "field-present",
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: this.outTextureView }],
      });
    }
  }

  writeUniform(name: string, data: ArrayBuffer | ArrayBufferView): void {
    const buffer = this.uniformBuffers.get(name);
    if (!buffer) throw new Error(`Unknown uniform "${name}"`);
    this.device.queue.writeBuffer(buffer, 0, data as ArrayBuffer);
  }

  clearBuffer(name: string): void {
    const spec = this.bufferSpecs.get(name);
    if (!spec?.clearable) {
      throw new Error(`Buffer "${name}" is not clearable`);
    }
    const count = spec.count ?? this.widthValue * this.heightValue;
    const zeros = new Uint32Array(count);
    for (const buffer of this.buffersOf(name)) {
      this.device.queue.writeBuffer(buffer, 0, zeros);
    }
  }

  /** Upload CPU data into a buffer (ping-pong: the current read facet). */
  writeBuffer(name: string, data: ArrayBufferView): void {
    const spec = this.bufferSpecs.get(name);
    if (!spec?.clearable) {
      throw new Error(`Buffer "${name}" is not writable (set clearable)`);
    }
    const buffers = this.buffersOf(name);
    const target = spec.pingPong
      ? buffers[this.polarity.get(name) ?? 0]
      : buffers[0];
    this.device.queue.writeBuffer(target, 0, data.buffer as ArrayBuffer);
  }

  /**
   * Upload only elements [firstElem, lastElem] of a buffer — a partial update
   * so a persistent conduit doesn't re-DMA the whole buffer every tick. The GPU
   * buffer retains everything outside the range. Float32 planes are accepted
   * too: the offset math is per-element and both types are 4 bytes wide.
   */
  writeBufferU32Range(
    name: string,
    data: Uint32Array | Float32Array,
    firstElem: number,
    lastElem: number,
  ): void {
    if (lastElem < firstElem) return;
    const spec = this.bufferSpecs.get(name);
    if (!spec?.clearable) {
      throw new Error(`Buffer "${name}" is not writable (set clearable)`);
    }
    const target = spec.pingPong
      ? this.buffersOf(name)[this.polarity.get(name) ?? 0]
      : this.buffersOf(name)[0];
    // queue.writeBuffer(buffer, byteOffset, data, dataElemOffset, elemCount).
    this.device.queue.writeBuffer(
      target,
      firstElem * 4,
      data,
      firstElem,
      lastElem - firstElem + 1,
    );
  }

  /**
   * Read a buffer back to the CPU (ping-pong: the current read facet).
   *
   * `elements` bounds the range beginning at `firstElement`. With the default
   * offset this retains the prefix-read behavior used by compacted lists.
   */
  async readBuffer(
    name: string,
    elements?: number,
    firstElement = 0,
  ): Promise<ArrayBuffer> {
    const spec = this.bufferSpecs.get(name);
    if (!spec?.readable) {
      throw new Error(`Buffer "${name}" is not readable (set readable)`);
    }
    if (!Number.isInteger(firstElement) || firstElement < 0) {
      throw new RangeError("firstElement must be a non-negative integer");
    }
    if (
      elements !== undefined &&
      (!Number.isInteger(elements) || elements < 0)
    ) {
      throw new RangeError("elements must be a non-negative integer");
    }
    const buffers = this.buffersOf(name);
    const source = spec.pingPong
      ? buffers[this.polarity.get(name) ?? 0]
      : buffers[0];
    const capacity = spec.count ?? this.widthValue * this.heightValue;
    const available = Math.max(0, capacity - firstElement);
    const wanted =
      elements === undefined ? available : Math.min(elements, available);
    if (wanted <= 0) return new ArrayBuffer(0);
    const bytes = wanted * 4;
    const staging = this.device.createBuffer({
      label: `field-staging-${name}`,
      size: bytes,
      usage: BUFFER_USAGE.COPY_DST | BUFFER_USAGE.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder({
      label: `field-read-${name}`,
    });
    encoder.copyBufferToBuffer(source, firstElement * 4, staging, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(1 /* GPUMapMode.READ */);
    const copy = staging.getMappedRange().slice(0);
    staging.destroy();
    return copy;
  }

  swap(name: string): void {
    const spec = this.bufferSpecs.get(name);
    if (!spec?.pingPong) {
      throw new Error(`Layer "${name}" is not ping-pong`);
    }
    this.polarity.set(name, (this.polarity.get(name) ?? 0) ^ 1);
  }

  private buffersOf(name: string): GPUBuffer[] {
    const buffers = this.fixedBuffers.get(name) ?? this.gridBuffers.get(name);
    if (!buffers) {
      throw new Error(
        `Buffer "${name}" is not allocated — call resize() before use`,
      );
    }
    return buffers;
  }

  private resolveBuffer(bind: ParsedBind): GPUBuffer {
    const buffers = this.buffersOf(bind.resource);
    if (bind.facet === "static") return buffers[0];
    const current = this.polarity.get(bind.resource) ?? 0;
    return buffers[bind.facet === "read" ? current : current ^ 1];
  }

  bindGroupFor(passName: string): {
    runtime: PassRuntime;
    bindGroup: GPUBindGroup;
  } {
    const runtime = this.passes.get(passName);
    if (!runtime) throw new Error(`Unknown pass "${passName}"`);
    const key = runtime.pingPongResources
      .map((name) => this.polarity.get(name) ?? 0)
      .join("");
    let bindGroup = runtime.bindGroupCache.get(key);
    if (!bindGroup) {
      bindGroup = this.device.createBindGroup({
        label: `field-pass-${passName}/${key}`,
        layout: runtime.layout,
        entries: [
          { binding: 0, resource: { buffer: this.gridUniform! } },
          ...runtime.binds.map((bind, index) => ({
            binding: index + 1,
            resource:
              bind.kind === "texture" || bind.kind === "sampledTexture"
                ? this.outTextureView!
                : bind.kind === "uniform"
                  ? { buffer: this.uniformBuffers.get(bind.resource)! }
                  : { buffer: this.resolveBuffer(bind) },
          })),
        ],
      });
      runtime.bindGroupCache.set(key, bindGroup);
    }
    return { runtime, bindGroup };
  }

  /** @internal */
  regionBindGroupsFor(passName: string): {
    runtime: PassRuntime;
    fieldBindGroup: GPUBindGroup;
    regionBindGroup: GPUBindGroup;
  } | null {
    const { runtime, bindGroup } = this.bindGroupFor(passName);
    if (!runtime.regionPipeline) return null;
    return {
      runtime,
      fieldBindGroup: bindGroup,
      regionBindGroup: this.regionBindGroup!,
    };
  }

  /** @internal */
  stageRegions(encoder: GPUCommandEncoder, chunks: Uint32Array): GPUBuffer {
    const staging = this.device.createBuffer({
      label: "field-view-regions-staging",
      size: REGION_UNIFORM_BYTES,
      usage: BUFFER_USAGE.MAP_WRITE | BUFFER_USAGE.COPY_SRC,
      mappedAtCreation: true,
    });
    new Uint32Array(staging.getMappedRange()).set(chunks);
    staging.unmap();
    encoder.copyBufferToBuffer(
      staging,
      0,
      this.regionUniform!,
      0,
      REGION_UNIFORM_BYTES,
    );
    return staging;
  }

  beginFrame(): FieldFrame {
    if (this.widthValue === 0 || this.heightValue === 0) {
      throw new Error(
        "FieldKernel.resize() must be called before beginFrame()",
      );
    }
    return new FieldFrame(this);
  }

  /** @internal */
  presentEncode(encoder: GPUCommandEncoder): void {
    if (!this.canvas || !this.context || !this.renderPipeline) {
      throw new Error("present() is unavailable on a headless FieldKernel");
    }
    this.canvas.width = this.widthValue;
    this.canvas.height = this.heightValue;
    const pass = encoder.beginRenderPass({
      label: "field-present",
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.renderPipeline!);
    pass.setBindGroup(0, this.renderBindGroup!);
    pass.draw(3);
    pass.end();
  }
}

export class FieldFrame {
  constructor(private readonly kernel: FieldKernel) {
    this.encoder = kernel.device.createCommandEncoder({ label: "field-frame" });
  }

  private readonly encoder: GPUCommandEncoder;
  private computePass: GPUComputePassEncoder | null = null;
  private dispatches = 0;
  private regionDispatched = false;
  private readonly stagingBuffers: GPUBuffer[] = [];

  pass(name: string): void {
    const { runtime, bindGroup } = this.kernel.bindGroupFor(name);
    this.computePass ??= this.encoder.beginComputePass({
      label: "field-frame",
    });
    this.computePass.setPipeline(runtime.pipeline);
    this.computePass.setBindGroup(0, bindGroup);
    if ((runtime.spec.kind ?? "grid") === "grid") {
      this.computePass.dispatchWorkgroups(
        Math.ceil(this.kernel.width / WORKGROUP),
        Math.ceil(this.kernel.height / WORKGROUP),
      );
    } else {
      this.computePass.dispatchWorkgroups(1);
    }
    this.dispatches += 1;
    for (const layer of runtime.spec.advances ?? []) {
      this.kernel.swap(layer);
    }
  }

  passRegions(name: string, chunks: Uint32Array): void {
    if (chunks.length === 0) return;
    if (chunks.length > MAX_VIEW_REGIONS) {
      throw new RangeError("A view supports at most 2,048 regions");
    }
    const columns = Math.ceil(this.kernel.width / REGION_CHUNK_SIZE);
    const regionCount =
      columns * Math.ceil(this.kernel.height / REGION_CHUNK_SIZE);
    for (const chunk of chunks) {
      if (chunk >= regionCount) {
        throw new RangeError(
          `View chunk ID ${chunk} is outside the valid range 0..${regionCount - 1}`,
        );
      }
    }
    const groups = this.kernel.regionBindGroupsFor(name);
    if (!groups) {
      this.pass(name);
      return;
    }
    if (this.regionDispatched) {
      throw new Error("Only one region dispatch is allowed per FieldFrame");
    }
    this.regionDispatched = true;
    this.computePass?.end();
    this.computePass = null;
    this.stagingBuffers.push(this.kernel.stageRegions(this.encoder, chunks));
    this.computePass = this.encoder.beginComputePass({ label: "field-frame" });
    this.computePass.setPipeline(groups.runtime.regionPipeline!);
    this.computePass.setBindGroup(0, groups.fieldBindGroup);
    this.computePass.setBindGroup(1, groups.regionBindGroup);
    this.computePass.dispatchWorkgroups(chunks.length * 16);
    this.dispatches += 1;
    for (const layer of groups.runtime.spec.advances ?? []) {
      this.kernel.swap(layer);
    }
  }

  iterate(name: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.pass(name);
    }
  }

  present(): void {
    this.computePass?.end();
    this.computePass = null;
    this.kernel.presentEncode(this.encoder);
  }

  async finish(): Promise<FieldFrameResult> {
    this.computePass?.end();
    this.computePass = null;
    const start = performance.now();
    try {
      this.kernel.device.queue.submit([this.encoder.finish()]);
      await this.kernel.device.queue.onSubmittedWorkDone();
      return { gpuMs: performance.now() - start, dispatches: this.dispatches };
    } finally {
      for (const buffer of this.stagingBuffers) buffer.destroy();
    }
  }
}
