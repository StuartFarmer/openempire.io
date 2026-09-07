/**
 * FertilityOverlayPass — the baked soil-plane tints (simplify-food-economy
 * tile-fertility spec + restore-organic-growth city-growth spec: "the planes
 * are visible before they matter").
 *
 * Two static planes share this pass, cycled from the BuildBar (off →
 * fertility → suitability → off):
 *
 * - fertility: lush green at high fertility fading through brown/red on
 *   barren ground — read the land before planting or invading.
 * - suitability: blue at prime town ground fading to dun on poor sites —
 *   read where a city wants to grow.
 *
 * Each plane IS the sim's data — WebGLFrameBuilder bakes it once with the
 * core's own bake function and uploads it here as a map-sized R8 texture:
 * 0 = water / impassable (transparent), 1..255 = the byte. Drawing is one
 * textured map quad, exactly like TerrainPass; the tint colors switch with
 * the active mode.
 */

import type { RenderSettings } from "../RenderSettings";
import fertilityFragSrc from "../shaders/fertility-overlay/fertility-overlay.frag.glsl?raw";
import terrainVertSrc from "../shaders/terrain/terrain.vert.glsl?raw";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
  shaderSrc,
} from "../utils/GlUtils";

/** BuildBar cycle states for the soil overlays. */
export type SoilOverlayMode = "off" | "fertility" | "suitability";

type SoilPlane = Exclude<SoilOverlayMode, "off">;

type OverlayTint = RenderSettings["fertilityOverlay"];

export class FertilityOverlayPass {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uCamera: WebGLUniformLocation;
  private uLowColor: WebGLUniformLocation;
  private uHighColor: WebGLUniformLocation;
  private uAlpha: WebGLUniformLocation;

  private tex: Record<SoilPlane, WebGLTexture>;
  private hasData: Record<SoilPlane, boolean> = {
    fertility: false,
    suitability: false,
  };
  private tint: Record<SoilPlane, OverlayTint>;

  private _mode: SoilOverlayMode = "off";

  constructor(
    private gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    fertilitySettings: RenderSettings["fertilityOverlay"],
    suitabilitySettings: RenderSettings["suitabilityOverlay"],
  ) {
    this.program = createProgram(
      gl,
      shaderSrc(terrainVertSrc, { MAP_W: mapW, MAP_H: mapH }),
      fertilityFragSrc,
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uLowColor = gl.getUniformLocation(this.program, "uLowColor")!;
    this.uHighColor = gl.getUniformLocation(this.program, "uHighColor")!;
    this.uAlpha = gl.getUniformLocation(this.program, "uAlpha")!;

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uFertility"), 0);
    this.tint = {
      fertility: fertilitySettings,
      suitability: suitabilitySettings,
    };

    const makeTex = () =>
      createTexture2D(gl, {
        width: mapW,
        height: mapH,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        data: null,
        filter: gl.NEAREST,
      });
    this.tex = { fertility: makeTex(), suitability: makeTex() };
    this.vao = createMapQuad(gl, mapW, mapH);
  }

  setMode(mode: SoilOverlayMode): void {
    this._mode = mode;
  }

  mode(): SoilOverlayMode {
    return this._mode;
  }

  hasField(plane: SoilPlane): boolean {
    return this.hasData[plane];
  }

  /** Upload a baked soil plane (map-sized, one byte per tile). Each plane is
   *  static for the whole game — uploaded once, kept forever. */
  update(plane: Uint8Array, which: SoilPlane): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex[which]);
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
      plane,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.hasData[which] = true;
  }

  draw(cameraMatrix: Float32Array): void {
    const mode = this._mode;
    if (mode === "off" || !this.hasData[mode]) return;
    const gl = this.gl;
    const tint = this.tint[mode];
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform3f(this.uLowColor, tint.lowR, tint.lowG, tint.lowB);
    gl.uniform3f(this.uHighColor, tint.highR, tint.highG, tint.highB);
    gl.uniform2f(this.uAlpha, tint.alphaLow, tint.alphaHigh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[mode]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.tex.fertility);
    gl.deleteTexture(this.tex.suitability);
    gl.deleteVertexArray(this.vao);
  }
}
