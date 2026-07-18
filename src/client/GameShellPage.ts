import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameMapType } from "../core/game/Game";
import type { MapData } from "../core/game/GameMapLoader";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import { empire } from "./lab/systems/empire/system";
import { grazing } from "./lab/systems/grazing/system";
import { settlement } from "./lab/systems/settlement/system";
import {
  composeTerrain,
  terrain as terrainSystem,
} from "./lab/systems/terrain/system";
import { CameraRenderer } from "./shell/CameraRenderer";
import {
  buildViewBitmap,
  SHELL_VIEWS,
  type ShellView,
} from "./shell/MapLayerViews";
import { loadMapInputs, type MapInputBundle } from "./webgpu/MapInputs";
import {
  buildWorldgenParams,
  type WebGpuViewMode,
  type WorldgenRuntimeParams,
  type WorldgenSeasonalParams,
} from "./webgpu/WebGpuWorldEngine";
import { FieldViewerBase } from "./viewer/FieldViewerBase";

/** User-tuned shell defaults (2026-07-17): override the manifest's
 * generation-time climate values for the derived view. River thresholds now
 * cut the SHIPPED water plane (graded alpha rendering) — 1.0/1.0 turns
 * rivers off entirely. */
const SHELL_CLIMATE_DEFAULTS = {
  latitudeEffect: 1.01,
  elevationCooling: 0.37,
  rainNoise: 0.64,
  warmthRainfall: 0.55,
  riverWeakThreshold: 0.5,
  riverStrongThreshold: 0.82,
} as const;

// #shell — the unified field viewer (unify-field-viewer): a fullscreen camera
// over the map. A system picker selects any FieldDynamics system — the terrain
// derivation (climate → drainage → biome → colors from the map's primary
// fields, with live climate knobs + seasons + a rich hover readout) or any sim
// system (world, settlement, empire, grazing, territory), ticked at the game
// clock with brushes and generic param/scalar panels. The shared machinery
// (headless kernel on the camera's device, tick loop, turbo, brushes) lives in
// FieldViewerBase; this page adds the camera, the terrain derivation on the
// base kernel, and the terrain-specific panels. Baked terrain-colors.png (via
// MapLayerViews) is the fallback when the derivation is unavailable.

/** Ticks per in-world year — drives the terrain seasonal clock. */
const YEAR_TICKS = 520;

type ShellViewKey = ShellView;
const VIEW_KEYS: readonly ShellViewKey[] = SHELL_VIEWS;

/** Shell views served by the terrain derivation kernel. */
const DERIVED_VIEWS: Partial<Record<ShellViewKey, WebGpuViewMode>> = {
  terrain: "terrain",
  temperature: "temperature",
};

/** 0 °C in the temperature plane's linear −30..35 °C encoding — the freezing
 * point, where snow fully covers. */
const FREEZING_NORM = 30 / 65;

/** Name the classifier's (temperature, humidity) band — matches
 * humidity_biome.wesl so the readout says what's drawn. */
function biomeName(t: number, h: number, ice: boolean): string {
  if (ice) return "ice";
  if (t < 0.2) return h < 0.28 ? "cold desert" : "tundra";
  if (t < 0.38) {
    if (h < 0.25) return "cold steppe";
    return h < 0.58 ? "boreal forest" : "taiga wetland";
  }
  if (t < 0.64) {
    if (h < 0.2) return "desert";
    return h < 0.5 ? "grassland" : "temperate forest";
  }
  if (h < 0.18) return "desert";
  if (h < 0.46) return "savanna";
  return h < 0.72 ? "tropical forest" : "rainforest";
}

/** Name an ocean tile by depth + temperature — the two things the ocean
 * colorizer shades from (depth ramp + warm-shallow / cold tints). */
