/**
 * PlotFirePass — burn-down fire animation over razed tribal plots
 * (add-war-razing-and-spoilage).
 *
 * When a tribal plot (Settlement/Farmland/Barn) is violently removed, its
 * tile burns for ~1.5 s: flat 2×2 flame quadrants flickering through
 * ember/orange/yellow, collapsing to dark ember. It then leaves a grayscale
 * "ash" scar over the ground that lingers and fades out, revealing whatever
 * regrows beneath (the field greening back up from Initial). Instanced
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
  private uAshDuration: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: DynamicInstanceBuffer;
  private burnCount = 0;

  // Keyed by row-major tile ref so re-igniting a tile (e.g. a contested border
  // tile re-taken) resets that fire's clock in place instead of stacking a
  // duplicate — a churning front keeps ONE burning tile, and its flood never
  // evicts real fires elsewhere past the cap.
  private active = new Map<number, ActiveBurn>();
  private timeFn: () => number = () => performance.now();

  constructor(
    private gl: WebGL2RenderingContext,
    private settings: RenderSettings,
  ) {
    this.program = createProgram(gl, plotFireVertSrc, plotFireFragSrc);
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uTime = gl.getUniformLocation(this.program, "uTime")!;
    this.uDuration = gl.getUniformLocation(this.program, "uDuration")!;
    this.uAshDuration = gl.getUniformLocation(this.program, "uAshDuration")!;

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

  /**
   * Start (or restart) a burn over a tile, keyed by its row-major `ref`.
   * Re-igniting an already-burning tile just resets its clock so the fire
   * keeps going rather than dropping out. Oldest burn is dropped past the cap.
   */
  addBurn(x: number, y: number, ref: number): void {
    const now = this.timeFn();
    const existing = this.active.get(ref);
    if (existing) {
      existing.startMs = now;
      return;
    }
    if (this.active.size >= this.settings.fx.plotFireMaxActive) {
      // Evict the oldest by start time (Map insertion order ≠ age once clocks
      // are reset, so scan) — rare now that a churning front is one entry.
      let oldestRef = -1;
      let oldestStart = Infinity;
      for (const [k, b] of this.active) {
        if (b.startMs < oldestStart) {
          oldestStart = b.startMs;
          oldestRef = k;
        }
      }
      if (oldestRef >= 0) this.active.delete(oldestRef);
    }
    this.active.set(ref, { x, y, startMs: now });
  }

  tick(): void {
    if (this.active.size === 0) {
      this.burnCount = 0;
      return;
    }
    const now = this.timeFn();
    // A burn lives for the flame plus the ash-fade that follows it.
    const durationMs =
      this.settings.fx.plotFireDurationMs +
      this.settings.fx.plotFireAshDurationMs;

    for (const [k, b] of this.active) {
      if (now - b.startMs >= durationMs) this.active.delete(k);
    }

    const count = this.active.size;
    this.instanceBuf.ensureCapacity(count);
    const data = this.instanceBuf.float32;
    let i = 0;
    for (const b of this.active.values()) {
      const off = i * BURN_FLOATS;
      data[off + 0] = b.x;
      data[off + 1] = b.y;
      data[off + 2] = b.startMs * 0.001;
      // Stable per-tile flicker phase so simultaneous burns desynchronize.
      data[off + 3] = ((b.x * 31 + b.y * 17) % 97) / 97;
      i++;
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
    gl.uniform1f(
      this.uAshDuration,
      this.settings.fx.plotFireAshDurationMs * 0.001,
    );
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
    this.active.clear();
    this.burnCount = 0;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    this.instanceBuf.dispose();
    gl.deleteVertexArray(this.vao);
  }
}
