import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { GameMapType } from "../core/game/Game";
import { BlitRenderer } from "./viewer/BlitRenderer";
import { FieldViewerBase } from "./viewer/FieldViewerBase";
import type { ViewerRenderer } from "./viewer/ViewerRenderer";
import type { FieldSystem } from "./webgpu/FieldDynamics";

// #lab — the Field Dynamics playground (docs/FieldDynamics.md): pick a map and
// a system; params become sliders, views the dropdown, brushes the tool
// palette. A thin subclass of FieldViewerBase — the shared machinery (headless
// kernel, tick loop, turbo, brushes, panels) lives in the base; the lab adds
// the 1:1 blit presentation and Vite hot-swap.

@customElement("field-lab-page")
export class FieldLabPage extends FieldViewerBase {
  connectedCallback(): void {
    super.connectedCallback();
    this.installHotSwap();
  }

  protected canvasId(): string {
    return "lab-canvas";
  }

  protected async createRenderer(
    canvas: HTMLCanvasElement,
  ): Promise<ViewerRenderer> {
    return BlitRenderer.create(canvas);
  }

  protected async onSystemMounted(): Promise<void> {
    if (this.renderer && this.kernel?.outView) {
      this.renderer.setLiveTexture(
        this.kernel.outView,
        this.mapWidth,
        this.mapHeight,
      );
    }
  }

  protected present(): void {
    this.renderer?.render();
  }

  firstUpdated(): void {
    if (!BlitRenderer.isSupported()) {
      this.status = "WebGPU is not supported in this browser.";
      return;
    }
    void this.loadWorld();
  }

  // --- Vite HMR: hot-swap the edited system, preserving field state ----------
  private installHotSwap(): void {
    const hot = (import.meta as { hot?: ViteHotContext }).hot;
    hot?.accept("./lab/systems/index", (mod) => {
      const systems = (mod as { LAB_SYSTEMS?: readonly FieldSystem[] })
        ?.LAB_SYSTEMS;
      if (!systems) return;
      this.systems = systems;
      void this.hotSwap();
    });
  }

  private async hotSwap(): Promise<void> {
    const preserved = new Map<string, ArrayBuffer>();
    if (this.kernel && this.compiled) {
      for (const name of this.compiled.layerNames) {
        try {
          preserved.set(name, await this.kernel.readBuffer(name));
        } catch {
          // Unreadable field: it will re-init.
        }
      }
    }
    await this.loadWorld(preserved);
  }

