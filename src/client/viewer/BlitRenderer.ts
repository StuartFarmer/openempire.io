import type { CameraState } from "../shell/CameraRenderer";
import type { ViewerRenderer } from "./ViewerRenderer";

// The #lab presentation model as a ViewerRenderer: own the GPU device and blit
// a field's out texture (or a baked bitmap) 1:1 to a canvas sized to the source
// map, letting CSS stretch it pixelated. This is exactly what the FieldKernel's
// built-in present did when it owned the canvas — extracted here so the kernel
// can run headless on `device` and the unified FieldViewer can swap this for the
// CameraRenderer without touching the kernel/system.

const TEXTURE_USAGE = {
  COPY_DST: 0x2,
  TEXTURE_BINDING: 0x4,
  RENDER_ATTACHMENT: 0x10,
} as const;

// Fullscreen-triangle blit: 1:1 texel copy (framebuffer pixel = texture pixel).
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

export class BlitRenderer implements ViewerRenderer {
  private constructor(
    readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly canvas: HTMLCanvasElement,
    private readonly pipeline: GPURenderPipeline,
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

  static async create(canvas: HTMLCanvasElement): Promise<BlitRenderer> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter available");
    }
    const device = await adapter.requestDevice({
      label: "lab-blit",
      // Field systems bind more storage buffers than the default limit of 8.
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
    const context = canvas.getContext(
      "webgpu",
    ) as unknown as GPUCanvasContext | null;
    if (!context) {
      throw new Error("Could not create a WebGPU canvas context");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const module = device.createShaderModule({ label: "lab-blit", code: RENDER_WGSL });
    const pipeline = await device.createRenderPipelineAsync({
      label: "lab-blit",
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    return new BlitRenderer(device, context, canvas, pipeline);
  }

  destroy(): void {
    this.texture?.destroy();
    this.device.destroy();
  }

  /** The blit canvas is 1:1 with the map; CSS scales it. No DPR sync. */
  syncSize(): boolean {
    return false;
  }

  fitScale(): number {
    return 1;
  }

  setLiveTexture(view: GPUTextureView, width: number, height: number): void {
    this.texture?.destroy();
    this.texture = null;
    this.mapWidthValue = width;
    this.mapHeightValue = height;
    this.bindGroup = this.device.createBindGroup({
      label: "lab-blit-live",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: view }],
    });
  }

  async setMap(image: ImageBitmap): Promise<void> {
    this.texture?.destroy();
    this.mapWidthValue = image.width;
    this.mapHeightValue = image.height;
    this.texture = this.device.createTexture({
      label: "lab-blit-map",
      size: { width: image.width, height: image.height },
      format: "rgba8unorm",
      usage:
        TEXTURE_USAGE.TEXTURE_BINDING |
        TEXTURE_USAGE.COPY_DST |
        TEXTURE_USAGE.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture(
      { source: image },
      { texture: this.texture },
      { width: image.width, height: image.height },
    );
    this.bindGroup = this.device.createBindGroup({
      label: "lab-blit-map",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.texture.createView() }],
    });
  }

  clearSurface(): void {
    this.texture?.destroy();
    this.texture = null;
    this.bindGroup = null;
  }

  render(_camera?: CameraState): void {
    if (!this.bindGroup || this.mapWidthValue === 0) return;
    // 1:1 blit — size the backing store to the map; CSS handles display scale.
    if (this.canvas.width !== this.mapWidthValue) {
      this.canvas.width = this.mapWidthValue;
    }
    if (this.canvas.height !== this.mapHeightValue) {
      this.canvas.height = this.mapHeightValue;
    }
    const encoder = this.device.createCommandEncoder({ label: "lab-blit" });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
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
