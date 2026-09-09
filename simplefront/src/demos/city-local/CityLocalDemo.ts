import { html, LitElement, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { MapCamera, mapPoint, zoomCamera } from "./camera";
import {
  CONTROLS,
  fertilityAtLevel,
  GrowthConfig,
  validateConfig,
} from "./config";
import {
  CityModel as GrowthModel,
  Owner,
  PlayerID,
  STEP_SECONDS,
} from "./model";
import { createModel, createScenario, PRESETS, Scenario } from "./presets";
import { drawChart, drawMap, levelColour, Overlay } from "./render";
import { decodeScenario, encodeScenario } from "./scenario";
import {
  AGE_STYLES,
  ageLabel,
  AgeStyle,
  DEFAULT_AGE_LEVELS,
  validateAgeLevels,
} from "./street-ages";
import { DEFAULT_STREETS, StreetLayout, StreetSettings } from "./streets";
import "./streets.css";
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

@customElement("city-local-demo")
export class CityLocalDemo extends LitElement {
  @state() scenario: Scenario = createScenario("plain");
  @state() model: GrowthModel | null = null;
  @state() running = false;
  @state() private player: PlayerID = 1;
  @state() private mapTool = "inspect";
  @state() private actionX = 32;
  @state() private actionY = 32;
  @state() terrainDraft: Terrain | null = null;
  @state() private draftConfig: GrowthConfig = { ...this.scenario.config };
  @state() private overlay: Overlay = "streets";
  @state() private camera: MapCamera = { x: 32, y: 32, zoom: 1 };
  @state() private showLevels = false;
  @state() private ageLevels: readonly number[] = DEFAULT_AGE_LEVELS;
  @state() private ageStyles: readonly AgeStyle[] = AGE_STYLES;
  @state() private ageDraft = DEFAULT_AGE_LEVELS.map(String);
  @state() private ageError = "";
  @state() private streetSettings: StreetSettings = { ...DEFAULT_STREETS };
  private streets: StreetLayout | null = null;
  private pan: {
    x: number;
    y: number;
    camera: MapCamera;
    moved: boolean;
  } | null = null;
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
      this.streets?.sync();
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
    this.model = createModel(this.scenario);
    this.player = 1;
    this.mapTool = "inspect";
    this.streets = this.model
      ? new StreetLayout(this.model, this.scenario.seed, this.streetSettings)
      : null;
    this.camera = {
      x: this.scenario.terrain.width / 2,
      y: this.scenario.terrain.width / 2,
      zoom: 1,
    };
    this.pan = null;
    this.requestUpdate();
  }
  private zoomTo(zoom: number): void {
    const w = this.scenario.terrain.width;
    const anchor =
      this.camera.zoom === 1 && this.model
        ? {
            x: (this.model.centre % w) + 0.5,
            y: Math.floor(this.model.centre / w) + 0.5,
            zoom: 1,
          }
        : this.camera;
    this.camera = zoomCamera(anchor, zoom, w);
  }
  private fitCity(): void {
    if (!this.model) return;
    const w = this.scenario.terrain.width;
    const tiles = [...this.model.capacity.keys()].filter((i) =>
      this.model!.level(i),
    );
    const xs = tiles.map((i) => i % w),
      ys = tiles.map((i) => Math.floor(i / w));
    const left = Math.min(...xs),
      right = Math.max(...xs) + 1;
    const top = Math.min(...ys),
      bottom = Math.max(...ys) + 1;
    this.camera = zoomCamera(
      { x: (left + right) / 2, y: (top + bottom) / 2, zoom: 1 },
      w / Math.max(right - left + 4, bottom - top + 4),
      w,
    );
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
  captureTile(tile: number, owner: Owner): void {
    if (!this.model || this.terrainDraft) return;
    try {
      this.model.setOwner(tile, owner);
      this.error = "";
      this.requestUpdate();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  private applyMapAction(tile: number): void {
    this.hoverTile = tile;
    this.actionX = tile % this.scenario.terrain.width;
    this.actionY = Math.floor(tile / this.scenario.terrain.width);
    try {
      if (this.mapTool === "restart") this.placeCentre(tile);
      else if (this.mapTool === "claim") this.captureTile(tile, this.player);
      else if (this.mapTool === "neutral") this.captureTile(tile, 0);
      else if (this.mapTool === "found") {
        if (!this.model) throw new Error("Start a new run on dry land first.");
        this.model.found(tile, this.player);
        this.streets?.sync();
        this.error = "";
      }
    } catch (error) {
      this.error = (error as Error).message;
    }
    this.requestUpdate();
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
    s.layout = this.scenario.layout;
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
    link.download = `local-growth-${this.scenario.preset}-${this.scenario.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  private tileAt(event: PointerEvent): number | null {
    const canvas = event.currentTarget as HTMLCanvasElement,
      rect = canvas.getBoundingClientRect(),
      w = this.scenario.terrain.width;
    const point = mapPoint(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      this.camera,
      w,
    );
    const x = Math.floor(point.x),
      y = Math.floor(point.y);
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
    } else if (this.camera.zoom > 1) {
      this.pan = {
        x: event.clientX,
        y: event.clientY,
        camera: { ...this.camera },
        moved: false,
      };
      (event.currentTarget as HTMLCanvasElement).setPointerCapture(
        event.pointerId,
      );
    } else this.applyMapAction(tile);
  }
  private pointerMove(event: PointerEvent): void {
    if (this.pan) {
      const dx = event.clientX - this.pan.x,
        dy = event.clientY - this.pan.y;
      if (Math.hypot(dx, dy) > 4) this.pan.moved = true;
      if (this.pan.moved) {
        const rect = (
          event.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        const w = this.scenario.terrain.width;
        this.camera = zoomCamera(
          {
            ...this.pan.camera,
            x:
              this.pan.camera.x -
              ((dx / rect.width) * w) / this.pan.camera.zoom,
            y:
              this.pan.camera.y -
              ((dy / rect.height) * w) / this.pan.camera.zoom,
          },
          this.pan.camera.zoom,
          w,
        );
        this.hoverTile = null;
        return;
      }
    }
    const tile = this.tileAt(event);
    this.hoverTile = tile;
    if (this.painting && tile !== null && tile !== this.previousBrushTile) {
      this.paintTerrain(tile);
      this.previousBrushTile = tile;
    }
  }
  private pointerUp(event: PointerEvent): void {
    if (this.pan && !this.pan.moved) {
      const tile = this.tileAt(event);
      if (tile !== null) this.applyMapAction(tile);
    }
    this.pan = null;
    this.painting = false;
    this.previousBrushTile = null;
  }
  protected updated(): void {
    this.streets?.sync();
    const map = this.querySelector<HTMLCanvasElement>("[data-map]");
    if (map)
      drawMap(
        map,
        this.terrainDraft ?? this.scenario.terrain,
        this.terrainDraft ? null : this.model,
        this.overlay,
        this.hoverTile,
        this.terrainDraft ? this.brushRadius : null,
        {
          camera: this.camera,
          streets: this.terrainDraft ? null : this.streets,
          showLevels: this.showLevels,
          ageLevels: this.ageLevels,
          ageStyles: this.ageStyles,
        },
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
  private paletteControl(
    index: number,
    key: number | "road" | "ground",
    label: string,
  ) {
    const age = this.ageStyles[index];
    return html`<label class="palette-control"
      >${label}<input
        type="color"
        data-age-colour
        aria-label=${`${age.name} ${label.toLowerCase()} colour`}
        .value=${typeof key === "number" ? age.houses[key] : age[key]}
        @input=${(event: Event) => {
          const colour = (event.target as HTMLInputElement).value;
          if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
          this.ageStyles = this.ageStyles.map((style, i) =>
            i !== index
              ? style
              : {
                  ...style,
                  ...(typeof key === "number"
                    ? {
                        houses: style.houses.map((value, slot) =>
                          slot === key ? colour : value,
                        ),
                      }
                    : { [key]: colour }),
                },
          );
        }}
    /></label>`;
  }
  private controls(advanced = false, fertility = false) {
    return CONTROLS.filter(
      (c) => !!c.advanced === advanced && !!c.fertility === fertility,
    ).map(
      (c) =>
        html` <label class="growth-control"
          ><span
            >${c.label}<output
              >${c.key === "densify" || c.key === "targetOccupancy"
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
  private fertilityPreview() {
    const c = this.draftConfig;
    if (c.lowerLevel >= c.upperLevel)
      return html`<p class="muted" data-gradient-error>
        Upper development level must exceed lower development level.
      </p>`;
    const maxLevel = Math.min(
      100,
      c.upperLevel + Math.max(2, Math.round(c.upperLevel * 0.2)),
    );
    const maxBirths = Math.max(1, c.lowerLevelBirths, c.upperLevelBirths);
    const points = Array.from({ length: maxLevel }, (_, i) => {
      const level = i + 1,
        births = fertilityAtLevel(level, c);
      return {
        level,
        births,
        x: 30 + ((level - 1) / (maxLevel - 1)) * 280,
        y: 130 - (births / maxBirths) * 100,
      };
    });
    return html`<svg
        data-fertility-preview
        viewBox="0 0 340 165"
        style="width:100%;height:auto"
        role="img"
        aria-label="Draft fertility gradient by integer tile level"
      >
        <path d="M30 20 V130 H310" fill="none" stroke="#66817e" />
        <polyline
          points=${points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#bdd6ac"
          stroke-width="2"
        />
        ${points.map(
          (p) =>
            svg`<circle data-fertility-level=${p.level} data-births=${p.births} cx=${p.x} cy=${p.y} r="2.5" fill="#f0ba7d"><title>Level ${p.level}: ${p.births.toFixed(2)} births per woman equivalent</title></circle>`,
        )}
        <g fill="#9bada9" font-size="11">
          <text x="5" y="33">${maxBirths}</text>
          <text x="12" y="134">0</text>
          <text x="30" y="153">Level 1</text>
          <text x="310" y="153" text-anchor="end">Level ${maxLevel}</text>
        </g>
      </svg>
      <p class="muted" data-gradient-summary>
        Level ${c.lowerLevel} and below: ${c.lowerLevelBirths.toFixed(1)} →
        level ${c.upperLevel} and above: ${c.upperLevelBirths.toFixed(1)}.
        Linear between endpoints; wilderness has no residents or births. Preview
        updates immediately; Apply settings & restart updates the simulation.
      </p>`;
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
              <dt>Owner / housing beneficiary</dt>
              <dd data-tile-owner>
                ${this.model?.owner(tile) === 1
                  ? "A · Blue"
                  : this.model?.owner(tile) === 2
                    ? "B · Orange"
                    : "Unclaimed"}
              </dd>
              <dt>Selection weight</dt>
              <dd>${info.score.toFixed(3)}</dd>
              <dt>Completed level</dt>
              <dd data-level>${info.level} / 100</dd>
              <dt>Visual age</dt>
              <dd data-tile-age>${ageLabel(info.level, this.ageLevels)}</dd>
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
              <dt>Local upgrade rule</dt>
              <dd>Four equal-or-higher neighbours · any owner · maximum 100</dd>
              <dt>Housing capacity</dt>
              <dd>${number(info.capacity)}</dd>
              <dt>Residents · uniform occupancy</dt>
              <dd>${number(info.residents)}</dd>
              <dt>Development index</dt>
              <dd data-tile-development>
                ${info.level
                  ? `${Math.round(info.developmentIndex * 100)}%`
                  : "—"}
              </dd>
              <dt>Births per woman · equivalent</dt>
              <dd data-tile-fertility>
                ${info.level ? info.fertility.toFixed(2) : "—"}
              </dd>`
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
          <p class="eyebrow">EXPERIMENT 04 / LOCAL GROWTH & OWNERSHIP</p>
          <h1>Local development <em>lab.</em></h1>
          <p>
            A copy of Demo 3 with no governing centre. Neighbourhoods grow
            locally; capture changes ownership, not buildings or paid work.
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
                this.streets?.sync();
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
          <section class="control-panel ownership-controls">
            <p class="eyebrow">
              OWNERSHIP LAB · INSTANT EDITOR ACTIONS, NOT COMBAT
            </p>
            <div class="button-row">
              <label
                >Inspect / control player
                <select
                  data-player
                  aria-label="Active player"
                  .value=${String(this.player)}
                  @change=${(e: Event) => {
                    this.player = Number(
                      (e.target as HTMLSelectElement).value,
                    ) as PlayerID;
                    if (this.model) this.model.activePlayer = this.player;
                  }}
                >
                  <option value="1">A · Blue</option>
                  <option value="2">B · Orange</option>
                </select>
              </label>
              <label
                >Map tool
                <select
                  data-map-tool
                  aria-label="Map action"
                  .value=${this.mapTool}
                  @change=${(e: Event) =>
                    (this.mapTool = (e.target as HTMLSelectElement).value)}
                >
                  <option value="inspect">Inspect / pan</option>
                  <option value="claim">Capture / claim tile</option>
                  <option value="neutral">Make tile unclaimed</option>
                  <option value="found">Found level-one neighbourhood</option>
                  <option value="restart">New run here (resets)</option>
                </select>
              </label>
            </div>
            <div class="button-row tile-action-row">
              <label
                >X<input
                  data-tile-x
                  aria-label="Target tile X"
                  type="number"
                  min="0"
                  max="63"
                  .value=${String(this.actionX)}
                  @input=${(e: Event) =>
                    (this.actionX = Number(
                      (e.target as HTMLInputElement).value,
                    ))}
              /></label>
              <label
                >Y<input
                  data-tile-y
                  aria-label="Target tile Y"
                  type="number"
                  min="0"
                  max="63"
                  .value=${String(this.actionY)}
                  @input=${(e: Event) =>
                    (this.actionY = Number(
                      (e.target as HTMLInputElement).value,
                    ))}
              /></label>
              <button
                data-apply-tile
                ?disabled=${!!this.terrainDraft}
                @click=${() => {
                  if (
                    ![this.actionX, this.actionY].every(
                      (v) => Number.isInteger(v) && v >= 0 && v < 64,
                    )
                  ) {
                    this.error =
                      "Tile coordinates must be whole numbers from 0 to 63.";
                    return;
                  }
                  this.applyMapAction(this.actionY * 64 + this.actionX);
                }}
              >
                Apply to tile
              </button>
            </div>
            <p class="muted">
              Click one tile to use the tool; drag when zoomed to pan. Founding
              is a free lab setup tool on owned wilderness, not a food purchase.
              Only the first founding for each new player supplies its opening
              population: 80% of starting housing. Both players simulate
              together; the selected player's metrics and population controls
              appear below.
            </p>
            <div class="button-row">
              ${([1, 2] as const).map(
                (player) =>
                  html`<p data-player-summary=${player}>
                    <strong>${player === 1 ? "A · Blue" : "B · Orange"}</strong>
                    ${number(this.model?.stats(player).population ?? 0)} people
                    / ${number(this.model?.stats(player).capacity ?? 0)} housing
                  </p>`,
              )}
            </div>
          </section>
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
                <option value="streets">Streets & buildings</option>
                <option value="combined">Terrain + settlement</option>
                <option value="elevation">Elevation</option>
                <option value="suitability">Terrain suitability</option>
                <option value="density">Development levels</option>
                <option value="candidates">Growth candidates</option>
                <option value="ownership">Territory ownership</option>
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
          <div class="street-toolbar" aria-label="Map camera controls">
            <button
              data-zoom-out
              aria-label="Zoom out"
              ?disabled=${this.camera.zoom <= 1}
              @click=${() => this.zoomTo(this.camera.zoom / 2)}
            >
              −
            </button>
            <output data-zoom-value
              >${Number(this.camera.zoom.toFixed(1))}×</output
            >
            <button
              data-zoom-in
              aria-label="Zoom in"
              ?disabled=${this.camera.zoom >= 12}
              @click=${() => this.zoomTo(this.camera.zoom * 2)}
            >
              +
            </button>
            <button
              data-fit-city
              ?disabled=${!this.model}
              @click=${this.fitCity}
            >
              Fit city
            </button>
            <button data-zoom-reset @click=${() => this.zoomTo(1)}>
              Whole map
            </button>
            ${this.overlay === "streets"
              ? html`<label
                  ><input
                    type="checkbox"
                    aria-label="Show level numbers"
                    .checked=${this.showLevels}
                    @change=${(e: Event) => {
                      this.showLevels = (e.target as HTMLInputElement).checked;
                    }}
                  />
                  Levels</label
                >`
              : nothing}
          </div>
          <div class="map-frame">
            <canvas
              data-map
              width="1024"
              height="1024"
              aria-label="Local development map. Choose a map tool, then click a tile. Coordinate inputs provide keyboard access."
              @pointerdown=${this.pointerDown}
              @pointermove=${this.pointerMove}
              @pointerup=${this.pointerUp}
              @pointercancel=${() => {
                this.pan = null;
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
                : this.camera.zoom > 1
                  ? "Drag to pan · click to use selected tool · hover to inspect"
                  : "Zoom in or Fit city for streets · choose a tool to capture or found a tile"}
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
              >${this.overlay === "streets"
                ? "Streets & buildings are visual only · Levels toggles numbers"
                : "Numbers: completed levels"}
              · outline: historical origin only · blue/orange lines: territory
              borders · support crosses borders</span
            >
          </div>
          ${this.overlay === "streets"
            ? html`<div class="age-legend" aria-label="Visual age palettes">
                ${this.ageStyles.map(
                  (age, index) =>
                    html`<div data-age-style=${this.ageLevels[index]}>
                      <div class="age-palette">
                        ${age.houses.map(
                          (colour, slot) =>
                            html`<i
                              style=${`background:linear-gradient(90deg,${colour},${this.ageStyles[Math.min(index + 1, this.ageStyles.length - 1)].houses[slot]})`}
                            ></i>`,
                        )}
                      </div>
                      <strong>${age.name}</strong
                      ><small
                        >Levels
                        ${this.ageLevels[index]}${index ===
                        AGE_STYLES.length - 1
                          ? "+"
                          : `–${this.ageLevels[index + 1]} →`}
                        · ${age.period}</small
                      >
                      <div class="palette-controls">
                        ${age.houses.map((_, slot) =>
                          this.paletteControl(
                            index,
                            slot,
                            `Building ${slot + 1}`,
                          ),
                        )}
                        ${this.paletteControl(index, "road", "Road")}
                        ${this.paletteControl(index, "ground", "Ground")}
                      </div>
                    </div>`,
                )}
                <p>
                  Colours blend toward the next age across each range; Village
                  holds below its first anchor. Dates are style labels, not a
                  game clock. Edit colours to repaint existing tiles
                  immediately, even while paused. Palettes are kept for this
                  page session only.
                </p>
                <button
                  data-reset-palettes
                  @click=${() => {
                    this.ageStyles = AGE_STYLES;
                  }}
                >
                  Reset palettes
                </button>
              </div>`
            : nothing}
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
              ><strong data-occupancy
                >${stats && stats.capacity === 0
                  ? "No housing"
                  : `${Math.round((stats?.occupancy ?? 0) * 100)}%`}</strong
              >
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
          <div class="metric-grid">
            <div>
              <small>DEVELOPMENT INDEX</small
              ><strong data-development-index
                >${Math.round((stats?.developmentIndex ?? 0) * 100)}%</strong
              ><small>Resident-weighted</small>
            </div>
            <div>
              <small>FERTILITY EQUIVALENT</small
              ><strong data-mean-fertility
                >${(stats?.meanFertility ?? 0).toFixed(2)}</strong
              ><small>Births per woman · game proxy</small>
            </div>
            <div>
              <small>POPULATION GAIN / S</small
              ><strong data-population-rate
                >${(stats?.populationPerSecond ?? 0).toFixed(1)}</strong
              ><small>Including baseline recovery</small>
            </div>
          </div>
          <div class="metric-grid">
            <div>
              <small>HOUSING PRESSURE</small
              ><strong data-housing-pressure
                >${Math.round((stats?.housingPressure ?? 0) * 100)}%</strong
              ><small>Demand above target occupancy</small>
            </div>
            <div>
              <small>DESIRED HOUSING</small
              ><strong data-desired-housing
                >${number(stats?.desiredHousing ?? 0)}</strong
              ><small>Population / target occupancy</small>
            </div>
            <div>
              <small>SHARED WORK / S</small
              ><strong data-development-rate
                >${(stats?.developmentPerSecond ?? 0).toFixed(1)}</strong
              ><small>Before terrain and completion limits</small>
            </div>
          </div>
        </section>
        <aside class="lab-controls">
          <section class="control-panel">
            <p class="eyebrow">START WITH A SCENARIO</p>
            <label class="select-label"
              >Ownership arrangement
              <select
                data-layout
                aria-label="Ownership arrangement"
                .value=${this.scenario.layout}
                ?disabled=${!!this.terrainDraft}
                @change=${(e: Event) =>
                  this.loadScenario({
                    ...this.scenario,
                    layout: (e.target as HTMLSelectElement)
                      .value as Scenario["layout"],
                  })}
              >
                <option value="solo">One neighbourhood · all land A</option>
                <option value="border">Two players · shared border</option>
                <option value="districts">Two districts · one A budget</option>
              </select>
            </label>
            <label class="select-label"
              >Terrain preset<select
                data-preset
                ?disabled=${!!this.terrainDraft}
                .value=${this.scenario.preset}
                @change=${(e: Event) =>
                  this.loadScenario({
                    ...createScenario(
                      (e.target as HTMLSelectElement).value as TerrainKind,
                    ),
                    layout: this.scenario.layout,
                  })}
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
            <h3>Development & fertility gradient</h3>
            ${this.controls(false, true)} ${this.fertilityPreview()}
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
          <section class="control-panel">
            <p class="eyebrow">AGE RANGES · VISUAL ONLY</p>
            <p class="muted">
              Set the tile level at which each age reaches its full palette.
              Colours blend between these levels as tiles mature—not as years
              pass. Valid changes recolour the city immediately, with no
              restart.
            </p>
            ${AGE_STYLES.map(
              (age, index) => html`
                <label class="growth-control age-control">
                  <span>${age.name}</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    data-age-boundary=${index}
                    aria-label=${`${age.name} full-colour level`}
                    aria-describedby="age-range-help"
                    .value=${this.ageDraft[index]}
                    @input=${(event: Event) => {
                      this.ageDraft = this.ageDraft.map((value, i) =>
                        i === index
                          ? (event.target as HTMLInputElement).value
                          : value,
                      );
                      const levels = this.ageDraft.map(Number);
                      this.ageError = validateAgeLevels(levels);
                      if (!this.ageError) this.ageLevels = levels;
                    }}
                  />
                </label>
              `,
            )}
            <p id="age-range-help" class="muted">
              Use increasing whole numbers, 1–100. Village holds below the first
              level; the final palette holds above the last. Invalid edits leave
              the last valid colours in place.
            </p>
            ${this.ageError
              ? html`<p data-age-error role="alert">${this.ageError}</p>`
              : nothing}
            <button
              data-age-defaults
              @click=${() => {
                this.ageLevels = DEFAULT_AGE_LEVELS;
                this.ageDraft = DEFAULT_AGE_LEVELS.map(String);
                this.ageError = "";
              }}
            >
              Restore default ages
            </button>
            <p class="muted">
              Age ranges stay in place when restarting or changing presets. They
              are not saved in scenario exports or after leaving this demo.
            </p>
          </section>
          <section class="control-panel">
            <p class="eyebrow">STREETS & BUILDINGS · VISUAL ONLY</p>
            <p class="muted">
              Each cell is a simple 4×4 sprite. Connected road pixels spread
              with the city; building pixels fill in as levels rise. Roads and
              building positions persist after population loss.
            </p>
            ${[
              {
                key: "branching" as const,
                label: "Extra street connections",
                help: "More connections close loops between nearby branches; fewer leave larger, quieter blocks.",
              },
              {
                key: "straightness" as const,
                label: "Street straightness",
                help: "Higher values align streets into a clearer grid; lower values make gates and junctions irregular. Gentler terrain is preferred.",
              },
            ].map(
              (c) =>
                html`<label class="growth-control"
                  ><span
                    >${c.label}<output
                      >${Math.round(this.streetSettings[c.key] * 100)}%</output
                    ></span
                  ><input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    data-street-setting=${c.key}
                    aria-label=${c.label}
                    .value=${String(this.streetSettings[c.key])}
                    @input=${(e: Event) => {
                      this.streetSettings = {
                        ...this.streetSettings,
                        [c.key]: Number((e.target as HTMLInputElement).value),
                      };
                    }}
                  /><small>${c.help}</small></label
                >`,
            )}
            <button
              data-restyle
              ?disabled=${!this.model || !!this.terrainDraft}
              @click=${() => {
                this.streets = this.model
                  ? new StreetLayout(
                      this.model,
                      this.scenario.seed,
                      this.streetSettings,
                    )
                  : null;
                this.requestUpdate();
              }}
            >
              Redraw streets only
            </button>
            <p class="muted">
              Redraw applies these visual settings to the current city. No
              simulation restart or rule changes.
              <span data-street-count>${this.streets?.tiles.size ?? 0}</span>
              neighbourhoods illustrated. Visual settings are not included in
              scenario exports.
            </p>
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
              maturation progress. Construction rises smoothly above the chosen
              occupancy target. A small recovery allowance repopulates empty
              housing; it is separate from births.
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
              Saves initial terrain, settings, seed, origin and ownership
              arrangement. Import restarts that setup, paused. Live captures,
              added neighbourhoods and current population/work are not a
              timeline save.
            </p>
          </section>
        </aside>
      </div>
      <details class="model-notes">
        <summary>What this experiment models</summary>
        <p>
          A copy of Demo 3 with local growth and two independently accounted
          players. The initial tile is only a historical marker. No
          origin-distance bonus, density falloff ring or centre-dependent
          housing remains.
        </p>
        <p>
          Wilderness first becomes level 1. Each completed maturation adds
          exactly one level, up to 100, and requires four cardinal neighbours at
          the current level or higher. Their ownership does not matter. Water,
          wilderness and missing map-edge neighbours do not provide support.
          Terrain and nearby buildings influence selection and speed; terrain
          does not impose another permanent level ceiling.
        </p>
        <p>
          Only owned tiles develop. Housing = level × housing per level (default
          100) and is credited once to the current owner. Capture preserves
          levels, roads, buildings and unfinished work, but transfers no
          population. Overcapacity survivors remain; recruitment pauses until
          there is space. Unclaimed development persists without supplying
          anyone housing.
        </p>
        <p>
          Each player has one population-based work budget and at most one
          completion per quarter-second step, regardless of the number of seeds
          or disconnected districts. Per-tile slow–fast–slow maturation and the
          maturation preference/ramp are retained. Captured unfinished
          establishment work is resumed one site at a time in its original start
          order.
        </p>
        <p>
          Population gain/s = population speed × (population × housing-weighted
          fertility / 3 + 10 recovery) × clamp(1 − occupancy, 0, 1), or zero
          with no housing. Development pressure = clamp((occupancy − target
          occupancy) / (1 − target occupancy), 0, 1). With surviving people but
          no housing, development pressure is full. Work/s = development setting
          × (0.25 + 0.75 × sqrt(population / 100)) × pressure, before terrain.
          More seeds do not grant additional recovery allowances.
        </p>
        <p>
          Selection uses terrain suitability, developed neighbours, stable
          seeded irregularity and the tile's own maturity. No historical-centre
          coordinate participates. Fertility interpolates between your
          level/birth endpoints. Visual ages change colours only; roads connect
          across ownership boundaries. Statistics and charts follow the selected
          player; both players advance.
        </p>
        <p>
          Capture, claiming and founding are instant lab editor tools, not a
          combat or food economy. Only a new player's first founding seeds its
          initial 80%-occupied housing; later founding does not add people.
          Capturing housing starts with the player's existing population,
          including zero. Game code and experiments 01–03 are unchanged. Restart
          discards live editor actions; exports preserve the initial setup, not
          a running timeline.
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