function oceanBiome(depth: number, t: number, iceThreshold: number): string {
  if (iceThreshold > 0 && t < iceThreshold) return "sea ice";
  const band =
    depth < 0.12
      ? "coastal shelf"
      : depth < 0.35
        ? "shallow sea"
        : depth < 0.65
          ? "open ocean"
          : "deep ocean";
  const qualifier = t < 0.32 ? "polar " : t > 0.62 ? "tropical " : "";
  return qualifier + band;
}

/** The climate/color knobs that re-derive live (recolor tier). */
const CLIMATE_KNOBS: {
  key: keyof FoundationWorldEngineMapConfig;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "latitudeEffect", min: 0, max: 1.5, step: 0.01 },
  { key: "elevationCooling", min: 0, max: 1, step: 0.01 },
  { key: "rainNoise", min: 0, max: 1, step: 0.01 },
  { key: "warmthRainfall", min: 0, max: 1, step: 0.01 },
  { key: "riverWeakThreshold", min: 0, max: 1, step: 0.01 },
  { key: "riverStrongThreshold", min: 0, max: 1, step: 0.01 },
];

@customElement("game-shell-page")
export class GameShellPage extends FieldViewerBase {
  // Terrain-mode view (the derived-color modes + baked layer bitmaps), separate
  // from the base `view` (a sim system's declared views).
  @state() private shellView: ShellViewKey = "terrain";
  /** True when a GAME view (the ruleset's overlay) is shown instead of a
   * terrain view. The game still ticks in the background either way. */
  @state() private showingGame = false;
  @state() private weekReadout = 0;
  @state() private derivedOk = false;
  /** Sticky fallback notice — unlike status, applyView never clears it. */
  @state() private derivedNote = "";
  @state() private derivedConfig: FoundationWorldEngineMapConfig | null = null;
  @state() private showKnobs = false;
  @state() private tilt = 23.4;
  @state() private seasonStrength = 0.7;
  @state() private iceThreshold = FREEZING_NORM;
  @state() private useClimateBase = true;
  @state() private snowBand = 0.075;
  @state() private biomeBlend = 0.05;

  /** CPU copies of the derived source fields, for the hover readout. */
  private hoverFields: {
    elevation: Float32Array;
    waterMask: Uint32Array;
    tempBase: Float32Array;
    humidityBase: Float32Array;
    lakeBase: Float32Array;
    riverBase: Float32Array;
    seasonAmp: Float32Array | null;
    seasonPhase: Float32Array | null;
  } | null = null;
  private seasonActive = false;
  private tickCount = 0;
  private recolorBusy = false;
  private recolorDirty = false;
  private deriveBusy = false;
  private viewCache = new Map<ShellViewKey, ImageBitmap>();

  connectedCallback(): void {
    // Terrain is the always-on base; the picker lists GAMES composed onto it
    // (plus "terrain" alone). The default is terrain on the big Earth map.
    this.systems = [
      terrainSystem,
      composeTerrain(grazing),
      composeTerrain(settlement),
      composeTerrain(empire),
    ];
    this.systemId = terrainSystem.id;
    this.mapKey = "EarthXL";
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.clearViewCache();
    super.disconnectedCallback();
  }

  private clearViewCache(): void {
    for (const bitmap of this.viewCache.values()) bitmap.close();
    this.viewCache.clear();
  }

  private isTerrain(): boolean {
    return this.systemId === terrainSystem.id;
  }

  protected canvasId(): string {
    return "shell-canvas";
  }

  async firstUpdated(): Promise<void> {
    // Outrank the page footer/header stacking contexts — fullscreen surface.
    this.style.zIndex = "9999";
    if (!CameraRenderer.isSupported()) {
      this.status = "WebGPU is not supported in this browser.";
      return;
    }
    await this.loadWorld();
  }

  // --- mount ------------------------------------------------------------------

  /** After a system mounts, terrain ALWAYS derives (the base); a game's layers
   * were already init'd by the base. Show a terrain view by default, then fit. */
  protected async onSystemMounted(mapData: MapData): Promise<void> {
    this.clearViewCache();
    this.tickCount = 0;
    await this.deriveTerrain(mapData);
    // Default to a terrain view; the game overlay is opt-in via the picker.
    if (!VIEW_KEYS.includes(this.shellView)) this.shellView = "terrain";
    this.showingGame = false;
    await this.applyTerrainView(this.shellView);
    this.pendingFit = true;
  }

