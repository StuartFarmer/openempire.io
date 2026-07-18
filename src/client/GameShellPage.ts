import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameMapType } from "../core/game/Game";
import type { MapData } from "../core/game/GameMapLoader";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import { LAB_SYSTEMS } from "./lab/systems";
import { terrain as terrainSystem } from "./lab/systems/terrain/system";
import { CameraRenderer, type CameraState } from "./shell/CameraRenderer";
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
import type { ViewerRenderer } from "./viewer/ViewerRenderer";

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

const MAX_SCALE = 32;
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
  @state() private zoomReadout = 1;
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
  @state() private hoverTile: { x: number; y: number } | null = null;

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
  private camera: CameraState = { cx: 0, cy: 0, scale: 1 };
  private dragging = false;
  private painting = false;
  private lastPointer = { x: 0, y: 0 };
  private pendingFit = false;
  private recolorBusy = false;
  private recolorDirty = false;
  private deriveBusy = false;
  private viewCache = new Map<ShellViewKey, ImageBitmap>();

  connectedCallback(): void {
    // The shell picks terrain by default and the big Earth map.
    this.systems = [terrainSystem, ...LAB_SYSTEMS];
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

  protected async createRenderer(
    canvas: HTMLCanvasElement,
  ): Promise<ViewerRenderer> {
    return CameraRenderer.create(canvas);
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

  /** After a system mounts: derive (terrain) or point the camera at the sim's
   * out texture, then fit the camera on the next frame. */
  protected async onSystemMounted(mapData: MapData): Promise<void> {
    if (this.isTerrain()) {
      await this.deriveTerrain(mapData);
      await this.applyTerrainView(this.shellView);
    } else if (this.renderer && this.kernel?.outView) {
      this.derivedOk = false;
      this.derivedNote = "";
      this.hoverFields = null;
      this.renderer.setLiveTexture(
        this.kernel.outView,
        this.mapWidth,
        this.mapHeight,
      );
    }
    this.clearViewCache();
    this.tickCount = 0;
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
      this.writeP(this.currentViewMode());
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

  private writeP(viewMode: WebGpuViewMode): void {
    if (!this.kernel || !this.derivedConfig) return;
    this.kernel.writeUniform(
      "P",
      buildWorldgenParams(
        this.derivedConfig,
        viewMode,
        this.seasonal(),
        this.runtime(),
      ),
    );
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
    this.writeP(this.currentViewMode());
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
    if (!this.derivedOk || !this.isTerrain() || !this.derivedConfig) return;
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

  // --- per-frame advance (base loop hooks) ------------------------------------

  /** Terrain advances its season clock (and sweeps the derived temperature);
   * sim systems tick their layers via the base. */
  protected advance(ticks: number): void {
    if (!this.isTerrain()) {
      super.advance(ticks);
      return;
    }
    if (ticks <= 0) return;
    this.tickCount += ticks;
    const week = Math.floor(((this.tickCount % YEAR_TICKS) / YEAR_TICKS) * 52);
    if (week !== this.weekReadout) this.weekReadout = week;
    if (
      this.derivedOk &&
      this.derivedConfig &&
      !this.recolorBusy &&
      !this.deriveBusy &&
      DERIVED_VIEWS[this.shellView] !== undefined
    ) {
      this.deriveBusy = true;
      this.runTier("season")
        .catch((error: unknown) => {
          this.status = (error as Error).message;
        })
        .finally(() => {
          this.deriveBusy = false;
        });
    }
  }

  protected shouldRenderSimView(): boolean {
    return !this.isTerrain();
  }

  /** The camera presents every display frame regardless of sim/season cadence. */
  protected present(): void {
    const r = this.renderer;
    if (!r) return;
    r.syncSize();
    if (this.pendingFit && r.mapWidth > 0) {
      this.pendingFit = false;
      this.camera = {
        cx: this.mapWidth / 2,
        cy: this.mapHeight / 2,
        scale: r.fitScale() * 0.95,
      };
    }
    this.clampCamera();
    r.render(this.camera);
    const zoom = Math.round(this.camera.scale * 100) / 100;
    if (zoom !== this.zoomReadout) this.zoomReadout = zoom;
  }

  // --- views ------------------------------------------------------------------

  /** Terrain view: derived color mode (repaint) or a baked layer bitmap. */
  private async applyTerrainView(view: ShellViewKey): Promise<void> {
    this.shellView = view;
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

  /** Sim view: switch the base's view pass and redraw. */
  private applySimView(view: string): void {
    this.view = view;
    this.needsRedraw = true;
  }

  private cycleView(step: number): void {
    if (this.isTerrain()) {
      const index = VIEW_KEYS.indexOf(this.shellView);
      void this.applyTerrainView(
        VIEW_KEYS[(index + step + VIEW_KEYS.length) % VIEW_KEYS.length],
      );
    } else {
      const views = this.compiled?.viewNames ?? [];
      if (views.length === 0) return;
      const index = views.indexOf(this.view);
      this.applySimView(
        views[(index + step + views.length) % views.length],
      );
    }
  }

  // --- input ------------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.classList.contains("hidden")) return;
    if (event.key === "n" || event.key === "N") {
      this.cycleView(event.shiftKey ? -1 : 1);
    }
  };

  /** Whether a plain drag paints (sim system with a brush) vs pans. */
  private paintMode(event: PointerEvent): boolean {
    return (
      !this.isTerrain() &&
      this.brush !== "" &&
      (this.compiled?.brushNames.length ?? 0) > 0 &&
      !event.shiftKey
    );
  }

  private framebufferPoint(event: PointerEvent | WheelEvent): {
    x: number;
    y: number;
  } {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  }

  private cursorToMap(event: PointerEvent): { x: number; y: number } {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const p = this.framebufferPoint(event);
    return {
      x: this.camera.cx + (p.x - canvas.width / 2) / this.camera.scale,
      y: this.camera.cy + (p.y - canvas.height / 2) / this.camera.scale,
    };
  }

  /** Stamp the active brush at the cursor, mapped through the camera. */
  private stampCamera(event: PointerEvent): void {
    if (!this.kernel || !this.compiled || this.brush === "") return;
    const { x, y } = this.cursorToMap(event);
    this.kernel.writeUniform("B", this.compiled.encodeBrush(this.brush, x, y));
    const frame = this.kernel.beginFrame();
    frame.pass(this.compiled.brushPass(this.brush));
    if (!this.running) this.compiled.runView(frame, this.view);
    void frame.finish();
  }

  private onPointerDown = (event: PointerEvent): void => {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    if (this.paintMode(event)) {
      this.painting = true;
      this.stampCamera(event);
    } else {
      this.dragging = true;
      this.lastPointer = this.framebufferPoint(event);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.updateHover(event);
    if (this.painting) {
      this.stampCamera(event);
      return;
    }
    if (!this.dragging) return;
    const point = this.framebufferPoint(event);
    this.camera.cx -= (point.x - this.lastPointer.x) / this.camera.scale;
    this.camera.cy -= (point.y - this.lastPointer.y) / this.camera.scale;
    this.lastPointer = point;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    this.painting = false;
  };

  private onPointerLeave = (): void => {
    this.hoverTile = null;
  };

  private updateHover(event: PointerEvent): void {
    const { x: mapX, y: mapY } = this.cursorToMap(event);
    const x = Math.floor(mapX);
    const y = Math.floor(mapY);
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) {
      if (this.hoverTile !== null) this.hoverTile = null;
      return;
    }
    if (this.hoverTile?.x !== x || this.hoverTile?.y !== y) {
      this.hoverTile = { x, y };
    }
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.renderer) return;
    const point = this.framebufferPoint(event);
    const canvas = event.currentTarget as HTMLCanvasElement;
    const mapX =
      this.camera.cx + (point.x - canvas.width / 2) / this.camera.scale;
    const mapY =
      this.camera.cy + (point.y - canvas.height / 2) / this.camera.scale;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const minScale = this.renderer.fitScale() * 0.5;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(minScale, this.camera.scale * factor),
    );
    this.camera = {
      scale,
      cx: mapX - (point.x - canvas.width / 2) / scale,
      cy: mapY - (point.y - canvas.height / 2) / scale,
    };
  };

  private clampCamera(): void {
    if (!this.renderer || this.renderer.mapWidth === 0) return;
    const minScale = this.renderer.fitScale() * 0.5;
    this.camera.scale = Math.min(
      MAX_SCALE,
      Math.max(minScale, this.camera.scale),
    );
    this.camera.cx = Math.min(
      this.renderer.mapWidth,
      Math.max(0, this.camera.cx),
    );
    this.camera.cy = Math.min(
      this.renderer.mapHeight,
      Math.max(0, this.camera.cy),
    );
  }

  // --- hover readout (terrain) ------------------------------------------------

  private hoverReadout(): { rows: [string, string][] } | null {
    const tile = this.hoverTile;
    const f = this.hoverFields;
    if (!tile || !f || !this.isTerrain()) return null;
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
    return { rows };
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
    const terrainMode = this.isTerrain();
    const compiled = this.compiled;
    return html`
      <section class="fixed inset-0 z-[9000] bg-neutral-950 overflow-hidden">
        <canvas
          id="shell-canvas"
          class="absolute inset-0 w-full h-full touch-none ${terrainMode ||
          !this.brush
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-crosshair"}"
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
          ${terrainMode
            ? html`<select
                class="bg-black/40 border border-white/20 px-2 py-1 text-white"
                @change=${(e: Event) =>
                  void this.applyTerrainView(
                    (e.target as HTMLSelectElement).value as ShellViewKey,
                  )}
              >
                ${VIEW_KEYS.map(
                  (view) =>
                    html`<option
                      value=${view}
                      ?selected=${view === this.shellView}
                    >
                      ${view}
                    </option>`,
                )}
              </select>`
            : html`<select
                class="bg-black/40 border border-white/20 px-2 py-1 text-white"
                @change=${(e: Event) =>
                  this.applySimView((e.target as HTMLSelectElement).value)}
              >
                ${(compiled?.viewNames ?? []).map(
                  (view) =>
                    html`<option value=${view} ?selected=${view === this.view}>
                      ${view}
                    </option>`,
                )}
              </select>`}
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
          ${terrainMode
            ? html`<span class="text-white/70">week ${this.weekReadout}</span>`
            : html`<span class="text-white/70">tick ${this.tickReadout}</span>`}
          <span class="text-white/70">zoom ${this.zoomReadout}×</span>
          ${terrainMode && this.derivedOk
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
          ${!terrainMode && (compiled?.brushNames.length ?? 0) > 0
            ? html`<select
                class="bg-black/40 border border-white/20 px-2 py-1 text-white"
                title="Brush (drag on map; shift-drag pans)"
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

        ${!terrainMode ? this.renderSimPanel() : null}
        ${this.showKnobs && terrainMode && this.derivedOk && this.derivedConfig
          ? this.renderKnobs(this.derivedConfig)
          : null}
      </section>
    `;
  }

  private renderHover() {
    const info = this.hoverReadout();
    if (!info) return null;
    return html`
      <div
        class="absolute bottom-3 left-3 text-xs text-white bg-black/70 backdrop-blur px-3 py-2 rounded font-mono leading-5 min-w-[13rem]"
      >
        ${info.rows.map(
          ([label, value]) => html`
            <div class="flex justify-between gap-4">
              <span class="text-white/50">${label}</span>
              <span class="text-white/90">${value}</span>
            </div>
          `,
        )}
      </div>
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