  render() {
    if (!BlitRenderer.isSupported()) {
      return html`<section
        class="w-full h-full bg-neutral-950 text-white overflow-auto"
      >
        <div class="max-w-3xl mx-auto p-8 text-white/80 leading-7">
          <h1 class="text-2xl font-semibold text-white mb-4">Field Lab</h1>
          <p>This browser does not expose <code>navigator.gpu</code>.</p>
        </div>
      </section>`;
    }

    const compiled = this.compiled;
    return html`
      <section class="w-full h-full bg-neutral-950 text-white overflow-auto">
        <div
          class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 p-4 sm:p-6"
        >
          <div class="min-w-0 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <h1 class="text-2xl font-semibold">Field Lab</h1>
              <div class="flex gap-2 items-center flex-wrap">
                <button
                  class="px-3 py-2 bg-white text-black text-sm font-medium"
                  @click=${() => this.toggleRunning()}
                >
                  ${this.running ? "Pause" : "Play"}
                </button>
                <label
                  class="px-3 py-2 border border-white/30 text-sm font-medium flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    .checked=${this.turbo}
                    @change=${(e: Event) =>
                      this.setTurbo((e.target as HTMLInputElement).checked)}
                  />
                  Turbo
                </label>
                <button
                  class="px-3 py-2 border border-white/30 text-sm font-medium"
                  @click=${() => this.step(1)}
                >
                  Step
                </button>
                <button
                  class="px-3 py-2 border border-white/30 text-sm font-medium"
                  @click=${() => {
                    this.tickReadout = 0;
                    void this.resetState();
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div class="text-sm text-white/70 flex gap-4 flex-wrap">
              <span>tick ${this.tickReadout}</span>
              ${this.running && this.turbo
                ? html`<span>${this.ticksPerSec} ticks/s (turbo)</span>`
                : html`<span>${this.gpuMs.toFixed(1)} ms/frame</span>`}
              ${Object.entries(this.scalarReadout).map(
                ([name, value]) =>
                  html`<span>${name}: ${formatScalar(value)}</span>`,
              )}
            </div>

            ${this.status
              ? html`<pre
                  class="text-amber-300 text-xs whitespace-pre-wrap border border-amber-300/30 p-3 max-h-64 overflow-auto"
                >
${this.status}</pre
                >`
              : null}

            <canvas
              id="lab-canvas"
              class="w-full max-w-[900px] [image-rendering:pixelated] border border-white/15 bg-black touch-none cursor-crosshair"
              @pointerdown=${this.onPointerDown}
              @pointermove=${this.onPointerMove}
              @pointerup=${this.onPointerUp}
              @pointercancel=${this.onPointerUp}
              aria-label="Field lab simulation"
            ></canvas>
          </div>

          <aside class="flex flex-col gap-4 text-sm">
            <label class="grid gap-1">
              <span class="text-white/70">System</span>
              <select
                class="bg-black border border-white/20 px-3 py-2 text-white"
                .value=${this.systemId}
                @change=${(e: Event) => {
                  this.systemId = (e.target as HTMLSelectElement).value;
                  this.paramValues = {};
                  void this.loadWorld();
                }}
              >
                ${this.systems.map(
                  (s) =>
                    html`<option
                      value=${s.id}
                      ?selected=${s.id === this.systemId}
                    >
                      ${s.name}
                    </option>`,
                )}
              </select>
            </label>

            <label class="grid gap-1">
              <span class="text-white/70">Map</span>
              <select
                class="bg-black border border-white/20 px-3 py-2 text-white"
                .value=${this.mapKey}
                @change=${(e: Event) => {
                  this.mapKey = (e.target as HTMLSelectElement).value;
                  void this.loadWorld();
                }}
              >
                ${Object.keys(GameMapType).map(
                  (key) =>
                    html`<option value=${key} ?selected=${key === this.mapKey}>
                      ${key}
                    </option>`,
                )}
              </select>
            </label>

            <label class="grid gap-1">
              <span class="text-white/70">View</span>
              <select
                class="bg-black border border-white/20 px-3 py-2 text-white"
                .value=${this.view}
                @change=${(e: Event) => {
                  this.view = (e.target as HTMLSelectElement).value;
                  this.needsRedraw = true;
                }}
              >
                ${(compiled?.viewNames ?? []).map(
                  (name) =>
                    html`<option value=${name} ?selected=${name === this.view}>
                      ${name}
                    </option>`,
                )}
              </select>
            </label>

            <label class="grid gap-1">
              <span class="text-white/70">Brush (click / drag on map)</span>
              <select
                class="bg-black border border-white/20 px-3 py-2 text-white"
                .value=${this.brush}
                @change=${(e: Event) => {
                  this.brush = (e.target as HTMLSelectElement).value;
                }}
              >
                ${(compiled?.brushNames ?? []).map(
                  (name) =>
                    html`<option value=${name} ?selected=${name === this.brush}>
                      ${name}
                    </option>`,
                )}
              </select>
            </label>

            <label class="grid gap-1">
              <span class="text-white/70"
                >Game clock: ${this.ticksPerSecond} ticks/s
                ${this.turbo ? "(overridden by Turbo)" : ""}</span
              >
              <input
                type="range"
                min="1"
                max="60"
                step="1"
                .value=${String(this.ticksPerSecond)}
                @input=${(e: Event) => {
                  this.ticksPerSecond = Number(
                    (e.target as HTMLInputElement).value,
                  );
                }}
              />
            </label>

            <div class="grid gap-3">
              ${(compiled?.paramList ?? []).map(
                (param) =>
                  html`<label class="grid gap-1">
                    <span class="text-white/70"
                      >${param.name}:
                      ${(this.paramValues[param.name] ?? param.value).toFixed(
                        3,
                      )}</span
                    >
                    <input
                      type="range"
                      min=${param.min}
                      max=${param.max}
                      step=${param.step}
                      .value=${String(
                        this.paramValues[param.name] ?? param.value,
                      )}
                      @input=${(e: Event) =>
                        this.updateParam(
                          param.name,
                          (e.target as HTMLInputElement).valueAsNumber,
                        )}
                    />
                  </label>`,
              )}
            </div>

            <div class="border border-white/15 p-3 text-white/75 leading-6">
              <div>
                Systems live in src/client/lab/systems — raw WGSL stocks,
                compiled to FieldKernel passes (docs/FieldDynamics.md).
              </div>
              <div class="mt-2">
                Edits hot-swap into the running sim with field state preserved.
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  private onPointerDown = (event: PointerEvent): void => {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    this.painting = true;
    this.stamp(event);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.painting) this.stamp(event);
  };

  private onPointerUp = (): void => {
    this.painting = false;
  };

  private painting = false;
}

// Grouped (per-player) scalars decode as arrays; show the first few slots.
function formatScalar(value: number | number[]): string {
  if (typeof value === "number") return value.toFixed(1);
  const head = value
    .slice(0, 4)
    .map((v) => v.toFixed(1))
    .join(", ");
  return value.length > 4 ? `[${head}, …]` : `[${head}]`;
}

interface ViteHotContext {
  accept(dep: string, cb: (mod: unknown) => void): void;
}
