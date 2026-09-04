import { html, LitElement, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { renderNumber } from "../../Utils";

/**
 * One sampled point of a resource economy (econ-panel spec). All display
 * units. `maxCapacity` is the competitive frame: the largest storage
 * capacity among alive players, used as the y-axis maximum.
 */
export interface ResourceSample {
  stock: number;
  capacity: number;
  maxCapacity: number;
  production: number;
  consumption: number;
  rank: number;
  alive: number;
}

/**
 * Resource-agnostic time-series chart (add-economy-insights): a ring buffer
 * of samples drawn on a small canvas. The stock line reads against the best
 * economy in the game (dynamic y-max = leader capacity); the player's own
 * capacity renders as a dashed ceiling. Future resources (metal, oil) are
 * new instances with different accessors — no new chart code.
 */
@customElement("resource-chart")
export class ResourceChart extends LitElement {
  /** Line color for the stock series (e.g. food amber). */
  @property({ type: String }) lineColor = "#fcd34d";
  /** Dashed color for the player's own capacity ceiling. */
  @property({ type: String }) capacityColor = "rgba(252, 211, 77, 0.45)";
  @property({ type: Number }) maxSamples = 360;

  private samples: ResourceSample[] = [];
  private canvas: HTMLCanvasElement | null = null;

  private static readonly W = 260;
  private static readonly H = 120;

  createRenderRoot() {
    return this;
  }

  /** Push one sample (caller owns the cadence) and repaint. */
  addSample(sample: ResourceSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
    this.requestUpdate();
  }

  /** Exposed for tests/driver scripts. */
  sampleCount(): number {
    return this.samples.length;
  }

  latest(): ResourceSample | null {
    return this.samples.length > 0
      ? this.samples[this.samples.length - 1]
      : null;
  }

  protected updated(_changed: PropertyValues): void {
    this.paint();
  }

  private paint(): void {
    this.canvas ??= this.querySelector("canvas");
    const ctx = this.canvas?.getContext("2d");
    if (!this.canvas || !ctx || this.samples.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = ResourceChart.W;
    const h = ResourceChart.H;
    if (this.canvas.width !== w * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Dynamic competitive scale: the leading economy's capacity, never 0.
    const latest = this.samples[this.samples.length - 1];
    const yMax = Math.max(1, latest.maxCapacity);
    const pad = 2;
    const toX = (i: number) =>
      pad + (i / Math.max(1, this.maxSamples - 1)) * (w - 2 * pad);
    const toY = (v: number) =>
      h - pad - (Math.min(v, yMax) / yMax) * (h - 2 * pad);

    // Baseline.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)"; // slate-400-ish
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - pad + 0.5);
    ctx.lineTo(w - pad, h - pad + 0.5);
    ctx.stroke();

    // Own capacity ceiling (dashed).
    ctx.strokeStyle = this.capacityColor;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const x = toX(i);
      const y = toY(s.capacity);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Stock line.
    ctx.strokeStyle = this.lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const x = toX(i);
      const y = toY(s.stock);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  render() {
    const s = this.latest();
    return html`
      <div class="flex flex-col gap-1" translate="no">
        <div class="flex items-center justify-between text-xs text-white gap-2">
          <span class="flex items-center gap-2 tabular-nums">
            <span class="text-green-400"
              >+${renderNumber(s?.production ?? 0)}/s</span
            >
            <span class="text-red-400"
              >−${renderNumber(s?.consumption ?? 0)}/s</span
            >
          </span>
          <span
            class="px-1.5 py-0.5 rounded border border-slate-500 bg-gray-700/60 font-bold"
            >#${s?.rank ?? "—"} / ${s?.alive ?? "—"}</span
          >
        </div>
        <div class="relative">
          <canvas
            style="width: ${ResourceChart.W}px; height: ${ResourceChart.H}px;"
            class="block rounded bg-gray-900/60"
          ></canvas>
          <span
            class="absolute top-0.5 right-1 text-[10px] text-slate-400 tabular-nums"
            >${renderNumber(s?.maxCapacity ?? 0)}</span
          >
        </div>
      </div>
    `;
  }
}
