/**
 * PlotFirePass — burn-down fire animation over razed tribal plots
 * (add-war-razing-and-spoilage).
 *
 * When a tribal plot (Settlement/Farmland/Barn) is violently removed, its
 * tile burns for ~1.5 s: flat 2×2 flame quadrants flickering through
 * ember/orange/yellow, collapsing to dark ember and fading out. Instanced
 * per-tile quads, colors generated procedurally in the fragment shader —
 * same art language as PlotPass's 2×2 plot sprites.
 *
 * Fed from Renderer.applyDeadUnits (the deadUnits frame event, which fires
 * the same tick the plot buffer clears); drawn in the fx phase so fire sits
 * on top of territory and borders like other death effects.
 */
import { DynamicInstanceBuffer } from "../DynamicBuffer";
import type { RenderSettings } from "../RenderSettings";
import plotFireFragSrc from "../shaders/plot/plotfire.frag.glsl?raw";
import plotFireVertSrc from "../shaders/plot/plotfire.vert.glsl?raw";
import { createProgram } from "../utils/GlUtils";

interface ActiveBurn {
  x: number;
  y: number;
  startMs: number;
}

// Instance layout (4 floats): tileX, tileY, startSec, seed.
const BURN_FLOATS = 4;
const BURN_STRIDE = BURN_FLOATS * 4; // bytes

export class PlotFirePass {
  private program: WebGLProgram;
  private uCamera: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uDuration: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: DynamicInstanceBuffer;
  private burnCount = 0;

  private active: ActiveBurn[] = [];
  private timeFn: () => number = () => performance.now();

  constructor(
    private gl: WebGL2RenderingContext,
    private settings: RenderSettings,
  ) {
    this.program = createProgram(gl, plotFireVertSrc, plotFireFragSrc);
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uTime = gl.getUniformLocation(this.program, "uTime")!;
    this.uDuration = gl.getUniformLocation(this.program, "uDuration")!;

    const glBuf = gl.createBuffer()!;
    this.instanceBuf = new DynamicInstanceBuffer(gl, glBuf, 16, BURN_FLOATS);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    // location 1: tileX, tileY, startSec, seed
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, BURN_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.bindVertexArray(null);
  }

  /** Start a burn over a tile. Oldest burn is dropped past the cap. */
  addBurn(x: number, y: number): void {
    if (this.active.length >= this.settings.fx.plotFireMaxActive) {
      this.active.shift();
    }
    this.active.push({ x, y, startMs: this.timeFn() });
  }

  tick(): void {
    if (this.active.length === 0) {
      this.burnCount = 0;
      return;
    }
    const now = this.timeFn();
    const durationMs = this.settings.fx.plotFireDurationMs;

    for (let i = this.active.length - 1; i >= 0; i--) {
      if (now - this.active[i].startMs >= durationMs) {
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }

    const count = this.active.length;
    this.instanceBuf.ensureCapacity(count);
    const data = this.instanceBuf.float32;
    for (let i = 0; i < count; i++) {
      const b = this.active[i];
      const off = i * BURN_FLOATS;
      data[off + 0] = b.x;
      data[off + 1] = b.y;
      data[off + 2] = b.startMs * 0.001;
      // Stable per-tile flicker phase so simultaneous burns desynchronize.
      data[off + 3] = ((b.x * 31 + b.y * 17) % 97) / 97;
    }
    this.burnCount = count;
  }

  draw(cameraMatrix: Float32Array): void {
    if (this.burnCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uTime, this.timeFn() * 0.001);
    gl.uniform1f(this.uDuration, this.settings.fx.plotFireDurationMs * 0.001);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf.buffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.instanceBuf.float32,
      0,
      this.burnCount * BURN_FLOATS,
    );
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.burnCount);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.active.length = 0;
    this.burnCount = 0;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    this.instanceBuf.dispose();
    gl.deleteVertexArray(this.vao);
  }
}
