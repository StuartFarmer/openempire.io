import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { CONTROLS, GrowthConfig, validateConfig } from "./config";
import { CityModel as GrowthModel, STEP_SECONDS } from "./model";
import { createScenario, PRESETS, Scenario } from "./presets";
import { drawChart, drawMap, levelColour, Overlay } from "./render";
import { decodeScenario, encodeScenario } from "./scenario";
import {
  Brush,
  cloneTerrain,
  editTerrain,
  makeTerrain,
  Terrain,
  TerrainKind,
} from "./terrain";

const number = (n: number) =>
  n.toLocaleString("en", { maximumFractionDigits: 0 });

@customElement("city-demand-demo")
export class CityDemandDemo extends LitElement {
  @state() scenario: Scenario = createScenario("plain");
  @state() model: GrowthModel | null = null;
  @state() running = false;
  @state() terrainDraft: Terrain | null = null;
  @state() private draftConfig: GrowthConfig = { ...this.scenario.config };
  @state() private overlay: Overlay = "combined";
  @state() private speed = 1;
  @state() private hoverTile: number | null = null;
  @state() private brush: Brush = "raise";
  @state() private brushRadius = 3;
  @state() private brushStrength = 0.08;
  @state() private reliefDraft = 1;
  @state() private seedDraft = this.scenario.seed;
  @state() private error = "";
  private frame: number | null = null;
  private lastFrame = 0;
  private accumulated = 0;
  private painting = false;
  private previousBrushTile: number | null = null;
  createRenderRoot() {
    return this;
  }
  connectedCallback(): void {
    super.connectedCallback();
    if (!this.model) this.restart();
    document.addEventListener("visibilitychange", this.visibilityChanged);
  }
  disconnectedCallback(): void {
    this.stop();
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    super.disconnectedCallback();
  }
  private visibilityChanged = () => {
    if (document.hidden) this.stop();
  };
  private stop(): void {
    this.running = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.accumulated = 0;
    this.lastFrame = 0;
  }
  private togglePlay(): void {
    if (this.running) {
      this.stop();
      return;
    }
    if (!this.model || this.terrainDraft) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.advanceFrame);
  }
  private advanceFrame = (now: number) => {
    if (!this.running) return;
    this.accumulated +=
      Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000)) * this.speed;
    this.lastFrame = now;
    let advanced = false;
    while (this.accumulated >= STEP_SECONDS && this.model) {
      this.model.step();
      this.accumulated -= STEP_SECONDS;
      advanced = true;
    }
    if (advanced) this.requestUpdate();
    // Population may still refill when construction is paused or constrained.
    this.frame = requestAnimationFrame(this.advanceFrame);
  };
  private restart(): void {
    this.stop();
    this.error = "";
    this.hoverTile = null;
    this.model =
      this.scenario.centre === null
        ? null
        : new GrowthModel(
            this.scenario.terrain,
            this.scenario.config,
            this.scenario.seed,
            this.scenario.centre,
          );
    this.requestUpdate();
  }
  private loadScenario(s: Scenario): void {
    this.stop();
    this.scenario = s;
    this.draftConfig = { ...s.config };
    this.terrainDraft = null;
    this.seedDraft = s.seed;
    this.reliefDraft = s.relief;
    this.restart();
  }
  placeCentre(tile: number): void {
    if (this.terrainDraft) return;
    if (this.scenario.terrain.water[tile]) {
      this.error = "Place the centre on dry land.";
      return;
    }
    this.scenario = { ...this.scenario, centre: tile };
    this.restart();
  }
  private applySettings(): void {
    try {
      validateConfig(this.draftConfig);
      this.scenario = { ...this.scenario, config: { ...this.draftConfig } };
      this.restart();
    } catch (error) {
      this.error = String(error instanceof Error ? error.message : error);
    }
  }
  private beginEdit(): void {
    this.stop();
    this.error = "";
    this.terrainDraft = cloneTerrain(this.scenario.terrain);
    this.reliefDraft = this.scenario.relief;
  }
  paintTerrain(tile: number, brush = this.brush): void {
    if (!this.terrainDraft) return;
    editTerrain(
      this.terrainDraft,
      tile,
      brush,
      this.brushRadius,
      this.brushStrength,
    );
    this.requestUpdate();
  }
  private applyTerrain(): void {
    if (!this.terrainDraft) return;
    const centre = this.scenario.centre;
    this.scenario = {
      ...this.scenario,
      terrain: this.terrainDraft,
      relief: this.reliefDraft,
      centre:
        centre !== null && !this.terrainDraft.water[centre] ? centre : null,
    };
    this.terrainDraft = null;
    this.restart();
  }
  private regenerate(): void {
    if (
      !Number.isInteger(this.seedDraft) ||
      this.seedDraft < 0 ||
      this.seedDraft > 4294967295
    ) {
      this.error = "Seed must be an unsigned 32-bit integer.";
      return;
    }
    const s = createScenario(this.scenario.preset, this.seedDraft);
    s.config = { ...this.scenario.config };
    s.relief = this.scenario.relief;
    s.terrain = makeTerrain(s.preset, s.seed, s.relief);
    this.loadScenario(s);
  }
  importText(text: string): void {
    try {
      const next = decodeScenario(text);
      this.loadScenario(next);
    } catch (error) {
      this.error = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  private async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error("Maximum file size is 1 MB.");
      this.importText(await file.text());
    } catch (error) {
      this.error = String(error instanceof Error ? error.message : error);
    }
    input.value = "";
  }
  private exportFile(): void {
    const blob = new Blob([encodeScenario(this.scenario)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demand-growth-${this.scenario.preset}-${this.scenario.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  private tileAt(event: PointerEvent): number | null {
    const canvas = event.currentTarget as HTMLCanvasElement,
      rect = canvas.getBoundingClientRect(),
      w = this.scenario.terrain.width;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * w),
      y = Math.floor(((event.clientY - rect.top) / rect.height) * w);
    return x >= 0 && x < w && y >= 0 && y < w ? y * w + x : null;
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const tile = this.tileAt(event);
    if (tile === null) return;
    if (this.terrainDraft) {
      this.painting = true;
      this.previousBrushTile = tile;
      (event.currentTarget as HTMLCanvasElement).setPointerCapture(
        event.pointerId,
      );
      this.paintTerrain(tile);
    } else this.placeCentre(tile);
  }
  private pointerMove(event: PointerEvent): void {
    const tile = this.tileAt(event);
    this.hoverTile = tile;
    if (this.painting && tile !== null && tile !== this.previousBrushTile) {
      this.paintTerrain(tile);
      this.previousBrushTile = tile;
    }
  }
  protected updated(): void {
    const map = this.querySelector<HTMLCanvasElement>("[data-map]");
    if (map)
      drawMap(
        map,
        this.terrainDraft ?? this.scenario.terrain,
        this.terrainDraft ? null : this.model,
        this.overlay,
        this.hoverTile,
        this.terrainDraft ? this.brushRadius : null,
      );
    const area = this.querySelector<HTMLCanvasElement>("[data-chart-area]"),
      density = this.querySelector<HTMLCanvasElement>("[data-chart-density]");
    if (area) drawChart(area, this.model, "area");
    if (density) drawChart(density, this.model, "density");
    const population = this.querySelector<HTMLCanvasElement>(
      "[data-chart-population]",
    );
    if (population) drawChart(population, this.model, "population");
  }
  private controls(advanced = false) {
    return CONTROLS.filter((c) => !!c.advanced === advanced).map(
      (c) =>
        html` <label class="growth-control"
          ><span
            >${c.label}<output
              >${c.key === "densify"
                ? `${Math.round(this.draftConfig[c.key] * 100)}%`
                : numberOrFraction(this.draftConfig[c.key])}</output
            ></span
          >
          <input
            type="range"
            data-config=${c.key}
            aria-label=${c.label}
            min=${c.min}
            max=${c.max}
            step=${c.step}
            .value=${String(this.draftConfig[c.key])}
            @input=${(e: Event) => {
              this.draftConfig = {
                ...this.draftConfig,
                [c.key]: Number((e.target as HTMLInputElement).value),
              };
            }}
          />
          <small>${c.help}</small></label
        >`,
    );
  }
  private inspector() {
    if (this.hoverTile === null)
      return html`<p class="muted">
        Hover a tile to inspect its terrain and development.
      </p>`;
    const tile = this.hoverTile,
      t = this.terrainDraft ?? this.scenario.terrain,
      info = this.terrainDraft ? null : this.model?.inspect(tile);
    return html`<div class="tile-heading">
        Tile ${tile % t.width}, ${Math.floor(tile / t.width)}
        <span
          >${t.water[tile]
            ? "WATER"
            : info?.capacity
              ? "DEVELOPED"
              : "WILDERNESS"}</span
        >
      </div>
      <dl class="inspector-grid">
        <dt>Elevation</dt>
        <dd>${t.height[tile].toFixed(3)}</dd>
        <dt>Steepness</dt>
        <dd>${t.slope[tile].toFixed(3)}</dd>
        <dt>Water distance</dt>
        <dd>
          ${Number.isFinite(t.waterDistance[tile])
            ? `${t.waterDistance[tile]} tiles`
            : "No water"}
        </dd>
        ${info
          ? html`<dt>Terrain speed factor</dt>
              <dd>${info.suitability.toFixed(2)}×</dd>
              <dt>Uphill step</dt>
              <dd>${info.uphill.toFixed(3)}</dd>
              <dt>Water bonus</dt>
              <dd>+${Math.round(info.waterEffect * 100)}%</dd>
              <dt>Developed neighbours</dt>
              <dd>${info.neighbours}</dd>
              <dt>Centre distance</dt>
              <dd>${info.distance.toFixed(1)} tiles</dd>
              <dt>Selection weight</dt>
              <dd>${info.score.toFixed(3)}</dd>
              <dt>Completed level</dt>
              <dd data-level>${info.level} / 100</dd>
              <dt>Upgrade support · N/S/E/W</dt>
              <dd data-upgrade-support>
                ${info.level === 0
                  ? "Establish at level 1 first"
                  : info.level === 100
                    ? "Maximum level reached"
                    : `${info.supportingNeighbours} / 4 at level ${info.level}+`}
              </dd>
              <dt>Next level progress</dt>
              <dd>${Math.floor(info.progress * 100)}%</dd>
              <dt>Preferred level</dt>
              <dd>${1 + Math.floor(info.targetMaturity * 99 + 1e-8)} / 100</dd>
              <dt>Housing capacity</dt>
              <dd>${number(info.capacity)}</dd>`
          : nothing}
      </dl>`;
  }
  render() {
    const stats = this.model?.stats(),
      preset = PRESETS.find((p) => p.id === this.scenario.preset)!;
    const levels =
      this.model && !this.terrainDraft
        ? [
            ...new Set(
              Array.from(this.model.capacity, (_, tile) =>
                this.model!.level(tile),
              ),
            ),
          ]
            .filter((level) => level > 0)
            .sort((a, b) => a - b)
        : [];
    return html`<div class="demo-shell growth-lab">
      <header class="demo-header">
        <a class="wordmark" href="#">SIMPLEFRONT <span>/ DEMOS</span></a>
        <nav class="demo-navigation" aria-label="Demo navigation">
          <a class="back-link" href="#">← All demos</a>
          <a class="back-link" href="/" aria-label="Back to homepage">← Home</a>
        </nav>
      </header>
      <div class="lab-heading">
        <div>
          <p class="eyebrow">EXPERIMENT 02 / DEMAND-LED DEVELOPMENT</p>
          <h1>Demand-led city <em>lab.</em></h1>
          <p>
            The original growth model. Integer levels. Population demand. No
            city ceiling.
          </p>
        </div>
        <span class="experiment-badge">ISOLATED EXPERIMENT</span>
      </div>
      ${this.error
        ? html`<div class="error-banner" role="alert">${this.error}</div>`
        : nothing}
      <div class="lab-layout">
        <section class="lab-stage">
          <div class="transport-bar">
            <button
              class="primary"
              data-play
              ?disabled=${!this.model || !!this.terrainDraft}
              @click=${this.togglePlay}
            >
              ${this.running ? "Pause" : "Play"}
            </button>
            <button
              data-step
              ?disabled=${this.running || !this.model || !!this.terrainDraft}
              @click=${() => {
                this.model?.step();
                this.requestUpdate();
              }}
            >
              Step
            </button>
            <button
              data-reset
              ?disabled=${!!this.terrainDraft}
              @click=${this.restart}
            >
              Restart
            </button>
            <label class="inline-control"
              >Speed
              <select
                aria-label="Simulation speed"
                .value=${String(this.speed)}
                @change=${(e: Event) => {
                  this.speed = Number((e.target as HTMLSelectElement).value);
                }}
              >
                <option value="1">1×</option>
                <option value="5">5×</option>
                <option value="20">20×</option>
                <option value="60">60×</option>
              </select></label
            >
            <span class="sim-clock" data-clock
              >${(stats?.seconds ?? 0).toFixed(1)}<small>
                sim seconds</small
              ></span
            >
          </div>
          <div class="map-toolbar">
            <label
              >View
              <select
                aria-label="Map view"
                .value=${this.overlay}
                @change=${(e: Event) => {
                  this.overlay = (e.target as HTMLSelectElement)
                    .value as Overlay;
                }}
              >
                <option value="combined">Terrain + settlement</option>
                <option value="elevation">Elevation</option>
                <option value="suitability">Terrain suitability</option>
                <option value="density">Development levels</option>
                <option value="candidates">Growth candidates</option>
              </select></label
            >
            <span
              >${this.terrainDraft
                ? "EDITING TERRAIN"
                : this.running
                  ? "GROWING"
                  : "PAUSED"}
              <i class=${this.running ? "live-dot" : "idle-dot"}></i
            ></span>
          </div>
          <div class="map-frame">
            <canvas
              data-map
              width="1024"
              height="1024"
              aria-label="Urban growth terrain map. Click dry land to place the city centre."
              @pointerdown=${this.pointerDown}
              @pointermove=${this.pointerMove}
              @pointerup=${() => {
                this.painting = false;
                this.previousBrushTile = null;
              }}
              @pointercancel=${() => {
                this.painting = false;
                this.previousBrushTile = null;
              }}
              @pointerleave=${() => {
                this.hoverTile = null;
              }}
            ></canvas>
            <div class="map-caption">
              ${this.terrainDraft
                ? "Paint the terrain draft. Apply to restart the city."
                : "Click dry land to relocate and restart the city."}
            </div>
          </div>
          <div class="map-legend">
            ${this.overlay === "candidates"
              ? html`<span><i style="background:#78c7af"></i>Expand</span
                  ><span><i style="background:#c496d8"></i>Densify</span>`
              : this.overlay === "suitability"
                ? html`<span
                    >Resistant <i class="suitability-ramp"></i> Favourable</span
                  >`
                : this.overlay === "elevation"
                  ? html`<span>Low <i class="elevation-ramp"></i> High</span>`
                  : html`<span>Levels</span>${levels.map(
                        (level) =>
                          html`<span
                            class="level-swatch"
                            data-legend-level=${level}
                            style=${`background: ${levelColour(level)}`}
                            title=${`Level ${level}`}
                            >${level}</span
                          >`,
                      )}`}<span class="legend-note"
              >Numbers: completed levels · outlined cell: centre<br />Dashed
              line: density falloff scale, not a border</span
            >
          </div>
          <div class="growth-status" role="status">
            ${this.terrainDraft
              ? "Terrain edits are a draft; the running scenario is untouched."
              : (this.model?.lastAction ??
                "Choose a dry tile to establish a city.")}
          </div>
          <div class="metric-grid">
            <div>
              <small>FOOTPRINT</small
              ><strong data-area>${stats?.area ?? 0}<span> tiles</span></strong>
            </div>
            <div>
              <small>HOUSING CAPACITY</small
              ><strong data-capacity>${number(stats?.capacity ?? 0)}</strong
              ><small>No city-wide ceiling</small>
            </div>
            <div>
              <small>AVERAGE DENSITY</small
              ><strong data-density
                >${number(stats?.meanDensity ?? 0)}<span> / tile</span></strong
              >
            </div>
          </div>
          <div class="charts">
            <div class="chart">
              <h3>Land occupied</h3>
              <canvas
                data-chart-area
                width="640"
                height="150"
                aria-label="Occupied tiles over simulated time"
              ></canvas
              ><small>Area scaled to this run's maximum</small>
            </div>
            <div class="chart">
              <h3>Growth without more land</h3>
              <canvas
                data-chart-density
                width="640"
                height="150"
                aria-label="Capacity and mean density over simulated time"
              ></canvas
              ><small
                ><span class="teal">Capacity / run maximum</span> ·
                <span class="amber">Mean density / tile maximum</span></small
              >
            </div>
          </div>
          <div class="metric-grid">
            <div>
              <small>POPULATION</small
              ><strong data-population
                >${number(stats?.population ?? 0)}</strong
              >
            </div>
            <div>
              <small>OCCUPANCY</small
              ><strong>${Math.round((stats?.occupancy ?? 0) * 100)}%</strong>
            </div>
            <div>
              <small>VACANT HOUSING</small
              ><strong>${number(stats?.vacancies ?? 0)}</strong>
            </div>
          </div>
          <div class="chart">
            <h3>Population and persistent housing</h3>
            <canvas
              data-chart-population
              width="640"
              height="150"
              aria-label="Population and housing over time"
            ></canvas
            ><small
              ><span class="teal">Population</span> ·
              <span class="amber">Housing</span></small
            >
          </div>
        </section>
        <aside class="lab-controls">
          <section class="control-panel">
            <p class="eyebrow">START WITH A SCENARIO</p>
            <label class="select-label"
              >Terrain preset<select
                data-preset
                ?disabled=${!!this.terrainDraft}
                .value=${this.scenario.preset}
                @change=${(e: Event) =>
                  this.loadScenario(
                    createScenario(
                      (e.target as HTMLSelectElement).value as TerrainKind,
                    ),
                  )}
              >
                ${PRESETS.map(
                  (p) => html`<option value=${p.id}>${p.name}</option>`,
                )}
              </select></label
            >
            <p class="preset-description">${preset.description}</p>
            <div class="seed-row">
              <label
                >Seed<input
                  type="number"
                  aria-label="Terrain seed"
                  min="0"
                  max="4294967295"
                  .value=${String(this.seedDraft)}
                  @input=${(e: Event) => {
                    this.seedDraft = Number(
                      (e.target as HTMLInputElement).value,
                    );
                  }} /></label
              ><button
                ?disabled=${!!this.terrainDraft}
                @click=${this.regenerate}
              >
                Regenerate
              </button>
            </div>
            <div class="button-row">
              <button
                ?disabled=${!!this.terrainDraft}
                @click=${() => {
                  this.seedDraft = crypto.getRandomValues(
                    new Uint32Array(1),
                  )[0];
                  this.regenerate();
                }}
              >
                New seed</button
              ><button
                ?disabled=${!!this.terrainDraft}
                @click=${() =>
                  this.loadScenario(createScenario(this.scenario.preset))}
              >
                Preset defaults</button
              ><button
                data-edit
                ?disabled=${!!this.terrainDraft}
                @click=${this.beginEdit}
              >
                Edit terrain
              </button>
            </div>
            ${this.terrainDraft
              ? html`<div class="terrain-editor">
                  <h3>Terrain draft</h3>
                  <label class="select-label"
                    >Brush<select
                      aria-label="Terrain brush"
                      .value=${this.brush}
                      @change=${(e: Event) => {
                        this.brush = (e.target as HTMLSelectElement)
                          .value as Brush;
                      }}
                    >
                      ${(
                        ["raise", "lower", "smooth", "water", "dry"] as Brush[]
                      ).map((b) => html`<option value=${b}>${b}</option>`)}
                    </select></label
                  >
                  <label class="growth-control"
                    ><span
                      >Brush radius <output>${this.brushRadius}</output></span
                    ><input
                      aria-label="Brush radius"
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      .value=${String(this.brushRadius)}
                      @input=${(e: Event) => {
                        this.brushRadius = Number(
                          (e.target as HTMLInputElement).value,
                        );
                      }}
                  /></label>
                  <label class="growth-control"
                    ><span
                      >Brush strength
                      <output>${this.brushStrength}</output></span
                    ><input
                      aria-label="Brush strength"
                      type="range"
                      min=".01"
                      max=".3"
                      step=".01"
                      .value=${String(this.brushStrength)}
                      @input=${(e: Event) => {
                        this.brushStrength = Number(
                          (e.target as HTMLInputElement).value,
                        );
                      }}
                  /></label>
                  <label class="growth-control"
                    ><span
                      >Preset relief <output>${this.reliefDraft}</output></span
                    ><input
                      aria-label="Terrain relief"
                      type="range"
                      min="0"
                      max="2"
                      step=".1"
                      .value=${String(this.reliefDraft)}
                      @input=${(e: Event) => {
                        this.reliefDraft = Number(
                          (e.target as HTMLInputElement).value,
                        );
                      }}
                    /><small
                      >Rebuild replaces this draft's brush edits.</small
                    ></label
                  >
                  <button
                    @click=${() => {
                      this.terrainDraft = makeTerrain(
                        this.scenario.preset,
                        this.scenario.seed,
                        this.reliefDraft,
                      );
                    }}
                  >
                    Rebuild draft from preset
                  </button>
                  <div class="button-row">
                    <button
                      class="primary"
                      data-apply-terrain
                      @click=${this.applyTerrain}
                    >
                      Apply terrain & restart</button
                    ><button
                      data-cancel-terrain
                      @click=${() => {
                        this.terrainDraft = null;
                        this.reliefDraft = this.scenario.relief;
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>`
              : nothing}
          </section>
          <section class="control-panel">
            <p class="eyebrow">GROWTH SETTINGS</p>
            ${this.controls()}
            <details>
              <summary>Density & terrain influences</summary>
              ${this.controls(true)}
            </details>
            <button
              class="primary full-width"
              data-apply-settings
              ?disabled=${!!this.terrainDraft}
              @click=${this.applySettings}
            >
              Apply settings & restart</button
            ><small class="muted"
              >Changes apply together to a fresh run. Nothing alters the live
              game.</small
            >
          </section>
          <section class="control-panel inspector">
            <p class="eyebrow">TILE INSPECTOR</p>
            ${this.inspector()}
          </section>
          <section class="control-panel">
            <p class="eyebrow">POPULATION & RECOVERY</p>
            <div class="button-row">
              <button
                data-casualties
                ?disabled=${!this.model || !!this.terrainDraft}
                @click=${() => {
                  if (this.model)
                    this.model.changePopulation(
                      -this.model.stats().population * 0.5,
                    );
                  this.requestUpdate();
                }}
              >
                Lose 50% population
              </button>
              <button
                data-empty
                ?disabled=${!this.model || !!this.terrainDraft}
                @click=${() => {
                  this.model?.changePopulation(-1e12);
                  this.requestUpdate();
                }}
              >
                Empty city
              </button>
              <button
                data-arrivals
                ?disabled=${!this.model || !!this.terrainDraft}
                @click=${() => {
                  this.model?.changePopulation(1e12);
                  this.requestUpdate();
                }}
              >
                Fill vacancies
              </button>
            </div>
            <p class="muted">
              People refill existing housing. Losses never erase levels or paid
              maturation progress. Construction resumes above 85% occupancy.
            </p>
          </section>
          <section class="control-panel">
            <p class="eyebrow">KEEP AN EXPERIMENT</p>
            <div class="button-row">
              <button
                ?disabled=${!!this.terrainDraft}
                @click=${this.exportFile}
              >
                Export scenario</button
              ><label class="file-button"
                >Import JSON<input
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import scenario JSON"
                  @change=${this.importFile}
              /></label>
            </div>
            <p class="muted">
              Saves terrain, settings, seed and centre. Import starts paused
              from the beginning; it is not a timeline save.
            </p>
          </section>
        </aside>
      </div>
      <details class="model-notes">
        <summary>What this experiment models</summary>
        <p>
          This is a copy of experiment 01's terrain, scoring, neighbourhood
          targets and interleaved development, with linear housing.
          Establishment completes level 1; each completed maturation adds one
          level up to 100. Maturity = (level − 1)/99. Housing = level × housing
          per level (default 100). Work can accumulate on multiple existing
          cells while a rural tile is being established. A tile's maturation
          follows its own slow–fast–slow curve toward its local preferred level.
          A level-L tile can mature only when all four cardinal neighbours are
          already level L or higher. Diagonals do not count; water, wilderness
          and missing map-edge neighbours block maturation. If no tiles qualify,
          development expands instead, even at 100% maturation preference. One
          simulation step can complete at most one level: wilderness must become
          level 1 before later steps can mature it. Unused step allowance cannot
          skip levels. Housing changes only when a level is paid for.
        </p>
        <p>
          Settlement colours identify discrete levels, not rural/suburban/urban
          bands. Numbers show each cell's completed level; the outlined cell is
          the centre. Terrain influences shape and speed. Water is a proximity
          bonus, not a watershed or flood simulation. No food, workers, combat,
          ownership or new city centres are simulated. The arbitrary city
          ceiling, its slowdown are removed. The original maturation ramp
          remains as a nonbinding housing reference, not a cap. The slider sets
          its starting preference; a ramp reference of zero uses the percentage
          directly. The old reach setting is now a density-falloff scale, not a
          hard border; neighbourhood density targets still apply. Population
          creates demand above 85% occupancy and refills with a bounded
          sigmoid-shaped rate. The maturation S-curve is per tile, not a forced
          curve or ceiling for the whole city's population. Vacancies and paid
          progress persist after casualties. Charts retain the latest 40
          simulated minutes. Game rules and experiment 01 are unchanged.
        </p>
      </details>
      <footer class="lab-footer">
        SimpleFront / development experiments <a href="#">← All demos</a>
      </footer>
    </div>`;
  }
}

function numberOrFraction(value: number) {
  return Number.isInteger(value)
    ? number(value)
    : String(Number(value.toFixed(2)));
}
