/**
 * PlotPass — tribal single-tile plots (add-tile-painted-structures).
 *
 * Settlement/Farmland/Barn are painted into the terrain as per-tile colors
 * instead of sprite icons. Reads the PlotCache buffer as an R8UI texture
 * (value = type index + 1; 0 = none) and draws a fullscreen map quad that
 * replaces the territory color wherever a plot exists. The 2×2 "sprite"
 * inside each tile is generated in the fragment shader from the sub-tile
 * UV; farmland derives its tilled-row colors from the tile's own base
 * terrain color (uTerrainTex — shared with TerrainPass) so districts blend
 * with the local biome. Also renders the paint-mode ghost: the hovered
 * tile's pattern tinted by placement validity.
 *
 * Drawn after TerritoryPass and before border stamps, so districts read as
 * part of the land while borders stay legible on top.
 */
import overlayVertSrc from "../shaders/map-overlay/overlay.vert.glsl?raw";
import plotFragSrc from "../shaders/plot/plot.frag.glsl?raw";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
} from "../utils/GlUtils";

export interface PlotGhost {
  anchorX: number;
  anchorY: number;
  typeIdx: number;
  valid: boolean;
}

export class PlotPass {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private plotTex: WebGLTexture;

  private uCamera: WebGLUniformLocation;
  private uMapSize: WebGLUniformLocation;
  private uGhost: WebGLUniformLocation;

  private cpuPlotState: Uint8Array;
  private dirty = false;
  private hasPlots = false;
  private ghost: PlotGhost | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    private terrainTex: WebGLTexture,
  ) {
    this.cpuPlotState = new Uint8Array(mapW * mapH);
    this.program = createProgram(gl, overlayVertSrc, plotFragSrc);
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uMapSize = gl.getUniformLocation(this.program, "uMapSize")!;
    this.uGhost = gl.getUniformLocation(this.program, "uGhost")!;

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uPlotTex"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTerrainTex"), 1);
    gl.uniform2f(this.uMapSize, mapW, mapH);
    gl.uniform4f(this.uGhost, 0, 0, -1, 0);

    this.plotTex = createTexture2D(gl, {
      width: mapW,
      height: mapH,
      internalFormat: gl.R8UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_BYTE,
      data: this.cpuPlotState,
      filter: gl.NEAREST,
    });

    this.vao = createMapQuad(gl, mapW, mapH);
  }

  uploadPlotState(plotState: Uint8Array): void {
    this.cpuPlotState.set(plotState);
    this.dirty = true;
    this.hasPlots = plotState.some((v) => v !== 0);
  }

  /** Paint-mode ghost (null = none). */
  setGhost(ghost: PlotGhost | null): void {
    this.ghost = ghost;
  }

  draw(cameraMatrix: Float32Array): void {
    if (!this.hasPlots && this.ghost === null) {
      return;
    }
    const gl = this.gl;
    gl.useProgram(this.program);

    if (this.dirty) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.plotTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.mapW,
        this.mapH,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        this.cpuPlotState,
      );
      this.dirty = false;
    }

    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    const g = this.ghost;
    gl.uniform4f(
      this.uGhost,
      g?.anchorX ?? 0,
      g?.anchorY ?? 0,
      g === null ? -1 : g.typeIdx,
      g?.valid === true ? 1 : 0,
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.plotTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.terrainTex);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.plotTex);
    gl.deleteVertexArray(this.vao);
  }
}
