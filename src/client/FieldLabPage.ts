import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameMapType } from "../core/game/Game";
import { LAB_SYSTEMS } from "./lab/systems";
import { terrainMapFileLoader } from "./TerrainMapFileLoader";
import {
  compileFieldSystem,
  type CompiledFieldSystem,
  type FieldSystem,
} from "./webgpu/FieldDynamics";
import { FieldKernel } from "./webgpu/FieldKernel";
import { uploadMapLayers } from "./webgpu/MapLayerUpload";

// #lab — the Field Dynamics playground (docs/FieldDynamics.md): pick a map
// and a system; params become sliders, views the dropdown, brushes the tool
// palette. The sim runs as compiled FieldKernel passes; painting is a stamp
// pass; scalars read back asynchronously.

// Fixed-clock mode: at most this many catch-up ticks per display frame (the
// death-spiral clamp — if the GPU can't keep the requested rate, sim time
// dilates instead of freezing the page).
const MAX_TICKS_PER_FRAME = 8;
// Turbo mode: adapt the ticks-per-command-buffer so one batch costs roughly
// this much GPU time — keeps presents/pause/brushes responsive on huge maps
// while staying GPU-bound.
const TURBO_TARGET_MS = 25;

@customElement("field-lab-page")
export class FieldLabPage extends LitElement {
  @state() private systemId = LAB_SYSTEMS[0]?.id ?? "";
  @state() private mapKey = "Verdantia";
  @state() private view = "";
  @state() private brush = "";
  @state() private paramValues: Record<string, number> = {};
  @state() private running = false;
  // Game clock: OpenFront ticks every 100ms, so 10/s is the default.
  @state() private ticksPerSecond = 10;
  @state() private turbo = false;
  @state() private status = "";
  @state() private scalarReadout: Record<string, number | number[]> = {};
  @state() private tickReadout = 0;
  @state() private gpuMs = 0;
  @state() private ticksPerSec = 0;

