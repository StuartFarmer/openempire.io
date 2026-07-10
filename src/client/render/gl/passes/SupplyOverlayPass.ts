/**
 * SupplyOverlayPass — the supply-lines heatmap (openspec add-supply-lines).
 *
 * Shades the LOCAL player's territory by supply quality: well-supplied
 * districts get a faint green wash, the under-supplied frontier a strong
 * red one, so the logistics envelope is readable before committing to an
 * expansion or a push.
 *
 * The quality field is computed on the CPU each tick (the same owned-land
 * BFS the sim runs — see render/frame/derive/SupplyOverlay.ts) because
 * supply is a connectivity problem the GPU circle-stamp trick used by
 * DefenseCoveragePass cannot express. The result arrives here as a
 * map-sized R8 texture: 0 = not my tile, 1..255 = quality 0..1. Drawing is
 * one textured map quad, exactly like TerrainPass.
 */

import type { RenderSettings } from "../RenderSettings";
import supplyFragSrc from "../shaders/supply-overlay/supply-overlay.frag.glsl?raw";
import terrainVertSrc from "../shaders/terrain/terrain.vert.glsl?raw";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
  shaderSrc,
} from "../utils/GlUtils";

export class SupplyOverlayPass {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  private uCamera: WebGLUniformLocation;

  private enabled = false;
  private hasData = false;

  constructor(
    private gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    settings: RenderSettings["supplyOverlay"],
  ) {
    this.program = createProgram(
      gl,
      shaderSrc(terrainVertSrc, { MAP_W: mapW, MAP_H: mapH }),
      supplyFragSrc,
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uQuality"), 0);
    gl.uniform3f(
      gl.getUniformLocation(this.program, "uLowColor"),
      settings.lowR,
      settings.lowG,
      settings.lowB,
    );
    gl.uniform3f(
      gl.getUniformLocation(this.program, "uHighColor"),
      settings.highR,
      settings.highG,
      settings.highB,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, "uAlpha"),
      settings.alphaLow,
      settings.alphaHigh,
    );

    this.tex = createTexture2D(gl, {
      width: mapW,
      height: mapH,
      internalFormat: gl.R8,
      format: gl.RED,
      type: gl.UNSIGNED_BYTE,
      data: null,
      filter: gl.NEAREST,
    });
    this.vao = createMapQuad(gl, mapW, mapH);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    // Stale data must not flash when re-enabled — wait for a fresh field.
    if (!on) this.hasData = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Upload a fresh quality field (map-sized, one byte per tile). */
  update(quality: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // R8 rows aren't 4-byte aligned on arbitrary map widths.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.mapW,
      this.mapH,
      gl.RED,
      gl.UNSIGNED_BYTE,
      quality,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.hasData = true;
  }

  draw(cameraMatrix: Float32Array): void {
    if (!this.enabled || !this.hasData) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.tex);
    gl.deleteVertexArray(this.vao);
  }
}
