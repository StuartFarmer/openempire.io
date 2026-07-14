/**
 * DensityPass — renders the self-growing urban density field
 * (openspec add-urban-core-growth). The city is no longer discrete plots but
 * a per-tile density field transmitted from the sim (packedDensityUpdates);
 * this pass draws it as a built-up wash over territory — unbuilt land
 * untouched, density grading from a faint settlement tint to a bright core.
 *
 * One R8 texture at map resolution, drawn as a single map quad (like
 * TerrainPass / SupplyOverlayPass). Fed by full uploads (seek/first frame)
 * and per-tile sub-uploads (the handful of tiles that change each tick).
 */

import type { RenderSettings } from "../RenderSettings";
import densityFragSrc from "../shaders/density/density.frag.glsl?raw";
import terrainVertSrc from "../shaders/terrain/terrain.vert.glsl?raw";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
  shaderSrc,
} from "../utils/GlUtils";

export class DensityPass {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  private uCamera: WebGLUniformLocation;
  private scratch = new Uint8Array(1);

  constructor(
    private gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    settings: RenderSettings["densityOverlay"],
  ) {
    this.program = createProgram(
      gl,
      shaderSrc(terrainVertSrc, { MAP_W: mapW, MAP_H: mapH }),
      densityFragSrc,
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uDensity"), 0);
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

  /** Full-map upload (first frame / seek). */
  update(density: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
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
      density,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Sub-upload the tiles that changed this tick. */
  applyDelta(refs: readonly number[], density: Uint8Array): void {
    if (refs.length === 0) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const ref of refs) {
      this.scratch[0] = density[ref];
      const x = ref % this.mapW;
      const y = (ref / this.mapW) | 0;
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x,
        y,
        1,
        1,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.scratch,
      );
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  draw(cameraMatrix: Float32Array): void {
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