  /**
   * Runtime terrain derivation on the base kernel: decode every input through
   * the declared loader, upload them, and run the full derivation. Non-fatal —
   * a failure falls back to the baked terrain-colors bitmap with a note.
   */
  private async deriveTerrain(mapData: MapData): Promise<void> {
    this.derivedOk = false;
    this.derivedNote = "";
    this.derivedConfig = null;
    this.hoverFields = null;
    this.seasonActive = false;
    if (!this.kernel || !this.compiled) return;
    try {
      const manifest = await mapData.manifest();
      if (
        !mapData.elevationBin ||
        !mapData.layersBin ||
        !mapData.hydroBin ||
        !manifest.world_engine
      ) {
        this.derivedNote = "no elevation sidecar — baked terrain";
        return;
      }
      this.status = "Deriving terrain…";
      this.derivedConfig = {
        ...normalizeFoundationWorldEngineMapConfig(manifest.world_engine),
        width: this.mapWidth,
        height: this.mapHeight,
        ...SHELL_CLIMATE_DEFAULTS,
      };
      const hasSeason = Boolean(manifest.season && mapData.seasonBin);
      const bundle: MapInputBundle = {
        width: this.mapWidth,
        height: this.mapHeight,
        sidecars: {
          elevation: await mapData.elevationBin(),
          layers: await mapData.layersBin(),
          hydro: await mapData.hydroBin(),
          season:
            hasSeason && mapData.seasonBin
              ? await mapData.seasonBin()
              : undefined,
          map: await mapData.mapBin(),
        },
        config: this.derivedConfig,
      };
      const fields = loadMapInputs(terrainSystem.derive!, bundle).fields;
      this.seasonActive = hasSeason;
      this.hoverFields = {
        elevation: fields.elevation as Float32Array,
        waterMask: fields.waterMask as Uint32Array,
        tempBase: fields.tempBase as Float32Array,
        humidityBase: fields.humidityBase as Float32Array,
        lakeBase: fields.lakeBase as Float32Array,
        riverBase: fields.riverBase as Float32Array,
        seasonAmp: (fields.seasonAmp as Float32Array) ?? null,
        seasonPhase: (fields.seasonPhase as Float32Array) ?? null,
      };
      for (const [name, data] of Object.entries(fields)) {
        this.kernel.writeBuffer(name, data);
      }
      this.writeTP(this.currentViewMode());
      this.kernel.clearBuffer("G");
      this.kernel.clearBuffer("hist");
      const frame = this.kernel.beginFrame();
      this.compiled.runDerive(frame);
      await frame.finish();
      this.derivedOk = true;
      this.status = "";
    } catch (error) {
      this.status = "";
      this.derivedNote = `derivation failed (${(error as Error).message}) — baked terrain`;
    }
  }

  // --- terrain derivation tiers (on the base kernel) --------------------------

  /** Write the terrain worldgen Params to the terrain uniform "TP" (a composed
   * game keeps "P" for its own params). */
  private writeTP(viewMode: WebGpuViewMode): void {
    if (!this.kernel || !this.derivedConfig) return;
    this.kernel.writeUniform(
      "TP",
      buildWorldgenParams(
        this.derivedConfig,
        viewMode,
        this.seasonal(),
        this.runtime(),
      ),
    );
  }

  /** Whether a game ruleset is loaded (the composed system has layers). */
  private hasGame(): boolean {
    return (this.compiled?.layerNames.length ?? 0) > 0;
  }

  private currentViewMode(): WebGpuViewMode {
    return DERIVED_VIEWS[this.shellView] ?? "terrain";
  }

