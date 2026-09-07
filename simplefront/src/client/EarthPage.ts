/**
 * EarthPage.ts — the #earth workbench: inspect, tune, edit and approve the
 * real-world map before baking it.
 *
 * It runs the SAME buildMap() the CLI baker runs (BuildLayers.ts), so what you
 * approve here is what gets baked — no second implementation to drift.
 *
 * Flow:
 *   1. npm run earth:data fetch          # sources
 *   2. ingest.py                         # sources -> raw float32 fields
 *   3. #earth                            # <- you are here: tune + approve
 *   4. bake.ts --tuning tuning.json      # bake the approved tuning
 *   5. npm run gen-maps
 *
 * Previews render at half resolution for interactivity (a full-res rebuild with
 * blurs is ~1 s; half-res is ~100 ms, which is fast enough to drag a slider).
 * The exported tuning is resolution-independent, and the bake is always full-res.
 */
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { LayerName } from "../core/game/MapLayers";
import { BuiltMap, buildMap } from "../games/alternative/earth/BuildLayers";
import { Field, RawFields } from "../games/alternative/earth/Normalize";
import { Tuning, defaultTuning } from "../games/alternative/earth/Tuning";

interface FieldsMeta {
  name?: string;
  width: number;
  height: number;
  bbox?: [number, number, number, number];
  kmPerTile?: [number, number];
  fields: {
    name: string;
    unit: string;
    description: string;
    min: number;
    max: number;
    p1: number;
    p50: number;
    p99: number;
    nonzero: number;
  }[];
}

const PLANES: LayerName[] = [
  "crop",
  "metal",
  "oil",
  "temperature",
  "humidity",
  "water",
];

/**
 * Per-layer colour ramps. Deliberately NOT a single rainbow: each layer reads as
 * the thing it is (crop green, oil black-brown, water blue), so a wrong-looking
 * map is obvious at a glance rather than requiring you to read the legend.
 */
const RAMPS: Record<LayerName, [number, number, number][]> = {
  crop: [
    [30, 20, 10],
    [90, 70, 30],
    [80, 140, 50],
    [140, 220, 90],
  ],
  metal: [
    [15, 15, 20],
    [70, 70, 85],
    [150, 150, 170],
    [240, 235, 220],
  ],
  oil: [
    [20, 15, 10],
    [70, 45, 20],
    [140, 100, 40],
    [230, 190, 90],
  ],
  temperature: [
    [40, 60, 160],
    [90, 170, 200],
    [230, 200, 90],
    [200, 60, 40],
  ],
  humidity: [
    [110, 80, 40],
    [180, 160, 90],
    [80, 170, 150],
    [40, 90, 190],
  ],
  water: [
    [30, 30, 40],
    [40, 90, 130],
    [70, 160, 210],
    [160, 230, 250],
  ],
};

function ramp(name: LayerName, t: number): [number, number, number] {
  const stops = RAMPS[name];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function downsample(f: Field, factor: number): Field {
  if (factor <= 1) return f;
  const w = Math.floor(f.width / factor);
  const h = Math.floor(f.height / factor);
  const data = new Float32Array(w * h);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          s += f.data[(y * factor + dy) * f.width + (x * factor + dx)];
        }
      }
      data[y * w + x] = s / n;
    }
  }
  return { width: w, height: h, data };
}

@customElement("earth-page")
export class EarthPage extends LitElement {
  // Light DOM: reuse the app's Tailwind, same as the other pages.
  createRenderRoot() {
    return this;
  }

  @state() private status = "idle";
  @state() private error: string | null = null;
  @state() private tuning: Tuning = defaultTuning();
  @state() private built: BuiltMap | null = null;
  @state() private meta: FieldsMeta | null = null;
  // NB: not `focus` — that collides with HTMLElement.focus().
  @state() private focusLayer: LayerName | "terrain" = "terrain";
  @state() private hover: string = "";
  @state() private previewScale = 2;
  @state() private datasets: string[] = [];
  // NB: not `dataset` — that collides with HTMLElement.dataset.
  @state() private datasetName = "global-2048x1024";

