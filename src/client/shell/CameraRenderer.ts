// Camera renderer for the game shell: draws a map's baked terrain-colors
// texture on a fullscreen canvas under a pan/zoom camera. Magnification is
// nearest (crisp original tiles when zoomed in); minification goes through
// CPU-built mips (clean zoom-out on 4096-wide maps). The camera uniform maps
// framebuffer pixels to map coordinates, so later shell steps can composite
// sim view textures under the exact same transform.

import type { ViewerRenderer } from "../viewer/ViewerRenderer";

const BUFFER_USAGE = { COPY_DST: 0x8, UNIFORM: 0x40 } as const;
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
  pad0: f32,
  mapSize: vec2f,
  pad1: vec2f,
}

@group(0) @binding(0) var<uniform> CAM: Cam;
@group(0) @binding(1) var terrainSampler: sampler;
@group(0) @binding(2) var terrain: texture_2d<f32>;

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
  let color = textureSample(
    terrain,
    terrainSampler,
    clamp(map / CAM.mapSize, vec2f(0.0), vec2f(1.0)),
  );
  let inside = map.x >= 0.0 && map.y >= 0.0 &&
    map.x < CAM.mapSize.x && map.y < CAM.mapSize.y;
  return select(vec4f(0.043, 0.055, 0.075, 1.0), color, inside);
}
`;

export class CameraRenderer implements ViewerRenderer {
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
      size: 32,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });
    // Crisp tiles when magnified, mip-filtered when minified.
    const sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    return new CameraRenderer(
      device,
      context,
      canvas,
      pipeline,
      cameraUniform,
      sampler,
    );
  }

  destroy(): void {
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
      ],
    });
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
    this.bindGroup = this.device.createBindGroup({
      label: "shell-camera-live",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniform } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: view },
      ],
    });
  }

  /**
   * Detach the current surface. render() no-ops until the next setMap /
   * setLiveTexture — call before destroying or resizing a live texture the
   * bind group still references (a stale view in a submit is a device error).
   */
  clearSurface(): void {
    this.texture?.destroy();
    this.texture = null;
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
    if (!this.bindGroup || !camera) return;
    const data = new Float32Array(8);
    const invScale = 1 / camera.scale;
    data[0] = camera.cx - (this.canvas.width / 2) * invScale; // origin.x
    data[1] = camera.cy - (this.canvas.height / 2) * invScale; // origin.y
    data[2] = invScale;
    data[4] = this.mapWidthValue;
    data[5] = this.mapHeightValue;
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
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