  private seasonal(): WorldgenSeasonalParams {
    return {
      tilt: this.tilt,
      yearPhase: (this.tickCount % YEAR_TICKS) / YEAR_TICKS,
      seasonStrength: this.seasonStrength,
    };
  }

  private runtime(): WorldgenRuntimeParams {
    return {
      iceThreshold: this.iceThreshold,
      useClimateBase: this.useClimateBase,
      snowBand: this.snowBand,
      biomeBlend: this.biomeBlend,
      useSeasonField: this.seasonActive,
    };
  }

  /** Run a partial derivation tier over the settled buffers. */
  private async runTier(tier: "recolor" | "season" | "repaint"): Promise<void> {
    if (!this.kernel || !this.compiled || !this.derivedConfig) return;
    this.writeTP(this.currentViewMode());
    if (tier === "recolor") {
      this.kernel.clearBuffer("G");
      this.kernel.clearBuffer("hist");
    }
    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame, tier);
    await frame.finish();
  }

  /** Recolor tier, single-flight: a slider mid-drag can fire faster than the
   * GPU frame returns; collapse the backlog into one trailing rerun. */
  private queueRecolor(): void {
    if (!this.derivedOk || !this.derivedConfig) return;
    if (this.recolorBusy) {
      this.recolorDirty = true;
      return;
    }
    this.recolorBusy = true;
    this.runTier("recolor")
      .catch((error: unknown) => {
        this.status = (error as Error).message;
      })
      .finally(() => {
        this.recolorBusy = false;
        if (this.recolorDirty) {
          this.recolorDirty = false;
          this.queueRecolor();
        }
      });
  }

  private setKnob(key: keyof FoundationWorldEngineMapConfig, value: number) {
    if (!this.derivedConfig) return;
    this.derivedConfig = { ...this.derivedConfig, [key]: value };
    this.queueRecolor();
  }

  // --- per-frame advance ------------------------------------------------------

  /**
   * One combined frame per step: the terrain season sweep (climate → biome →
   * color, on TP) AND the game's layer tick (on P), then — if a GAME view is
   * shown — the game's colorizer over the terrain color. Terrain is always the
   * base; a game reads the fresh terrain fields. Runs on the shared kernel, so
   * it's a single frame (no concurrency), gated by the base's inFlight.
   */
  protected advance(ticks: number): void {
    if (ticks <= 0 || !this.kernel || !this.compiled || this.recolorBusy) return;
    this.tickCount += ticks;
    const week = Math.floor(((this.tickCount % YEAR_TICKS) / YEAR_TICKS) * 52);
    if (week !== this.weekReadout) this.weekReadout = week;

    this.inFlight = true;
    this.writeTP(this.showingGame ? "terrain" : this.currentViewMode());
    if (this.hasGame()) {
      this.kernel.writeUniform(
        "P",
        this.compiled.writeParams(this.paramValues, this.seed),
      );
    }
    const frame = this.kernel.beginFrame();
    // Terrain climate + biome + color (writes the terrain image to outView).
    if (this.derivedOk) this.compiled.runDerive(frame, "season");
    // Game rules tick, reading the fresh terrain fields.
    if (this.hasGame()) {
      for (let t = 0; t < ticks; t += 1) this.compiled.runTick(this.kernel, frame);
    }
    // A game view overwrites the terrain color; a terrain view keeps it.
    if (this.showingGame) this.compiled.runView(frame, this.view);
    frame
      .finish()
      .catch((error: unknown) => {
        this.status = (error as Error).message;
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  // --- views ------------------------------------------------------------------

  /** Terrain view: derived color mode (repaint) or a baked layer bitmap. */
  private async applyTerrainView(view: ShellViewKey): Promise<void> {
    this.shellView = view;
    this.showingGame = false;
    if (!this.renderer) return;
    const derivedMode = this.derivedOk ? DERIVED_VIEWS[view] : undefined;
    if (derivedMode && this.kernel?.outView && this.derivedConfig) {
      this.renderer.setLiveTexture(
        this.kernel.outView,
        this.mapWidth,
        this.mapHeight,
      );
      try {
        await this.runTier("repaint");
        this.status = "";
      } catch (error) {
        this.status = (error as Error).message;
      }
      return;
    }
    // Baked bitmap fallback (non-derived layer views, or derivation failed).
    this.status = `Loading ${view}…`;
    try {
      let bitmap = this.viewCache.get(view);
      if (!bitmap) {
        bitmap = await buildViewBitmap(
          view,
          this.mapData(),
          this.mapWidth,
          this.mapHeight,
        );
        this.viewCache.set(view, bitmap);
      }
      await this.renderer.setMap(bitmap);
      this.status = "";
    } catch (error) {
      this.status = (error as Error).message;
    }
  }

  /** Game view: show the ruleset's colorizer over the terrain (its overlay
   * wins the shared out texture while it's selected). */
  private async applyGameView(view: string): Promise<void> {
    this.view = view;
    this.showingGame = true;
    if (!this.renderer || !this.kernel?.outView || !this.compiled) return;
    this.renderer.setLiveTexture(
      this.kernel.outView,
      this.mapWidth,
      this.mapHeight,
    );
    // Render one game view frame so the overlay shows immediately (paused too).
    const frame = this.kernel.beginFrame();
    this.compiled.runView(frame, view);
    await frame.finish();
    this.status = "";
  }

  private cycleView(step: number): void {
    // Cycle through terrain views then the game's views, as one ring.
    const gameViews = this.hasGame() ? (this.compiled?.viewNames ?? []) : [];
    const ring: { game: boolean; name: string }[] = [
      ...VIEW_KEYS.map((name) => ({ game: false, name })),
      ...gameViews.map((name) => ({ game: true, name })),
    ];
    const current = this.showingGame ? this.view : this.shellView;
    const index = ring.findIndex(
      (e) => e.game === this.showingGame && e.name === current,
    );
    const next = ring[(index + step + ring.length) % ring.length];
    if (next.game) void this.applyGameView(next.name);
    else void this.applyTerrainView(next.name as ShellViewKey);
  }

  // --- input ------------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.classList.contains("hidden")) return;
    // The system's own key bindings win first.
    if (this.onKeyGesture(event)) return;
    if (event.key === "n" || event.key === "N") {
      this.cycleView(event.shiftKey ? -1 : 1);
    }
  };

  // --- hover readout (terrain) — overrides the base's generic rows ------------

  protected hoverRows(hx: number, hy: number): [string, string][] {
    const tile = { x: hx, y: hy };
    const f = this.hoverFields;
    // Sim systems (or no derivation) fall back to the base's generic readout.
    if (!f || !this.isTerrain() || !this.derivedOk) return super.hoverRows(hx, hy);
    const i = tile.y * this.mapWidth + tile.x;
    const lon = ((tile.x + 0.5) / this.mapWidth) * 360 - 180;
    const lat = 90 - ((tile.y + 0.5) / this.mapHeight) * 180;
    const seaLevel = this.derivedConfig?.seaLevel ?? 0.46;

    const yearPhase = (this.tickCount % YEAR_TICKS) / YEAR_TICKS;
    let seasonal: number;
    if (f.seasonAmp && f.seasonPhase) {
      seasonal =
        f.seasonAmp[i] *
        Math.cos(2 * Math.PI * (yearPhase - f.seasonPhase[i])) *
        this.seasonStrength;
    } else {
      const signedLat = 1 - 2 * (tile.y / this.mapHeight);
      seasonal =
        Math.sin(2 * Math.PI * yearPhase) *
        signedLat *
        (this.tilt / 90) *
        this.seasonStrength;
    }
    const toC = (v: number) => v * 65 - 30;
    const tempNorm = Math.max(0, Math.min(1, f.tempBase[i] + seasonal));
    const humidity = f.humidityBase[i];

    const water = f.waterMask[i];
    const isOcean = water === 1;
    const isLake = water === 2 || f.lakeBase[i] > 0.5;
    const river = f.riverBase[i];

    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-4, b - a)));
      return t * t * (3 - 2 * t);
    };
    const snow =
      this.iceThreshold > 0
        ? 1 -
          smoothstep(
            this.iceThreshold - this.snowBand,
            this.iceThreshold + this.snowBand,
            tempNorm,
          )
        : 0;

    let surface = "land";
    if (isOcean) surface = "ocean";
    else if (isLake) surface = "lake";
    else if (river > (this.derivedConfig?.riverWeakThreshold ?? 0.5))
      surface = "river";

    const rows: [string, string][] = [
      ["tile", `${tile.x}, ${tile.y}`],
      [
        "lat / lon",
        `${lat >= 0 ? "N" : "S"}${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? "E" : "W"}${Math.abs(lon).toFixed(1)}°`,
      ],
      [
        "elevation",
        isOcean
          ? `${((seaLevel - f.elevation[i]) * 100).toFixed(0)}% below sea`
          : `${(((f.elevation[i] - seaLevel) / Math.max(0.01, 1 - seaLevel)) * 100).toFixed(0)}% above sea`,
      ],
      [
        "surface",
        surface +
          (surface === "river" ? ` (${(river * 100).toFixed(0)}%)` : ""),
      ],
      [
        "temp",
        `${toC(tempNorm).toFixed(1)}°C (mean ${toC(f.tempBase[i]).toFixed(1)}°C)`,
      ],
      ["humidity", `${(humidity * 100).toFixed(0)}%`],
    ];
    if (snow > 0.001) rows.push(["snow", `${(snow * 100).toFixed(0)}%`]);
    if (isOcean) {
      const depth = Math.max(
        0,
        Math.min(1, (seaLevel - f.elevation[i]) / Math.max(0.01, seaLevel)),
      );
      rows.push(["biome", oceanBiome(depth, tempNorm, this.iceThreshold)]);
    } else if (isLake) {
      rows.push([
        "biome",
        this.iceThreshold > 0 && tempNorm < this.iceThreshold
          ? "frozen lake"
          : "lake",
      ]);
    } else {
      rows.push(["biome", biomeName(tempNorm, humidity, snow >= 1)]);
    }
    return rows;
  }

  // --- render -----------------------------------------------------------------

  render() {
    if (!CameraRenderer.isSupported()) {
      return html`<section
        class="w-full h-full bg-neutral-950 text-white overflow-auto"
      >
        <div class="max-w-3xl mx-auto p-8 text-white/80 leading-7">
          <h1 class="text-2xl font-semibold text-white mb-4">Game Shell</h1>
          <p>This browser does not expose <code>navigator.gpu</code>.</p>
        </div>
      </section>`;
    }
    const game = this.hasGame();
    const compiled = this.compiled;
    return html`
      <section class="fixed inset-0 z-[9000] bg-neutral-950 overflow-hidden">
        <canvas
          id="shell-canvas"
          class="absolute inset-0 w-full h-full touch-none ${compiled?.system
            .input?.onTile || (game && this.brush)
            ? "cursor-crosshair"
            : "cursor-grab active:cursor-grabbing"}"
          @pointerdown=${this.onPointerDown}
          @pointermove=${this.onPointerMove}
          @pointerup=${this.onPointerUp}
          @pointercancel=${this.onPointerUp}
          @pointerleave=${this.onPointerLeave}
          @wheel=${this.onWheel}
          aria-label="Game map"
        ></canvas>

        ${this.renderHover()}

        <div
          class="absolute top-3 left-3 flex items-center gap-3 text-sm text-white bg-black/60 backdrop-blur px-3 py-2 rounded flex-wrap max-w-[calc(100%-1.5rem)]"
        >
          <select
            class="bg-black/40 border border-white/20 px-2 py-1 text-white"
            @change=${(e: Event) => {
              this.systemId = (e.target as HTMLSelectElement).value;
              this.paramValues = {};
              // Apply the newly-selected game's default map; the view resets to
              // a terrain view in onSystemMounted (the game overlay is opt-in).
              const sys = this.systems.find((s) => s.id === this.systemId);
              if (sys?.defaultMap && sys.defaultMap in GameMapType) {
                this.mapKey = sys.defaultMap;
              }
              void this.loadWorld();
            }}
          >
            ${this.systems.map(
              (s) =>
                html`<option value=${s.id} ?selected=${s.id === this.systemId}>
                  ${s.name}
                </option>`,
            )}
          </select>
          <select
            class="bg-black/40 border border-white/20 px-2 py-1 text-white"
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
          <select
            class="bg-black/40 border border-white/20 px-2 py-1 text-white"
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              const name = v.slice(v.indexOf(":") + 1);
              if (v.startsWith("game:")) void this.applyGameView(name);
              else void this.applyTerrainView(name as ShellViewKey);
            }}
          >
            ${VIEW_KEYS.map(
              (view) =>
                html`<option
                  value="terrain:${view}"
                  ?selected=${!this.showingGame && view === this.shellView}
                >
                  ${view}
                </option>`,
            )}
            ${game
              ? html`<optgroup label=${compiled?.system.name ?? "game"}>
                  ${(compiled?.viewNames ?? []).map(
                    (view) =>
                      html`<option
                        value="game:${view}"
                        ?selected=${this.showingGame && view === this.view}
                      >
                        ${view}
                      </option>`,
                  )}
                </optgroup>`
              : null}
          </select>
          <button
            class="border border-white/20 px-2 py-1 hover:bg-white/10"
            title="Cycle layer (n / shift+n)"
            @click=${() => this.cycleView(1)}
          >
            ⟳
          </button>
          <button
            class="border border-white/20 px-2 py-1 hover:bg-white/10"
            @click=${() => this.toggleRunning()}
          >
            ${this.running ? "Pause" : "Play"}
          </button>
          <label
            class="flex items-center gap-1 cursor-pointer select-none text-white/80"
          >
            <input
              type="checkbox"
              .checked=${this.turbo}
              @change=${(e: Event) =>
                this.setTurbo((e.target as HTMLInputElement).checked)}
            />
            turbo
          </label>
          <span class="text-white/70">week ${this.weekReadout}</span>
          ${game
            ? html`<span class="text-white/70">tick ${this.tickReadout}</span>`
            : null}
          <span class="text-white/70">zoom ${this.zoomReadout}×</span>
          ${this.derivedOk
            ? html`<button
                class="border border-white/20 px-2 py-1 hover:bg-white/10 ${this
                  .showKnobs
                  ? "bg-white/10"
                  : ""}"
                @click=${() => (this.showKnobs = !this.showKnobs)}
              >
                climate
              </button>`
            : null}
          ${game && (compiled?.brushNames.length ?? 0) > 0
            ? html`<select
                class="bg-black/40 border border-white/20 px-2 py-1 text-white"
                title="Brush (click on map to stamp)"
                @change=${(e: Event) => {
                  this.brush = (e.target as HTMLSelectElement).value;
                }}
              >
                ${(compiled?.brushNames ?? []).map(
                  (name) =>
                    html`<option value=${name} ?selected=${name === this.brush}>
                      🖌 ${name}
                    </option>`,
                )}
              </select>`
            : null}
          ${this.derivedNote
            ? html`<span class="text-amber-300/80">${this.derivedNote}</span>`
            : null}
          ${this.status
            ? html`<span class="text-amber-300">${this.status}</span>`
            : null}
        </div>

        ${game ? this.renderSimPanel() : null}
        ${this.showKnobs && this.derivedOk && this.derivedConfig
          ? this.renderKnobs(this.derivedConfig)
          : null}
      </section>
    `;
  }

  /** Sim-system panel: scalar readouts + generic param sliders. */
  private renderSimPanel() {
    const compiled = this.compiled;
    const scalars = Object.entries(this.scalarReadout);
    const params = compiled?.paramList ?? [];
    if (scalars.length === 0 && params.length === 0) return null;
    return html`
      <div
        class="absolute top-16 right-3 flex flex-col gap-1.5 text-xs text-white bg-black/60 backdrop-blur px-3 py-3 rounded w-72 max-h-[80vh] overflow-auto"
      >
        ${scalars.length
          ? html`<div class="flex flex-col gap-1 pb-1 border-b border-white/10">
              ${scalars.map(
                ([name, value]) => html`<div
                  class="flex justify-between gap-3"
                >
                  <span class="text-white/50">${name}</span>
                  <span class="text-white/90 tabular-nums"
                    >${formatScalar(value)}</span
                  >
                </div>`,
              )}
            </div>`
          : null}
        ${params.map(
          (param) => html`
            <label class="flex items-center gap-2">
              <span class="w-28 truncate text-white/70" title=${param.name}
                >${param.name}</span
              >
              <input
                type="range"
                class="flex-1"
                min=${param.min}
                max=${param.max}
                step=${param.step}
                .value=${String(this.paramValues[param.name] ?? param.value)}
                @input=${(e: Event) =>
                  this.updateParam(
                    param.name,
                    (e.target as HTMLInputElement).valueAsNumber,
                  )}
              />
              <span class="w-12 text-right text-white/90 tabular-nums"
                >${(this.paramValues[param.name] ?? param.value).toFixed(2)}</span
              >
            </label>
          `,
        )}
      </div>
    `;
  }

  private renderKnobs(config: FoundationWorldEngineMapConfig) {
    const slider = (
      label: string,
      value: number,
      min: number,
      max: number,
      step: number,
      onInput: (v: number) => void,
    ) => html`
      <label class="flex items-center gap-2">
        <span class="w-32 text-white/70">${label}</span>
        <input
          type="range"
          class="flex-1"
          min=${min}
          max=${max}
          step=${step}
          .value=${String(value)}
          @input=${(e: Event) =>
            onInput(Number((e.target as HTMLInputElement).value))}
        />
        <span class="w-12 text-right text-white/90 tabular-nums"
          >${value.toFixed(step < 0.01 ? 3 : 2)}</span
        >
      </label>
    `;
    return html`
      <div
        class="absolute top-16 right-3 flex flex-col gap-1.5 text-xs text-white bg-black/60 backdrop-blur px-3 py-3 rounded w-80"
      >
        ${CLIMATE_KNOBS.map((k) =>
          slider(k.key, config[k.key] as number, k.min, k.max, k.step, (v) =>
            this.setKnob(k.key, v),
          ),
        )}
        ${slider("tilt", this.tilt, 0, 45, 0.1, (v) => {
          this.tilt = v;
          this.queueRecolor();
        })}
        ${slider("seasonStrength", this.seasonStrength, 0, 3, 0.05, (v) => {
          this.seasonStrength = v;
          this.queueRecolor();
        })}
        ${slider("iceThreshold", this.iceThreshold, 0, 0.6, 0.005, (v) => {
          this.iceThreshold = v;
          this.queueRecolor();
        })}
        ${slider("snowBand", this.snowBand, 0, 0.3, 0.005, (v) => {
          this.snowBand = v;
          this.queueRecolor();
        })}
        ${slider("biomeBlend", this.biomeBlend, 0, 0.15, 0.005, (v) => {
          this.biomeBlend = v;
          this.queueRecolor();
        })}
        <label
          class="flex items-center gap-2 pt-1 border-t border-white/10 cursor-pointer"
        >
          <input
            type="checkbox"
            .checked=${this.useClimateBase}
            @change=${(e: Event) => {
              this.useClimateBase = (e.target as HTMLInputElement).checked;
              this.queueRecolor();
            }}
          />
          <span class="text-white/70"
            >real climate base (off = synthetic model)</span
          >
        </label>
      </div>
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