  private systems: readonly FieldSystem[] = LAB_SYSTEMS;
  private compiled: CompiledFieldSystem | null = null;
  private kernel: FieldKernel | null = null;
  private mapWidth = 0;
  private mapHeight = 0;
  private seed = 1337;
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private inFlight = false;
  private needsRedraw = false;
  private readbackTimer = 0;
  private botTimer = 0;
  private painting = false;
  private pumpActive = false;
  private lastPresent = 0;
  private turboBatch = 8;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.readbackTimer = window.setInterval(() => void this.readScalars(), 500);
    // Toy bot driver: while running, re-roll every player's attack target
    // periodically. A real game shell replaces this with actual player/AI
    // intents through the same writePlayers channel.
    this.botTimer = window.setInterval(() => {
      if (this.running) this.writeBots();
    }, 4000);
    this.raf = requestAnimationFrame(this.loop);
    this.installHotSwap();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.readbackTimer);
    window.clearInterval(this.botTimer);
    cancelAnimationFrame(this.raf);
    this.kernel?.destroy();
    this.kernel = null;
  }

  private writeBots(): void {
    if (!this.kernel || !this.compiled) return;
    if (this.compiled.playerCount === 0) return;
    const bots = Array.from(
      { length: this.compiled.playerCount },
      (_, p): Record<string, number> => ({
        alive: p === 0 ? 0 : 1, // slot 0 = neutral
        attacking: 1,
        commit: 0.4 + Math.random() * 0.6,
        targetX: Math.random() * this.mapWidth,
        targetY: Math.random() * this.mapHeight,
      }),
    );
    this.kernel.writeBuffer(
      "PL",
      new Uint8Array(this.compiled.writePlayers(bots)),
    );
  }

  firstUpdated(): void {
    if (!FieldKernel.isSupported()) {
      this.status = "WebGPU is not supported in this browser.";
      return;
    }
    void this.loadWorld();
  }

  private currentSystem(): FieldSystem | undefined {
    return this.systems.find((s) => s.id === this.systemId);
  }

  private async loadWorld(preserved?: Map<string, ArrayBuffer>): Promise<void> {
    const system = this.currentSystem();
    const canvas = this.querySelector<HTMLCanvasElement>("#lab-canvas");
    if (!system || !canvas) return;
    this.running = false;
    this.status = "Loading…";
    try {
      const compiled = await compileFieldSystem(system);
      const mapType = GameMapType[this.mapKey as keyof typeof GameMapType];
      const mapData = terrainMapFileLoader.getMapData(mapType);
      const manifest = await mapData.manifest();
      const width: number = manifest.map.width;
      const height: number = manifest.map.height;

      this.kernel?.destroy();
      this.kernel = null;
      const kernel = await FieldKernel.create(canvas, compiled.kernelConfig);
      kernel.resize(width, height);

      await uploadMapLayers(kernel, compiled.mapLayers, mapData, width, height);

      this.compiled = compiled;
      this.kernel = kernel;
      this.mapWidth = width;
      this.mapHeight = height;
      if (!compiled.viewNames.includes(this.view)) {
        this.view = compiled.viewNames[0] ?? "";
      }
      if (!compiled.brushNames.includes(this.brush)) {
        this.brush = compiled.brushNames[0] ?? "";
      }
      this.paramValues = Object.fromEntries(
        compiled.paramList.map((p) => [
          p.name,
          this.paramValues[p.name] ?? p.value,
        ]),
      );
      kernel.writeUniform(
        "P",
        compiled.writeParams(this.paramValues, this.seed),
      );
      this.turboBatch = 8; // re-learn the map's cost profile
      this.writeBots();
      await this.resetState();

      // State migration: restore fields that survived a hot-swap.
      if (preserved) {
        for (const name of compiled.layerNames) {
          const data = preserved.get(name);
          if (data && data.byteLength === width * height * 4) {
            kernel.writeBuffer(name, new Float32Array(data));
          }
        }
        this.needsRedraw = true;
      }
      this.status = "";
      this.tickReadout = 0;
      this.scalarReadout = {};
    } catch (error) {
      this.status = (error as Error).message;
    }
  }

  private async resetState(): Promise<void> {
    if (!this.kernel || !this.compiled) return;
    this.kernel.clearBuffer("S");
    const frame = this.kernel.beginFrame();
    this.compiled.runInit(frame);
    this.compiled.runView(frame, this.view);
    frame.present();
    await frame.finish();
  }

  // Turbo (fast-forward): GPU-bound batches submitted back to back, paced
  // only by GPU completion. The batch size adapts toward TURBO_TARGET_MS of
  // GPU time so presents, pause, and brushes stay responsive even on huge
  // maps; a view+present rides along roughly once per display frame.
  private async pump(): Promise<void> {
    if (this.pumpActive) return;
    this.pumpActive = true;
    try {
      while (this.turbo && this.running && this.kernel && this.compiled) {
        const kernel = this.kernel;
        const compiled = this.compiled;
        const batch = this.turboBatch;
        const frame = kernel.beginFrame();
        for (let t = 0; t < batch; t += 1) {
          compiled.runTick(kernel, frame);
        }
        const now = performance.now();
        if (now - this.lastPresent > 16) {
          compiled.runView(frame, this.view);
          frame.present();
          this.lastPresent = now;
        }
        const result = await frame.finish();
        if (this.kernel !== kernel) break;
        this.tickReadout += batch;
        this.ticksPerSec = Math.round((batch / result.gpuMs) * 1000);
        this.gpuMs = result.gpuMs;
        // Blend toward the batch size that would cost TURBO_TARGET_MS.
        const ideal = (batch * TURBO_TARGET_MS) / Math.max(0.5, result.gpuMs);
        this.turboBatch = Math.round(
          Math.min(1024, Math.max(1, batch * 0.5 + ideal * 0.5)),
        );
      }
    } catch (error) {
      this.status = (error as Error).message;
    } finally {
      this.pumpActive = false;
    }
  }

  // The default game clock: fixed-rate ticks paced by wall time (10/s
  // matches OpenFront's 100ms tick step), clamped so an overloaded GPU
  // dilates sim time instead of freezing the page. Also handles redraws
  // while paused. Turbo hands the queue to the pump instead.
  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt =
      this.lastTime === 0 ? 0 : Math.min(0.25, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (!this.kernel || !this.compiled || this.inFlight) return;
    if (this.turbo && this.running) return; // the pump owns the queue
    let ticks = 0;
    if (this.running) {
      this.accumulator = Math.min(
        this.accumulator + dt * this.ticksPerSecond,
        MAX_TICKS_PER_FRAME,
      );
      ticks = Math.floor(this.accumulator);
      this.accumulator -= ticks;
    }
    if (ticks === 0 && !this.needsRedraw) return;
    this.needsRedraw = false;
    this.encodeFrame(ticks);
  };

  private encodeFrame(ticks: number): void {
    if (!this.kernel || !this.compiled) return;
    this.inFlight = true;
    const frame = this.kernel.beginFrame();
    for (let t = 0; t < ticks; t += 1) {
      this.compiled.runTick(this.kernel, frame);
    }
    this.compiled.runView(frame, this.view);
    frame.present();
    frame
      .finish()
      .then((result) => {
        this.gpuMs = result.gpuMs;
        this.tickReadout += ticks;
      })
      .catch((error: unknown) => {
        this.status = (error as Error).message;
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private async readScalars(): Promise<void> {
    if (!this.kernel || !this.compiled || this.inFlight) return;
    if (this.compiled.scalarNames.length === 0) return;
    try {
      const data = await this.kernel.readBuffer("S");
      const decoded = this.compiled.decodeScalars(data);
      this.scalarReadout = decoded.values;
      this.tickReadout = decoded.tick;
    } catch {
      // Kernel may have been torn down mid-read; ignore.
    }
  }

  private stamp(event: PointerEvent): void {
    if (!this.kernel || !this.compiled || this.brush === "") return;
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.mapWidth;
    const y = ((event.clientY - rect.top) / rect.height) * this.mapHeight;
    this.kernel.writeUniform("B", this.compiled.encodeBrush(this.brush, x, y));
    const frame = this.kernel.beginFrame();
    frame.pass(this.compiled.brushPass(this.brush));
    if (!this.running) {
      this.compiled.runView(frame, this.view);
      frame.present();
    }
    void frame.finish();
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

  private updateParam(name: string, value: number): void {
    this.paramValues = { ...this.paramValues, [name]: value };
    if (this.kernel && this.compiled) {
      this.kernel.writeUniform(
        "P",
        this.compiled.writeParams(this.paramValues, this.seed),
      );
      this.needsRedraw = true;
    }
  }

  private installHotSwap(): void {
    // Vite HMR: swap the edited system into the running lab, preserving
    // field state for layers whose names survive (docs/FieldDynamics.md §5).
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
          // Unreadable field: it will just re-init.
        }
      }
    }
    await this.loadWorld(preserved);
  }

  render() {
    if (!FieldKernel.isSupported()) {
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
                  @click=${() => {
                    this.running = !this.running;
                    this.accumulator = 0;
                    if (this.running && this.turbo) void this.pump();
                  }}
                >
                  ${this.running ? "Pause" : "Play"}
                </button>
                <label
                  class="px-3 py-2 border border-white/30 text-sm font-medium flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    .checked=${this.turbo}
                    @change=${(e: Event) => {
                      this.turbo = (e.target as HTMLInputElement).checked;
                      this.accumulator = 0;
                      if (this.running && this.turbo) void this.pump();
                    }}
                  />
                  Turbo
                </label>
                <button
                  class="px-3 py-2 border border-white/30 text-sm font-medium"
                  @click=${() => this.encodeFrame(1)}
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
