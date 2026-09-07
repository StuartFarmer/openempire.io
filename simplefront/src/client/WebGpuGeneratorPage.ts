import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createAlternativeWorldEngineMap } from "../games/alternative/world";
import {
  DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import { buildBoardMapTerrainRGBA } from "./render/gl";
import {
  WEBGPU_VIEW_MODES,
  WebGpuWorldEngine,
  type WebGpuViewMode,
} from "./webgpu/WebGpuWorldEngine";

type GeneratorConfig = Pick<
  FoundationWorldEngineMapConfig,
  | "seed"
  | "width"
  | "height"
  | "seaLevel"
  | "continentScale"
  | "mountainStrength"
  | "coastFalloff"
  | "coastRoughness"
  | "latitudeEffect"
  | "elevationCooling"
  | "rainNoise"
  | "warmthRainfall"
  | "riverFlowRetention"
  | "lakeWaterThreshold"
  | "lakeElevationRange"
  | "riverWeakThreshold"
  | "riverStrongThreshold"
>;

const VIEW_MODE_LABELS: Record<WebGpuViewMode, string> = {
  terrain: "Terrain",
  elevation: "Elevation",
  temperature: "Temperature",
  precipitation: "Precipitation",
  rivers: "Rivers",
  humidity: "Humidity",
  biome: "Biome",
};

@customElement("webgpu-generator-page")
export class WebGpuGeneratorPage extends LitElement {
  @state()
  private config: GeneratorConfig = {
    ...DEFAULT_FOUNDATION_WORLD_ENGINE_MAP_CONFIG,
  };

  @state()
  private viewMode: WebGpuViewMode = "terrain";

  @state()
  private status = WebGpuWorldEngine.isSupported()
    ? "Initializing WebGPU…"
    : "";

  @state()
  private gpuMs: number | null = null;

  @state()
  private dispatches = 0;

  @state()
  private adapterInfo = "";

  @state()
  private cpuMs: number | null = null;

  @state()
  private cpuRunning = false;

  private engine: WebGpuWorldEngine | null = null;
  private generating = false;
  private regeneratePending = false;

  createRenderRoot() {
    return this;
  }

  async firstUpdated(): Promise<void> {
    if (!WebGpuWorldEngine.isSupported()) return;
    const canvas = this.querySelector<HTMLCanvasElement>("#webgpu-canvas");
    if (!canvas) return;
    try {
      this.engine = await WebGpuWorldEngine.create(canvas);
      this.adapterInfo = this.engine.adapterInfo;
      this.status = "";
      this.scheduleGenerate();
    } catch (error) {
      this.status = `WebGPU init failed: ${(error as Error).message}`;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.engine?.destroy();
    this.engine = null;
  }

  private scheduleGenerate(): void {
    if (!this.engine) return;
    if (this.generating) {
      this.regeneratePending = true;
      return;
    }
    void this.runGenerate();
  }

  private async runGenerate(): Promise<void> {
    if (!this.engine) return;
    this.generating = true;
    try {
      do {
        this.regeneratePending = false;
        const result = await this.engine.generate(this.config, this.viewMode);
        this.gpuMs = result.gpuMs;
        this.dispatches = result.dispatches;
      } while (this.regeneratePending);
    } catch (error) {
      this.status = `Generation failed: ${(error as Error).message}`;
    } finally {
      this.generating = false;
    }
  }

  private updateNumber =
    (key: keyof GeneratorConfig) =>
    (event: Event): void => {
      const input = event.target as HTMLInputElement;
      const value = input.type === "range" ? input.valueAsNumber : input.value;
      this.config = {
        ...this.config,
        [key]: Number(value),
      };
      this.scheduleGenerate();
    };

  private updateViewMode = (event: Event): void => {
    this.viewMode = (event.target as HTMLSelectElement).value as WebGpuViewMode;
    this.scheduleGenerate();
  };

  private randomizeSeed = (): void => {
    this.config = {
      ...this.config,
      seed: Math.floor(Math.random() * 4294967296) - 2147483648,
    };
    this.scheduleGenerate();
  };

  private runCpuCompare = (): void => {
    if (this.cpuRunning) return;
    this.cpuRunning = true;
    // Let Lit paint the "running" state before the main thread blocks.
    requestAnimationFrame(async () => {
      try {
        const start = performance.now();
        const generated = createAlternativeWorldEngineMap(this.config);
        this.cpuMs = performance.now() - start;
        // The compare canvas only exists once cpuMs renders it in.
        await this.updateComplete;
        const canvas = this.querySelector<HTMLCanvasElement>("#cpu-canvas");
        const context = canvas?.getContext("2d");
        if (canvas && context) {
          const map = generated.map;
          canvas.width = map.width;
          canvas.height = map.height;
          const image = context.createImageData(map.width, map.height);
          image.data.set(buildBoardMapTerrainRGBA(map));
          context.putImageData(image, 0, 0);
        }
      } finally {
        this.cpuRunning = false;
      }
    });
  };

  render() {
    if (!WebGpuWorldEngine.isSupported()) {
      return html`
        <section class="w-full h-full bg-neutral-950 text-white overflow-auto">
          <div class="max-w-3xl mx-auto p-8 text-white/80 leading-7">
            <h1 class="text-2xl font-semibold text-white mb-4">
              WebGPU Map Generator
            </h1>
            <p>
              This browser does not expose <code>navigator.gpu</code>. Use a
              WebGPU-capable browser (Chrome, Edge, or recent Safari) to try the
              GPU world generator.
            </p>
          </div>
        </section>
      `;
    }

    const timing =
      this.gpuMs !== null
        ? `${this.gpuMs.toFixed(1)} ms · ${this.dispatches} dispatches`
        : "—";

    return html`
      <section class="w-full h-full bg-neutral-950 text-white overflow-auto">
        <div
          class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 p-4 sm:p-6"
        >
          <div class="min-w-0 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <h1 class="text-2xl font-semibold">WebGPU Map Generator</h1>
              <div class="flex gap-2 items-center">
                <select
                  class="bg-black border border-white/20 px-3 py-2 text-sm text-white"
                  .value=${this.viewMode}
                  @change=${this.updateViewMode}
                >
                  ${WEBGPU_VIEW_MODES.map(
                    (mode) =>
                      html`<option value=${mode}>
                        ${VIEW_MODE_LABELS[mode]}
                      </option>`,
                  )}
                </select>
                <button
                  class="px-3 py-2 bg-white text-black text-sm font-medium"
                  @click=${this.randomizeSeed}
                >
                  Random Seed
                </button>
              </div>
            </div>
            <div class="text-sm text-white/70 flex gap-4 flex-wrap">
              <span>GPU: ${timing}</span>
              ${this.adapterInfo
                ? html`<span>${this.adapterInfo}</span>`
                : null}
              ${this.status
                ? html`<span class="text-amber-300">${this.status}</span>`
                : null}
            </div>
            <canvas
              id="webgpu-canvas"
              class="w-full max-w-[900px] aspect-square [image-rendering:pixelated] border border-white/15 bg-black"
              aria-label="WebGPU generated map preview"
            ></canvas>

            <div class="flex items-center gap-3 flex-wrap">
              <button
                class="px-3 py-2 border border-white/30 text-sm font-medium disabled:opacity-50"
                ?disabled=${this.cpuRunning}
                @click=${this.runCpuCompare}
              >
                ${this.cpuRunning ? "Running CPU…" : "Compare with CPU engine"}
              </button>
              ${this.cpuMs !== null
                ? html`<span class="text-sm text-white/70">
                    CPU: ${this.cpuMs.toFixed(1)} ms
                  </span>`
                : null}
            </div>
            ${this.cpuMs !== null
              ? html`<canvas
                  id="cpu-canvas"
                  class="w-full max-w-[900px] aspect-square [image-rendering:pixelated] border border-white/15 bg-black"
                  aria-label="CPU engine reference"
                ></canvas>`
              : null}
          </div>

          <aside class="flex flex-col gap-4 text-sm">
            <div class="grid gap-3">
              ${this.numberInput("Seed", "seed", -2147483648, 2147483647, 1)}
              ${this.numberInput("Width", "width", 32, 1024, 4)}
              ${this.numberInput("Height", "height", 32, 1024, 4)}
              ${this.rangeInput("Sea Level", "seaLevel", 0.2, 0.75, 0.01)}
              ${this.rangeInput(
                "Continent Scale",
                "continentScale",
                0.35,
                1.6,
                0.01,
              )}
              ${this.rangeInput("Mountains", "mountainStrength", 0, 1, 0.01)}
              ${this.rangeInput("Coast Falloff", "coastFalloff", 0, 1.4, 0.01)}
              ${this.rangeInput(
                "Coast Roughness",
                "coastRoughness",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Latitude Effect",
                "latitudeEffect",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Elevation Cooling",
                "elevationCooling",
                0,
                0.8,
                0.01,
              )}
              ${this.rangeInput("Rain Noise", "rainNoise", 0, 1, 0.01)}
              ${this.rangeInput(
                "Warmth Rainfall",
                "warmthRainfall",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "River Flow Retention",
                "riverFlowRetention",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Lake Water Threshold",
                "lakeWaterThreshold",
                0.1,
                5,
                0.01,
              )}
              ${this.rangeInput(
                "Lake Elevation Range",
                "lakeElevationRange",
                0,
                0.5,
                0.01,
              )}
              ${this.rangeInput(
                "Weak River Threshold",
                "riverWeakThreshold",
                0,
                1,
                0.01,
              )}
              ${this.rangeInput(
                "Strong River Threshold",
                "riverStrongThreshold",
                0,
                1,
                0.01,
              )}
            </div>

            <div class="border border-white/15 p-3 text-white/75 leading-6">
              <div>
                Every slider re-runs the full pipeline on the GPU — drag them
                and watch the world reshape live.
              </div>
              <div class="mt-2">
                Serial CPU stages (flood fill, priority-flood drainage, flow
                routing) run as iterative ping-pong compute passes, so rivers
                and lakes are close to — but not bit-identical with — the CPU
                engine.
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  private numberInput(
    label: string,
    key: keyof GeneratorConfig,
    min: number,
    max: number,
    step: number,
  ) {
    return html`<label class="grid gap-1">
      <span class="text-white/70">${label}</span>
      <input
        type="number"
        class="bg-black border border-white/20 px-3 py-2 text-white"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(this.config[key])}
        @input=${this.updateNumber(key)}
      />
    </label>`;
  }

  private rangeInput(
    label: string,
    key: keyof GeneratorConfig,
    min: number,
    max: number,
    step: number,
  ) {
    return html`<label class="grid gap-1">
      <span class="text-white/70"
        >${label}: ${Number(this.config[key]).toFixed(2)}</span
      >
      <input
        type="range"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(this.config[key])}
        @input=${this.updateNumber(key)}
      />
    </label>`;
  }
}
