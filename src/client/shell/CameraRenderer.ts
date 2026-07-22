// Camera renderer for the game shell: draws a map's baked terrain-colors
// texture on a fullscreen canvas under a pan/zoom camera. Magnification is
// nearest (crisp original tiles when zoomed in); minification goes through
// CPU-built mips (clean zoom-out on 4096-wide maps). The camera uniform maps
// framebuffer pixels to map coordinates, so later shell steps can composite
// sim view textures under the exact same transform.

import { assetUrl } from "src/core/AssetUrls";

const BUFFER_USAGE = { COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const TEXTURE_USAGE = {
  COPY_DST: 0x2,
  TEXTURE_BINDING: 0x4,
  RENDER_ATTACHMENT: 0x10,
} as const;

export interface CameraState {
  /** Map coordinate at the viewport center. */
  cx: number;
  cy: number;
  /** Framebuffer pixels per map tile. */
  scale: number;
}

const RENDER_WGSL = /* wgsl */ `
struct Cam {
  origin: vec2f,   // map coordinate of framebuffer pixel (0, 0)
  invScale: f32,   // map units per framebuffer pixel
  plotEnabled: f32, // > 0.5 → sample the plot plane for sub-tile sprites
  mapSize: vec2f,
  boatAlpha: f32,
  pad1: f32,
  viewport: vec2f,
  pad2: vec2f,
}

@group(0) @binding(0) var<uniform> CAM: Cam;
@group(0) @binding(1) var terrainSampler: sampler;
@group(0) @binding(2) var terrain: texture_2d<f32>;
// Per-tile plot bytes (0 none / 1 Settlement / 2 Farmland / 3 Barn) — the
// sub-tile sprite layer (visual parity with the WebGL PlotPass): the view
// texture is one texel per tile, so sub-tile patterns like farmland's
// tilled rows can only be drawn here, where fract(map) exists. A 1×1 dummy
// is bound when no plane is set (plotEnabled stays 0).
@group(0) @binding(3) var plotPlane: texture_2d<u32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(positions[vi], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let map = CAM.origin + position.xy * CAM.invScale;
  // textureSample needs uniform control flow: sample unconditionally with a
  // clamped uv, then paint the void outside the map.
  var color = textureSample(
    terrain,
    terrainSampler,
    clamp(map / CAM.mapSize, vec2f(0.0), vec2f(1.0)),
  );
  let inside = map.x >= 0.0 && map.y >= 0.0 &&
    map.x < CAM.mapSize.x && map.y < CAM.mapSize.y;
  if (inside && CAM.plotEnabled > 0.5) {
    let tile = vec2i(floor(map));
    let p = textureLoad(plotPlane, tile, 0).r;
    // Farmland: tilled rows — the tile's own color on top, darkened below
    // (the WebGL PlotPass sprite, reference FarmlandBuilding).
    if (p == 2u && fract(map).y >= 0.5) {
      color = vec4f(color.rgb * 0.72, color.a);
    }
  }
  return select(vec4f(0.043, 0.055, 0.075, 1.0), color, inside);
}
`;

const BOAT_WGSL = /* wgsl */ `
struct Cam {
  origin: vec2f,
  invScale: f32,
  plotEnabled: f32,
  mapSize: vec2f,
  boatAlpha: f32,
  pad1: f32,
  viewport: vec2f,
  pad2: vec2f,
}

struct Boat {
  current: vec2f,
  previous: vec2f,
  fill: u32,
  border: u32,
  owner: u32,
  pad: u32,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @interpolate(flat) @location(1) fill: vec3f,
  @interpolate(flat) @location(2) border: vec3f,
}

@group(0) @binding(0) var<uniform> CAM: Cam;
@group(0) @binding(1) var<storage, read> boats: array<Boat>;
@group(0) @binding(2) var boatSampler: sampler;
@group(0) @binding(3) var boatTexture: texture_2d<f32>;

fn unpackTint(t: u32) -> vec3f {
  return vec3f(
    f32((t >> 16u) & 255u),
    f32((t >> 8u) & 255u),
    f32(t & 255u),
  ) / 255.0;
}

fn hue2rgb(h: f32) -> vec3f {
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0));
}

fn ownerColor(id: u32) -> vec3f {
  let h = fract(f32(id) * 0.61803398875);
  return mix(vec3f(1.0), hue2rgb(h), 0.8);
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let boat = boats[ii];
  let uv = corners[vi];
  let center = mix(boat.previous, boat.current, CAM.boatAlpha) + vec2f(0.5);
  let map = center + (uv - vec2f(0.5)) * 13.0;
  let pixel = (map - CAM.origin) / CAM.invScale;
  let clip = vec2f(
    pixel.x / CAM.viewport.x * 2.0 - 1.0,
    1.0 - pixel.y / CAM.viewport.y * 2.0,
  );
  let fill = select(ownerColor(boat.owner), unpackTint(boat.fill), boat.fill != 0u);
  var out: VertexOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.uv = uv;
  out.fill = fill;
  out.border = select(fill * 0.58, unpackTint(boat.border), boat.border != 0u);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let texel = textureSample(boatTexture, boatSampler, in.uv);
  if (texel.a < 0.01) {
    discard;
  }
  let midpoint = mix(in.fill, in.border, 0.5);
  var color = in.border;
  if (texel.r > 0.6) {
    color = in.fill;
  } else if (texel.r > 0.45) {
    color = midpoint;
  } else if (texel.r > 0.34) {
    color = in.fill;
  }
  return vec4f(color, texel.a);
}
`;

export function buildTransportShipInstances(
  ships: Int32Array,
  mapWidth: number,
  fill: Uint32Array,
  border: Uint32Array,
): ArrayBuffer {
  const buffer = new ArrayBuffer((ships.length / 4) * 32);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  for (let s = 0, i = 0; s < ships.length; s += 4, i += 8) {
    const current = ships[s + 1];
    const previous = ships[s + 2];
    const owner = ships[s + 3];
    floats.set(
      [
        current % mapWidth,
        Math.floor(current / mapWidth),
        previous % mapWidth,
        Math.floor(previous / mapWidth),
      ],
      i,
    );
    words.set([fill[owner] ?? 0, border[owner] ?? 0, owner], i + 4);
  }
  return buffer;
}

export class CameraRenderer {
  private constructor(
    readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: GPURenderPipeline,
    private readonly cameraUniform: GPUBuffer,
    private readonly sampler: GPUSampler,
  ) {}

  private texture: GPUTexture | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private mapWidthValue = 0;
  private mapHeightValue = 0;
  /** The bound main surface (baked texture view or live kernel view). */
  private surfaceView: GPUTextureView | null = null;
  // Sub-tile sprite layer (see plotPlane in the shader). The dummy satisfies
  // the bind group when no plane is set.
  private plotTexture: GPUTexture | null = null;
  private plotDummy: GPUTexture | null = null;
  private plotEnabled = false;
  /** Staging row-padded buffer when the map width isn't 256-aligned. */
  private plotStaging: Uint8Array | null = null;
  private boatPipeline: GPURenderPipeline | null = null;
  private boatBindGroup: GPUBindGroup | null = null;
  private boatBuffer: GPUBuffer | null = null;
  private boatTexture: GPUTexture | null = null;
  private boatSampler: GPUSampler | null = null;
  private boatCapacity = 0;
  private boatCount = 0;
  private boatUpdatedAt = 0;
  private boatInstances = new ArrayBuffer(0);
  private destroyed = false;

  get mapWidth(): number {
    return this.mapWidthValue;
  }

  get mapHeight(): number {
    return this.mapHeightValue;
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  static async create(canvas: HTMLCanvasElement): Promise<CameraRenderer> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter available");
    }
    const device = await adapter.requestDevice({
      label: "shell-camera",
      // The worldgen color pass binds more storage buffers than the default
      // limit of 8 (shared-device kernels run on this device).
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
    // The TS dom lib's getContext overloads don't know "webgpu" yet.
    const context = canvas.getContext(
      "webgpu",
    ) as unknown as GPUCanvasContext | null;
    if (!context) {
      throw new Error("Could not create a WebGPU canvas context");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const module = device.createShaderModule({
      label: "shell-camera",
      code: RENDER_WGSL,
    });
    const pipeline = await device.createRenderPipelineAsync({
      label: "shell-camera",
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const cameraUniform = device.createBuffer({
      label: "shell-camera",
      size: 48,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });
    // Crisp tiles when magnified, mip-filtered when minified.
    const sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const renderer = new CameraRenderer(
      device,
      context,
      canvas,
      pipeline,
      cameraUniform,
      sampler,
    );
    void renderer.initBoatPass(format);
    return renderer;
  }

  private async initBoatPass(format: GPUTextureFormat): Promise<void> {
    let boatTexture: GPUTexture | null = null;
    let boatBuffer: GPUBuffer | null = null;
    try {
      const response = await fetch(assetUrl("atlases/unit-atlas.png"));
      if (this.destroyed) return;
      if (!response.ok) {
        throw new Error(`Transport atlas request failed: ${response.status}`);
      }
      const bitmap = await createImageBitmap(
        await response.blob(),
        0,
        0,
        13,
        13,
      );
      if (this.destroyed) {
        bitmap.close();
        return;
      }
      try {
        boatTexture = this.device.createTexture({
          label: "shell-transport-atlas",
          size: { width: 13, height: 13 },
          format: "rgba8unorm",
          usage:
            TEXTURE_USAGE.TEXTURE_BINDING |
            TEXTURE_USAGE.COPY_DST |
            TEXTURE_USAGE.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture: boatTexture },
          { width: 13, height: 13 },
        );
      } finally {
        bitmap.close();
      }
      const boatSampler = this.device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest",
      });
      const boatModule = this.device.createShaderModule({
        label: "shell-transport",
        code: BOAT_WGSL,
      });
      const boatPipeline = await this.device.createRenderPipelineAsync({
        label: "shell-transport",
        layout: "auto",
        vertex: { module: boatModule, entryPoint: "vs" },
        fragment: {
          module: boatModule,
          entryPoint: "fs",
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: "src-alpha",
                  dstFactor: "one-minus-src-alpha",
                  operation: "add",
                },
                alpha: {
                  srcFactor: "one",
                  dstFactor: "one-minus-src-alpha",
                  operation: "add",
                },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      });
      if (this.destroyed) {
        boatTexture.destroy();
        return;
      }
      const capacity = Math.max(32, this.boatInstances.byteLength);
      boatBuffer = this.device.createBuffer({
        label: "shell-transport",
        size: capacity,
        usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST,
      });
      const boatBindGroup = this.device.createBindGroup({
        label: "shell-transport",
        layout: boatPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraUniform } },
          { binding: 1, resource: { buffer: boatBuffer } },
          { binding: 2, resource: boatSampler },
          { binding: 3, resource: boatTexture.createView() },
        ],
      });
      this.boatPipeline = boatPipeline;
      this.boatBindGroup = boatBindGroup;
      this.boatBuffer = boatBuffer;
      this.boatTexture = boatTexture;
      this.boatSampler = boatSampler;
      this.boatCapacity = capacity;
      this.uploadBoatInstances();
    } catch (error) {
      boatTexture?.destroy();
      boatBuffer?.destroy();
      this.boatPipeline = null;
      this.boatBindGroup = null;
      this.boatBuffer = null;
      this.boatTexture = null;
      this.boatSampler = null;
      this.boatCapacity = 0;
      if (!this.destroyed) console.warn("Transport sprites disabled:", error);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.boatBuffer?.destroy();
    this.boatTexture?.destroy();
    this.boatPipeline = null;
    this.boatBindGroup = null;
    this.boatBuffer = null;
    this.boatTexture = null;
    this.boatSampler = null;
    this.boatCapacity = 0;
    this.boatCount = 0;
    this.boatInstances = new ArrayBuffer(0);
    this.device.destroy();
  }

  /** Upload a map's terrain-colors image (full map resolution) with mips. */
  async setMap(image: ImageBitmap): Promise<void> {
    this.texture?.destroy();
    this.mapWidthValue = image.width;
    this.mapHeightValue = image.height;
    // Enough mips for any reachable zoom-out (min scale ≈ 0.2 px/tile);
    // generating the full chain on a 4096-wide map wastes load time.
    const mipLevelCount = Math.min(
      6,
      1 + Math.floor(Math.log2(Math.max(image.width, image.height))),
    );
    this.texture = this.device.createTexture({
      label: "shell-terrain",
      size: { width: image.width, height: image.height },
      format: "rgba8unorm",
      mipLevelCount,
      usage:
        TEXTURE_USAGE.TEXTURE_BINDING |
        TEXTURE_USAGE.COPY_DST |
        TEXTURE_USAGE.RENDER_ATTACHMENT,
    });
    for (let level = 0; level < mipLevelCount; level += 1) {
      const width = Math.max(1, image.width >> level);
      const height = Math.max(1, image.height >> level);
      const source =
        level === 0
          ? image
          : await createImageBitmap(image, {
              resizeWidth: width,
              resizeHeight: height,
              resizeQuality: "high",
            });
      this.device.queue.copyExternalImageToTexture(
        { source },
        { texture: this.texture, mipLevel: level },
        { width, height },
      );
      if (source !== image) source.close();
    }
    this.bindGroup = this.device.createBindGroup({
      label: "shell-camera",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniform } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.texture.createView() },
        { binding: 3, resource: this.plotView() },
      ],
    });
    this.surfaceView = null;
  }

  /** The plot plane's view, or the 1×1 dummy when none is set. */
  private plotView(): GPUTextureView {
    if (this.plotTexture) return this.plotTexture.createView();
    this.plotDummy ??= this.device.createTexture({
      label: "shell-plot-dummy",
      size: { width: 1, height: 1 },
      format: "r8uint",
      usage: TEXTURE_USAGE.TEXTURE_BINDING,
    });
    return this.plotDummy.createView();
  }

  /** (Re)build the bind group for the current surface + plot plane. */
  private rebuildBindGroup(): void {
    const view = this.surfaceView ?? this.texture?.createView();
    if (!view) return;
    this.bindGroup = this.device.createBindGroup({
      label: "shell-camera",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniform } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: view },
        { binding: 3, resource: this.plotView() },
      ],
    });
  }

  private rebuildBoatBindGroup(): void {
    if (
      !this.boatPipeline ||
      !this.boatBuffer ||
      !this.boatSampler ||
      !this.boatTexture
    ) {
      return;
    }
    this.boatBindGroup = this.device.createBindGroup({
      label: "shell-transport",
      layout: this.boatPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniform } },
        { binding: 1, resource: { buffer: this.boatBuffer } },
        { binding: 2, resource: this.boatSampler },
        { binding: 3, resource: this.boatTexture.createView() },
      ],
    });
  }

  private uploadBoatInstances(): void {
    if (this.destroyed || !this.boatPipeline || !this.boatBuffer) return;
    if (this.boatInstances.byteLength > this.boatCapacity) {
      const previous = this.boatBuffer;
      this.boatBuffer = this.device.createBuffer({
        label: "shell-transport",
        size: this.boatInstances.byteLength,
        usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST,
      });
      this.boatCapacity = this.boatInstances.byteLength;
      this.rebuildBoatBindGroup();
      previous.destroy();
    }
    if (this.boatInstances.byteLength > 0) {
      this.device.queue.writeBuffer(this.boatBuffer, 0, this.boatInstances);
    }
  }

  /**
   * Attach (or detach with width 0) the per-tile plot plane for sub-tile
   * sprites — openfront-live's structure layer. Rebuilds the bind group so
   * it can be toggled after setMap/setLiveTexture.
   */
  setPlotPlane(width: number, height: number): void {
    this.plotTexture?.destroy();
    this.plotTexture = null;
    this.plotStaging = null;
    this.plotEnabled = width > 0 && height > 0;
    if (this.plotEnabled) {
      this.plotTexture = this.device.createTexture({
        label: "shell-plot-plane",
        size: { width, height },
        format: "r8uint",
        usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
      });
    }
    if (this.bindGroup) this.rebuildBindGroup();
  }

  /** Upload the full plot plane (one byte per tile, row-major). */
  writePlotPlane(bytes: Uint8Array, width: number, height: number): void {
    if (!this.plotTexture) return;
    // bytesPerRow must be 256-aligned; pad through a staging copy if needed.
    const bytesPerRow = Math.ceil(width / 256) * 256;
    let src = bytes;
    if (bytesPerRow !== width) {
      this.plotStaging ??= new Uint8Array(bytesPerRow * height);
      for (let y = 0; y < height; y++) {
        this.plotStaging.set(
          bytes.subarray(y * width, (y + 1) * width),
          y * bytesPerRow,
        );
      }
      src = this.plotStaging;
    }
    this.device.queue.writeTexture(
      { texture: this.plotTexture },
      src,
      { bytesPerRow, rowsPerImage: height },
      { width, height },
    );
  }

  setTransportShips(
    ships: Int32Array,
    fill: Uint32Array,
    border: Uint32Array,
  ): void {
    if (this.destroyed) return;
    this.boatInstances = buildTransportShipInstances(
      ships,
      this.mapWidthValue,
      fill,
      border,
    );
    this.boatCount = ships.length / 4;
    this.boatUpdatedAt = performance.now();
    this.uploadBoatInstances();
  }

  /**
   * Display an externally-owned texture (e.g. a headless FieldKernel's out
   * view) under the camera. The texture must live on this renderer's device.
   * No mips: live sim output is regenerated per tick, so it samples base
   * level only (minification shimmer on huge maps is accepted for now).
   */
  setLiveTexture(view: GPUTextureView, width: number, height: number): void {
    this.texture?.destroy();
    this.texture = null;
    this.mapWidthValue = width;
    this.mapHeightValue = height;
    this.surfaceView = view;
    this.rebuildBindGroup();
  }

  /**
   * Detach the current surface. render() no-ops until the next setMap /
   * setLiveTexture — call before destroying or resizing a live texture the
   * bind group still references (a stale view in a submit is a device error).
   */
  clearSurface(): void {
    this.texture?.destroy();
    this.texture = null;
    this.surfaceView = null;
    this.bindGroup = null;
  }

  /** Fit-to-viewport scale for the current map (framebuffer px per tile). */
  fitScale(): number {
    if (this.mapWidthValue === 0) return 1;
    return Math.min(
      this.canvas.width / this.mapWidthValue,
      this.canvas.height / this.mapHeightValue,
    );
  }

  /** Sync the canvas backing store to its CSS size; returns true if it changed. */
  syncSize(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (width === this.canvas.width && height === this.canvas.height) {
      return false;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  render(camera?: CameraState): void {
    if (this.destroyed || !this.bindGroup || !camera) return;
    const data = new Float32Array(12);
    const invScale = 1 / camera.scale;
    data[0] = camera.cx - (this.canvas.width / 2) * invScale; // origin.x
    data[1] = camera.cy - (this.canvas.height / 2) * invScale; // origin.y
    data[2] = invScale;
    data[3] = this.plotEnabled && this.plotTexture ? 1 : 0;
    data[4] = this.mapWidthValue;
    data[5] = this.mapHeightValue;
    data[6] = Math.min(1, (performance.now() - this.boatUpdatedAt) / 100);
    data[8] = this.canvas.width;
    data[9] = this.canvas.height;
    this.device.queue.writeBuffer(this.cameraUniform, 0, data);

    const encoder = this.device.createCommandEncoder({ label: "shell-camera" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.04, g: 0.05, b: 0.07, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    if (this.boatPipeline && this.boatBindGroup && this.boatCount > 0) {
      pass.setPipeline(this.boatPipeline);
      pass.setBindGroup(0, this.boatBindGroup);
      pass.draw(6, this.boatCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
