import type { CameraState } from "../shell/CameraRenderer";

// The renderer contract the unified FieldViewer draws through (unify-field-viewer
// phase 4.1). Two implementations:
//   BlitRenderer   — the #lab model: a 1:1 pixelated blit of the field's out
//                    texture to a map-sized canvas (CSS stretches it). No camera.
//   CameraRenderer — the #shell model: the out texture (or a baked bitmap)
//                    under a pan/zoom camera.
// Both own the GPU device; the FieldKernel runs headless on `renderer.device`
// and the renderer is pointed at its `outView`. This lets one FieldViewer drive
// either presentation from the same headless kernel + declared system.
export interface ViewerRenderer {
  /** The device every kernel/derivation in this viewer must share. */
  readonly device: GPUDevice;
  /** Source dimensions of the currently displayed texture/bitmap. */
  readonly mapWidth: number;
  readonly mapHeight: number;
  /** Sync the canvas backing store to its layout; returns true if it changed. */
  syncSize(): boolean;
  /** Fit-to-viewport scale (framebuffer px per tile); 1 for the blit model. */
  fitScale(): number;
  /** Point the renderer at an externally-owned texture on `device`. */
  setLiveTexture(view: GPUTextureView, width: number, height: number): void;
  /** Upload and display a baked bitmap (fallback / non-derived views). */
  setMap(image: ImageBitmap): Promise<void>;
  /** Detach the surface; render() no-ops until the next set*. */
  clearSurface(): void;
  /** Present one frame. `camera` is honored by CameraRenderer, ignored by
   * BlitRenderer. */
  render(camera?: CameraState): void;
  destroy(): void;
}