  private full: RawFields = {};
  private scaled: RawFields = {};
  private rebuildTimer: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (Object.keys(this.full).length === 0) void this.load();
  }

  // ─────────────────────────── data ───────────────────────────

  private async load() {
    this.status = "loading raw fields…";
    this.error = null;
    try {
      const list = await fetch("/earth-data/index.json");
      if (list.ok) {
        this.datasets = (await list.json()) as string[];
        if (this.datasets.length && !this.datasets.includes(this.datasetName)) {
          this.datasetName = this.datasets[0];
        }
      }

      const metaRes = await fetch(
        `/earth-data/${this.datasetName}/fields.json`,
      );
      if (!metaRes.ok) throw new Error(await metaRes.text());
      const meta = (await metaRes.json()) as FieldsMeta;

      const binRes = await fetch(`/earth-data/${this.datasetName}/fields.bin`);
      if (!binRes.ok) throw new Error(await binRes.text());
      const buf = await binRes.arrayBuffer();

      const planeSize = meta.width * meta.height;
      const all = new Float32Array(buf);
      if (all.length !== planeSize * meta.fields.length) {
        throw new Error(
          `fields.bin has ${all.length} floats, expected ` +
            `${planeSize * meta.fields.length} — re-run ingest.py`,
        );
      }
      const fields: RawFields = {};
      meta.fields.forEach((f, i) => {
        fields[f.name] = {
          width: meta.width,
          height: meta.height,
          data: all.subarray(i * planeSize, (i + 1) * planeSize),
        };
      });
      this.full = fields;
      this.meta = meta;
      this.rescale();
      this.rebuild();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.status = "failed";
    }
  }

  private rescale() {
    this.scaled = {};
    for (const [k, v] of Object.entries(this.full)) {
      this.scaled[k] = downsample(v, this.previewScale);
    }
  }

  /** Debounced so dragging a slider doesn't queue a rebuild per pixel. */
  private schedule() {
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.rebuild(), 60);
  }

  private rebuild() {
    if (Object.keys(this.scaled).length === 0) return;
    const t0 = performance.now();
    this.status = "building…";
    try {
      this.built = buildMap(this.scaled, this.tuning);
      this.status = `built in ${Math.round(performance.now() - t0)} ms`;
      this.requestUpdate();
      requestAnimationFrame(() => this.paintAll());
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.status = "build failed";
    }
  }

  // ─────────────────────────── painting ───────────────────────────

  private paintAll() {
    if (!this.built) return;
    this.paintTerrain();
    for (const p of PLANES) this.paintPlane(p);
    this.paintFocus();
  }

  private canvas(id: string): HTMLCanvasElement | null {
    return this.querySelector<HTMLCanvasElement>(`#${id}`);
  }

  private paintTerrain(target?: HTMLCanvasElement) {
    const b = this.built;
    const c = target ?? this.canvas("thumb-terrain");
    if (!b || !c) return;
    c.width = b.width;
    c.height = b.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(b.width, b.height);
    // The bake encoding is blue-channel-only, which is unreadable to a human.
    // Render it the way the game will: sea shaded by depth, land by magnitude.
    for (let i = 0; i < b.width * b.height; i++) {
      const o = i * 4;
      const alpha = b.terrain[o + 3];
      const blue = b.terrain[o + 2];
      if (alpha < 20) {
        img.data[o] = 20;
        img.data[o + 1] = 45;
        img.data[o + 2] = 90;
      } else if (blue === 0) {
        img.data[o] = 0;
        img.data[o + 1] = 0;
        img.data[o + 2] = 0; // impassable ice
      } else {
        const mag = (blue - 140) / 2 / 30;
        const [r, g, bl] = ramp("crop", 0.25 + mag * 0.75);
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = bl;
      }
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  private paintPlane(name: LayerName, target?: HTMLCanvasElement) {
    const b = this.built;
    const c = target ?? this.canvas(`thumb-${name}`);
    if (!b || !c) return;
    c.width = b.width;
    c.height = b.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(b.width, b.height);
    const plane = b.planes[name];
    const land = b.land.data;
    for (let i = 0; i < plane.length; i++) {
      const o = i * 4;
      if (land[i] <= 0) {
        // Ocean is drawn flat and dark: the planes carry values there, but they
        // are meaningless — the sim only reads layers on land.
        img.data[o] = 14;
        img.data[o + 1] = 20;
        img.data[o + 2] = 30;
      } else {
        const [r, g, bl] = ramp(name, plane[i] / 255);
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = bl;
      }
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  private paintFocus() {
    const c = this.canvas("focus");
    if (!c) return;
    if (this.focusLayer === "terrain") this.paintTerrain(c);
    else this.paintPlane(this.focusLayer, c);
  }

  // ─────────────────────────── interaction ───────────────────────────

  private onHover(e: MouseEvent) {
    const b = this.built;
    const c = this.canvas("focus");
    if (!b || !c || !this.meta) return;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * b.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * b.height);
    if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
    const i = y * b.width + x;

    const lon = (x / b.width) * 360 - 180;
    const lat = 90 - (y / b.height) * 180;
    const land = b.land.data[i] > 0;

    const planeVals = PLANES.map((p) => `${p} ${b.planes[p][i]}`).join("  ");
    const raw = ["elevation", "temperature", "precip", "basin_fill", "mining"]
      .filter((k) => this.scaled[k])
      .map((k) => `${k} ${this.scaled[k].data[i].toFixed(1)}`)
      .join("  ");

    this.hover =
      `${lat.toFixed(1)}°, ${lon.toFixed(1)}°  ${land ? "LAND" : "sea"}\n` +
      `bytes: ${planeVals}\nraw:   ${raw}`;
  }

  private patch(fn: (t: Tuning) => void) {
    const next = structuredClone(this.tuning);
    fn(next);
    this.tuning = next;
    this.schedule();
  }

  private exportTuning() {
    const blob = new Blob([JSON.stringify(this.tuning, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "earth-tuning.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ─────────────────────────── controls ───────────────────────────

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (v: number) => void,
    hint?: string,
  ) {
    return html`
      <label class="block mb-2" title=${hint ?? ""}>
        <div class="flex justify-between text-xs text-gray-300">
          <span>${label}</span>
          <span class="font-mono text-gray-400">${value.toFixed(2)}</span>
        </div>
        <input
          type="range"
          class="w-full accent-emerald-500"
          min=${min}
          max=${max}
          step=${step}
          .value=${String(value)}
          @input=${(e: Event) =>
            set(Number((e.target as HTMLInputElement).value))}
        />
      </label>
    `;
  }

  private transformControls(
    label: string,
    get: (t: Tuning) => {
      curve: string;
      gamma: number;
      blurSigma: number;
      range: {
        kind: string;
        min?: number;
        max?: number;
        lo?: number;
        hi?: number;
      };
    },
    key: keyof Tuning | string,
  ) {
    const t = get(this.tuning);
    return html`
      <div class="border border-gray-700 rounded p-2 mb-2">
        <div class="text-xs font-semibold text-emerald-400 mb-1">${label}</div>
        <label class="block text-xs text-gray-300 mb-1">
          curve
          <select
            class="ml-1 bg-gray-800 border border-gray-600 rounded text-xs"
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              this.patch((n) => {
                (get(n) as { curve: string }).curve = v;
              });
            }}
          >
            ${["linear", "sqrt", "log1p"].map(
              (c) =>
                html`<option value=${c} ?selected=${t.curve === c}>
                  ${c}
                </option>`,
            )}
          </select>
        </label>
        ${this.slider("gamma", t.gamma, 0.2, 3, 0.05, (v) =>
          this.patch((n) => {
            (get(n) as { gamma: number }).gamma = v;
          }),
        )}
        ${this.slider("blur σ (tiles)", t.blurSigma, 0, 10, 0.5, (v) =>
          this.patch((n) => {
            (get(n) as { blurSigma: number }).blurSigma = v;
          }),
        )}
        ${t.range.kind === "absolute"
          ? html`
              ${this.slider(
                "clamp min",
                t.range.min ?? 0,
                -50,
                100,
                1,
                (v) =>
                  this.patch((n) => {
                    (get(n).range as { min: number }).min = v;
                  }),
                "physical units",
              )}
              ${this.slider(
                "clamp max",
                t.range.max ?? 1,
                1,
                5000,
                1,
                (v) =>
                  this.patch((n) => {
                    (get(n).range as { max: number }).max = v;
                  }),
                "physical units",
              )}
            `
          : html`
              ${this.slider("percentile lo", t.range.lo ?? 0, 0, 50, 1, (v) =>
                this.patch((n) => {
                  (get(n).range as { lo: number }).lo = v;
                }),
              )}
              ${this.slider(
                "percentile hi",
                t.range.hi ?? 100,
                50,
                100,
                1,
                (v) =>
                  this.patch((n) => {
                    (get(n).range as { hi: number }).hi = v;
                  }),
              )}
            `}
        <div class="text-[10px] text-gray-500">${key as string}</div>
      </div>
    `;
  }

  // ─────────────────────────── render ───────────────────────────

  render() {
    if (this.error) {
      return html`
        <div class="p-8 text-gray-200 font-mono text-sm">
          <h1 class="text-xl text-red-400 mb-3">#earth — cannot load</h1>
          <pre class="bg-gray-900 p-3 rounded whitespace-pre-wrap">
${this.error}</pre
          >
          <p class="mt-4 text-gray-400">
            The page needs ingested fields. Run, from the repo root:
          </p>
          <pre class="bg-gray-900 p-3 rounded mt-2">
npm run earth:data fetch
map-generator/earth/.venv/bin/python map-generator/earth/ingest.py</pre
          >
        </div>
      `;
    }

    const b = this.built;
    const stats = b?.stats;
    const total = b ? b.width * b.height : 0;

    return html`
      <div class="w-full h-full flex bg-gray-950 text-gray-200 overflow-hidden">
        <!-- controls -->
        <aside
          class="w-80 shrink-0 h-full overflow-y-auto p-3 border-r border-gray-800"
        >
          <h1 class="text-lg font-bold mb-1">Earth map</h1>
          <div class="text-xs text-gray-400 mb-3">${this.status}</div>

          <div class="flex gap-2 mb-3">
            <button
              class="px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 rounded"
              @click=${() => this.exportTuning()}
            >
              Export tuning
            </button>
            <button
              class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
              @click=${() => {
                this.tuning = defaultTuning();
                this.schedule();
              }}
            >
              Reset
            </button>
          </div>

          <label class="block text-xs text-gray-300 mb-2">
            dataset
            <select
              class="ml-1 bg-gray-800 border border-gray-600 rounded text-xs"
              @change=${(e: Event) => {
                this.datasetName = (e.target as HTMLSelectElement).value;
                this.full = {};
                this.scaled = {};
                void this.load();
              }}
            >
              ${this.datasets.map(
                (d) =>
                  html`<option value=${d} ?selected=${this.datasetName === d}>
                    ${d}
                  </option>`,
              )}
            </select>
          </label>
          ${this.meta?.kmPerTile
            ? html`<div class="text-[10px] text-gray-500 mb-2">
                ~${this.meta.kmPerTile[0]} x ${this.meta.kmPerTile[1]} km/tile
              </div>`
            : ""}

          <label class="block text-xs text-gray-300 mb-3">
            preview scale
            <select
              class="ml-1 bg-gray-800 border border-gray-600 rounded text-xs"
              @change=${(e: Event) => {
                this.previewScale = Number(
                  (e.target as HTMLSelectElement).value,
                );
                this.rescale();
                this.rebuild();
              }}
            >
              <option value="4" ?selected=${this.previewScale === 4}>
                512×256 (fastest)
              </option>
              <option value="2" ?selected=${this.previewScale === 2}>
                1024×512
              </option>
              <option value="1" ?selected=${this.previewScale === 1}>
                2048×1024 (slow)
              </option>
            </select>
          </label>

          <details open>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Terrain
            </summary>
            ${this.slider(
              "max elevation (m)",
              this.tuning.terrain.maxElevationM,
              1000,
              8000,
              100,
              (v) => this.patch((n) => (n.terrain.maxElevationM = v)),
              "Elevation mapped to in-game magnitude 30",
            )}
            ${this.slider(
              "elevation gamma",
              this.tuning.terrain.elevationGamma,
              0.2,
              2,
              0.05,
              (v) => this.patch((n) => (n.terrain.elevationGamma = v)),
              "<1 lifts the midlands; Earth's land is overwhelmingly low",
            )}
            <label class="flex items-center gap-2 text-xs mb-2">
              <input
                type="checkbox"
                .checked=${this.tuning.terrain.iceAsImpassable}
                @change=${(e: Event) =>
                  this.patch(
                    (n) =>
                      (n.terrain.iceAsImpassable = (
                        e.target as HTMLInputElement
                      ).checked),
                  )}
              />
              ice = impassable void
            </label>
          </details>

          <details>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Crop
            </summary>
            ${this.slider(
              "weight NPP",
              this.tuning.crop.weightNpp,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.crop.weightNpp = v)),
            )}
            ${this.slider(
              "weight precip",
              this.tuning.crop.weightPrecip,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.crop.weightPrecip = v)),
            )}
            ${this.slider(
              "weight temp",
              this.tuning.crop.weightTemperature,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.crop.weightTemperature = v)),
            )}
            ${this.transformControls(
              "crop output",
              (t) => t.crop.transform,
              "crop.transform",
            )}
          </details>

          <details>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Metal
            </summary>
            ${this.slider(
              "weight mining (satellite)",
              this.tuning.metal.weightMining,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.metal.weightMining = v)),
              "Maus observed mining footprint — the unbiased backbone",
            )}
            ${this.slider(
              "weight Cu tracts",
              this.tuning.metal.weightCuDensity,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.metal.weightCuDensity = v)),
            )}
            ${this.slider(
              "weight deposit points",
              this.tuning.metal.weightPoints,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.metal.weightPoints = v)),
            )}
            ${this.transformControls(
              "mining",
              (t) => t.metal.miningTransform,
              "metal.miningTransform",
            )}
          </details>

          <details>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Oil
            </summary>
            ${this.slider(
              "assessment-unit bonus",
              this.tuning.oil.assessmentUnitBonus,
              0,
              3,
              0.1,
              (v) => this.patch((n) => (n.oil.assessmentUnitBonus = v)),
            )}
            ${this.slider(
              "known-field bonus",
              this.tuning.oil.fieldBonus,
              0,
              3,
              0.1,
              (v) => this.patch((n) => (n.oil.fieldBonus = v)),
            )}
            ${this.transformControls(
              "basin fill",
              (t) => t.oil.transform,
              "oil.transform",
            )}
          </details>

          <details>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Water
            </summary>
            ${this.slider(
              "min discharge (m³/s)",
              this.tuning.water.minDischargeCms,
              0,
              500,
              10,
              (v) => this.patch((n) => (n.water.minDischargeCms = v)),
              "Below this a river is too small to matter at 20 km/tile",
            )}
            ${this.slider(
              "decay λ (tiles)",
              this.tuning.water.decayLambda,
              0.5,
              15,
              0.5,
              (v) => this.patch((n) => (n.water.decayLambda = v)),
            )}
            ${this.slider(
              "coast weight",
              this.tuning.water.coastWeight,
              0,
              1,
              0.05,
              (v) => this.patch((n) => (n.water.coastWeight = v)),
              "You cannot irrigate with seawater — keep below freshwater",
            )}
          </details>

          <details>
            <summary class="text-sm font-semibold cursor-pointer mb-1">
              Temperature / Humidity
            </summary>
            ${this.transformControls(
              "temperature",
              (t) => t.temperature,
              "temperature",
            )}
            ${this.transformControls("humidity", (t) => t.humidity, "humidity")}
          </details>
        </aside>

        <!-- viewport -->
        <main class="flex-1 h-full overflow-y-auto p-3">
          <div class="flex gap-2 mb-2 flex-wrap">
            ${(["terrain", ...PLANES] as const).map(
              (p) => html`
                <button
                  class="px-2 py-1 text-xs rounded ${this.focusLayer === p
                    ? "bg-emerald-700"
                    : "bg-gray-800 hover:bg-gray-700"}"
                  @click=${() => {
                    this.focusLayer = p as LayerName | "terrain";
                    requestAnimationFrame(() => this.paintFocus());
                  }}
                >
                  ${p}
                </button>
              `,
            )}
          </div>

          <canvas
            id="focus"
            class="w-full border border-gray-800 rounded"
            style="image-rendering: pixelated;"
            @mousemove=${(e: MouseEvent) => this.onHover(e)}
          ></canvas>
          <pre
            class="text-[11px] text-gray-400 font-mono mt-1 h-12 whitespace-pre-wrap"
          >
${this.hover}</pre
          >

          <div class="grid grid-cols-3 gap-2 mt-2">
            ${PLANES.map(
              (p) => html`
                <div>
                  <div class="flex justify-between text-xs text-gray-300">
                    <span>${p}</span>
                    <span class="font-mono text-gray-500">
                      μ ${stats ? stats.meanOnLand[p].toFixed(0) : "—"}
                    </span>
                  </div>
                  <canvas
                    id="thumb-${p}"
                    class="w-full border border-gray-800 rounded cursor-pointer"
                    style="image-rendering: pixelated;"
                    @click=${() => {
                      this.focusLayer = p;
                      requestAnimationFrame(() => this.paintFocus());
                    }}
                  ></canvas>
                </div>
              `,
            )}
          </div>

          ${stats
            ? html`
                <div class="text-xs text-gray-400 mt-3 font-mono">
                  land ${stats.landTiles.toLocaleString()}
                  (${((100 * stats.landTiles) / total).toFixed(1)}%) · water
                  ${stats.waterTiles.toLocaleString()} · impassable
                  ${stats.impassableTiles.toLocaleString()}
                  <br />
                  A mean near 0 means the layer is dead; near 255 means it is
                  saturated and carries no information.
                </div>
              `
            : ""}

          <canvas id="thumb-terrain" class="hidden"></canvas>
        </main>
      </div>
    `;
  }
}
