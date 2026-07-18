import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { decodeElevation } from "../core/game/ElevationMap";
import { GameMapType } from "../core/game/Game";
import type { MapData } from "../core/game/GameMapLoader";
import { HYDRO_PLANE_NAMES } from "../core/game/HydroMap";
import { LAYER_NAMES } from "../core/game/MapLayers";
import {
  SEASON_AMPLITUDE_MAX_C,
  SEASON_PLANE_NAMES,
} from "../core/game/SeasonMap";
import type { FoundationWorldEngineMapConfig } from "../games/alternative/world/WorldEngineElevation";
import { world } from "./lab/systems/world/system";
import { CameraRenderer, type CameraState } from "./shell/CameraRenderer";
import {
  buildViewBitmap,
  SHELL_VIEWS,
  type ShellView,
} from "./shell/MapLayerViews";
import {
  buildWaterMask,
  TerrainDerivation,
  type DerivationFields,
} from "./shell/TerrainDerivation";
import { TerrainSystemRunner } from "./shell/TerrainSystemRunner";
import { terrainMapFileLoader } from "./TerrainMapFileLoader";
import {
  compileFieldSystem,
  type CompiledFieldSystem,
} from "./webgpu/FieldDynamics";
import { FieldKernel } from "./webgpu/FieldKernel";
import { uploadMapLayers } from "./webgpu/MapLayerUpload";
import type {
  WebGpuViewMode,
  WorldgenRuntimeParams,
  WorldgenSeasonalParams,
} from "./webgpu/WebGpuWorldEngine";

/** User-tuned shell defaults (2026-07-17): override the manifest's
 * generation-time climate values for the derived view. River thresholds now
 * cut the SHIPPED water plane (graded alpha rendering) — 1.0/1.0 turns
 * rivers off entirely. */
const SHELL_CLIMATE_DEFAULTS = {
  latitudeEffect: 1.01,
  elevationCooling: 0.37,
  rainNoise: 0.64,
  warmthRainfall: 0.55,
  // Act on the SEPARATE hydro river plane now — rivers no longer leak
  // through the lake path, so these genuinely gate rivers (1.0/1.0 = off).
  riverWeakThreshold: 0.5,
  riverStrongThreshold: 0.82,
} as const;

// #shell — the game shell: a fullscreen camera over the map, with the WESL
// world simulation resident (headless FieldKernel on the camera's device,
// ticked at the 10/s game clock). Terrain and temperature are LIVE derived
// views (export-primary-fields): a worldgen kernel re-derives climate,
// drainage, biomes, and colors from the map's elevation.bin + manifest
// render config, the seasonal model sweeps the derived temperature, and the
// climate knobs are runtime sliders. Baked terrain-colors.png remains the
// fallback when the sidecar or derivation is unavailable. Mechanics
// accumulate in the world system; intents and bots come later.

const MAX_SCALE = 32;
const TICKS_PER_SECOND = 10; // OpenFront's 100ms tick
const MAX_TICKS_PER_FRAME = 4;

type ShellViewKey = ShellView;
const VIEW_KEYS: readonly ShellViewKey[] = SHELL_VIEWS;
/** The sim fallback live view when derivation is unavailable. */
const LIVE_VIEW: ShellViewKey = "temperature";
/** The world system's view pass rendered for it. */
const LIVE_SIM_VIEW = "temperature";

/** Shell views served by the derivation kernel when it is available. */
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

/** The climate/color knobs that re-derive live (recolor tier). Sea level
 * and lakes are NOT knobs — water classification comes straight from the
 * shipped map (100% faithful), never from thresholds. latitudeEffect /
 * elevationCooling only shape temperature in synthetic-model mode; they
 * always shape precipitation. */
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
export class GameShellPage extends LitElement {
  @state() private mapKey = "EarthXL";
  @state() private viewKey: ShellViewKey = "terrain";
  @state() private status = "";
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
  /** Partial snow cover band above the ice line. */
  @state() private snowBand = 0.075;
  /** Smoothstep half-width across biome color band edges. */
  @state() private biomeBlend = 0.05;

  private yearTicks = 520;

  private renderer: CameraRenderer | null = null;
  private kernel: FieldKernel | null = null;
  private compiled: CompiledFieldSystem | null = null;
  private derivation: TerrainDerivation | null = null;
  private systemRunner: TerrainSystemRunner | null = null;
  /** Parity toggle ('y'): render the `terrain` system's derivation instead. */
  private useSystemDerivation = false;
  private lastDeriveFields: DerivationFields | null = null;
  private recolorBusy = false;
  private recolorDirty = false;
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
  /** Whether the loaded map carries a real seasonal harmonic (season.bin). */
  private seasonActive = false;
  /** Tile under the cursor (map coords), or null when off-map. */
  @state() private hoverTile: { x: number; y: number } | null = null;
  private camera: CameraState = { cx: 0, cy: 0, scale: 1 };
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private simInFlight = false;
  private simReady = false;
  private tickCount = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private mapWidth = 0;
  private mapHeight = 0;
  private pendingFit = false;
  private viewCache = new Map<ShellView, ImageBitmap>();

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
    this.raf = requestAnimationFrame(this.loop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeyDown);
    cancelAnimationFrame(this.raf);
    this.clearViewCache();
    this.derivation?.destroy();
    this.systemRunner?.destroy();
    this.systemRunner = null;
    this.derivation = null;
    this.kernel?.destroy();
    this.kernel = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private clearViewCache(): void {
    for (const bitmap of this.viewCache.values()) bitmap.close();
    this.viewCache.clear();
  }

  async firstUpdated(): Promise<void> {
    // Outrank the page footer/header stacking contexts — the shell is a
    // fullscreen surface.
    this.style.zIndex = "9999";
    if (!CameraRenderer.isSupported()) {
      this.status = "WebGPU is not supported in this browser.";
      return;
    }
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    if (!canvas) return;
    try {
      this.renderer = await CameraRenderer.create(canvas);
      // The resident sim: headless kernel sharing the camera's device, so
      // its out texture renders under the camera without readbacks.
      this.compiled = await compileFieldSystem(world);
      this.yearTicks =
        this.compiled.paramList.find((p) => p.name === "yearTicks")?.value ??
        520;
      this.kernel = await FieldKernel.create(null, this.compiled.kernelConfig, {
        device: this.renderer.device,
      });
      this.derivation = await TerrainDerivation.create(this.renderer.device);
      // Parity harness: the same derivation through the `terrain` FieldDynamics
      // system. Press 'y' to A/B it against the hand-wired path.
      this.systemRunner = await TerrainSystemRunner.create(this.renderer.device);
      await this.loadMap();
    } catch (error) {
      this.status = (error as Error).message;
    }
  }

  private async loadMap(): Promise<void> {
    if (!this.renderer || !this.kernel || !this.compiled) return;
    this.simReady = false;
    this.status = `Loading ${this.mapKey}…`;
    try {
      const mapType = GameMapType[this.mapKey as keyof typeof GameMapType];
      const mapData = terrainMapFileLoader.getMapData(mapType);
      const manifest = await mapData.manifest();
      this.mapWidth = manifest.map.width;
      this.mapHeight = manifest.map.height;
      this.clearViewCache();
      // Detach the camera before the kernels resize — a live-texture bind
      // group must not outlive the texture it references.
      this.renderer.clearSurface();

      // Reset the sim onto this map.
      this.kernel.resize(this.mapWidth, this.mapHeight);
      await uploadMapLayers(
        this.kernel,
        this.compiled.mapLayers,
        mapData,
        this.mapWidth,
        this.mapHeight,
      );
      this.kernel.writeUniform("P", this.compiled.writeParams({}, 1337));
      this.kernel.clearBuffer("S");
      const frame = this.kernel.beginFrame();
      this.compiled.runInit(frame);
      this.compiled.runView(frame, LIVE_SIM_VIEW);
      await frame.finish();
      this.tickCount = 0;
      this.simReady = true;

      await this.deriveTerrain(mapData);
      await this.applyView(this.viewKey);
      // Fit on the next loop frame — the canvas may not be laid out yet.
      this.pendingFit = true;
    } catch (error) {
      this.status = (error as Error).message;
    }
  }

  /**
   * Runtime terrain derivation from elevation.bin + the manifest render
   * config. A failure is not fatal — the baked terrain-colors.png remains
   * the terrain view and the sim's temp layer the temperature view, with a
   * visible status explaining the fallback.
   */
  private async deriveTerrain(mapData: MapData): Promise<void> {
    this.derivedOk = false;
    this.derivedNote = "";
    this.derivedConfig = null;
    this.hoverFields = null;
    this.seasonActive = false;
    if (!this.derivation) {
      this.derivedNote = "no derivation kernel — baked terrain";
      return;
    }
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
      const elevation = decodeElevation(
        await mapData.elevationBin(),
        this.mapWidth,
        this.mapHeight,
      );
      this.derivedConfig = {
        ...this.derivation.normalizeConfig(
          manifest.world_engine,
          this.mapWidth,
          this.mapHeight,
        ),
        ...SHELL_CLIMATE_DEFAULTS,
      };
      // The shipped water truth: connected components over map.bin water,
      // sea vs lake decided by the ocean bit + real bathymetry.
      const terrain = await mapData.mapBin();
      const waterMask = buildWaterMask(
        terrain,
        elevation,
        this.derivedConfig.seaLevel,
        this.mapWidth,
        this.mapHeight,
      );
      // The baked temperature/humidity planes — real measurements on earth
      // maps — are the climate base.
      const layers = await mapData.layersBin();
      const planeSize = this.mapWidth * this.mapHeight;
      const plane = (bytes: Uint8Array, index: number): Float32Array => {
        const out = new Float32Array(planeSize);
        for (let i = 0; i < planeSize; i += 1) {
          out[i] = bytes[index * planeSize + i] / 255;
        }
        return out;
      };
      const tempBase = plane(layers, LAYER_NAMES.indexOf("temperature"));
      const humidityBase = plane(layers, LAYER_NAMES.indexOf("humidity"));
      // hydro.bin keeps lakes and rivers DISTINCT (the merged layers.bin
      // "water" plane can't tell them apart — both saturate it).
      const hydro = await mapData.hydroBin();
      const lakeBase = plane(hydro, HYDRO_PLANE_NAMES.indexOf("lake"));
      const riverBase = plane(hydro, HYDRO_PLANE_NAMES.indexOf("river"));
      // season.bin (optional, real-data maps): the seasonal harmonic —
      // amplitude (°C, stored /SEASON_AMPLITUDE_MAX_C) and phase. Amplitude
      // uploads in NORMALIZED temp units (°C / 65, the plane's −30..35 span).
      let seasonAmp: Float32Array | null = null;
      let seasonPhase: Float32Array | null = null;
      this.seasonActive = false;
      if (manifest.season && mapData.seasonBin) {
        const season = await mapData.seasonBin();
        const rawAmp = plane(season, SEASON_PLANE_NAMES.indexOf("amplitude"));
        seasonAmp = new Float32Array(planeSize);
        for (let i = 0; i < planeSize; i += 1) {
          seasonAmp[i] = (rawAmp[i] * SEASON_AMPLITUDE_MAX_C) / 65;
        }
        seasonPhase = plane(season, SEASON_PLANE_NAMES.indexOf("phase"));
        this.seasonActive = true;
      }
      // Keep the source fields for the hover readout (no GPU readback).
      this.hoverFields = {
        elevation,
        waterMask,
        tempBase,
        humidityBase,
        lakeBase,
        riverBase,
        seasonAmp,
        seasonPhase,
      };
      const deriveFields: DerivationFields = {
        elevation,
        waterMask,
        tempBase,
        humidityBase,
        lakeBase,
        riverBase,
        ...(seasonAmp && seasonPhase ? { seasonAmp, seasonPhase } : {}),
      };
      this.lastDeriveFields = deriveFields;
      await this.derivation.derive(
        deriveFields,
        this.derivedConfig,
        DERIVED_VIEWS[this.viewKey] ?? "terrain",
        this.seasonal(),
        this.runtime(),
      );
      if (this.useSystemDerivation && this.systemRunner) {
        await this.systemRunner.derive(
          deriveFields,
          this.derivedConfig,
          DERIVED_VIEWS[this.viewKey] ?? "terrain",
          this.seasonal(),
          this.runtime(),
        );
      }
      this.derivedOk = true;
      this.status = "";
    } catch (error) {
      this.status = "";
      this.derivedNote = `derivation failed (${(error as Error).message}) — baked terrain`;
    }
  }

  private seasonal(): WorldgenSeasonalParams {
    return {
      tilt: this.tilt,
      yearPhase: (this.tickCount % this.yearTicks) / this.yearTicks,
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

  /** Show a view; the camera is untouched, so pan/zoom carries over. */
  private async applyView(view: ShellViewKey): Promise<void> {
    if (!this.renderer) return;
    this.viewKey = view;
    const derivedMode = this.derivedOk ? DERIVED_VIEWS[view] : undefined;
    // Parity toggle: point the camera at whichever derivation is active.
    const activeOutView =
      this.useSystemDerivation && this.systemRunner?.outView
        ? this.systemRunner.outView
        : this.derivation?.outView;
    if (derivedMode && activeOutView && this.derivedConfig) {
      // Live derived view: the worldgen kernel's out texture; repaint the
      // color pass with this view mode.
      this.renderer.setLiveTexture(
        activeOutView,
        this.mapWidth,
        this.mapHeight,
      );
      try {
        if (this.useSystemDerivation && this.systemRunner && this.lastDeriveFields) {
          // System path re-runs the full derivation for the view mode.
          await this.systemRunner.derive(
            this.lastDeriveFields,
            this.derivedConfig,
            derivedMode,
            this.seasonal(),
            this.runtime(),
          );
        } else if (this.derivation) {
          await this.derivation.repaint(
            this.derivedConfig,
            derivedMode,
            this.seasonal(),
            this.runtime(),
          );
          this.status = "";
        }
      } catch (error) {
        this.status = (error as Error).message;
      }
      return;
    }
    if (view === LIVE_VIEW) {
      // Fallback live view: the sim's seasonal temperature out texture.
      if (this.kernel?.outView) {
        this.renderer.setLiveTexture(
          this.kernel.outView,
          this.mapWidth,
          this.mapHeight,
        );
        this.status = "";
      }
      return;
    }
    this.status = `Loading ${view}…`;
    try {
      let bitmap = this.viewCache.get(view);
      if (!bitmap) {
        const mapType = GameMapType[this.mapKey as keyof typeof GameMapType];
        bitmap = await buildViewBitmap(
          view,
          terrainMapFileLoader.getMapData(mapType),
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

  private cycleView(step: number): void {
    const index = VIEW_KEYS.indexOf(this.viewKey);
    const next =
      VIEW_KEYS[(index + step + VIEW_KEYS.length) % VIEW_KEYS.length];
    void this.applyView(next);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.classList.contains("hidden")) return; // page not active
    if (event.key === "n" || event.key === "N") {
      this.cycleView(event.shiftKey ? -1 : 1);
    }
    if (event.key === "y" || event.key === "Y") {
      void this.toggleSystemDerivation();
    }
  };

  /** Parity A/B: run the current derivation through the `terrain` system and
   * point the camera at its output (or back to the hand-wired one). */
  private async toggleSystemDerivation(): Promise<void> {
    if (!this.systemRunner || !this.derivedConfig || !this.lastDeriveFields) {
      return;
    }
    this.useSystemDerivation = !this.useSystemDerivation;
    if (this.useSystemDerivation) {
      this.status = "terrain SYSTEM derivation (y to toggle)";
      await this.systemRunner.derive(
        this.lastDeriveFields,
        this.derivedConfig,
        DERIVED_VIEWS[this.viewKey] ?? "terrain",
        this.seasonal(),
        this.runtime(),
      );
    } else {
      this.status = "";
    }
    await this.applyView(this.viewKey);
  }

  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer) return;
    // Hash navigation shows/hides this page without reconnecting it; while
    // hidden the canvas has no size — don't tick, render, or consume the
    // pending fit against a zero-sized layout.
    if (this.classList.contains("hidden")) {
      this.lastTime = 0;
      return;
    }

    // Fixed game clock for the resident sim.
    const dt =
      this.lastTime === 0 ? 0 : Math.min(0.25, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (this.simReady && !this.simInFlight && this.kernel && this.compiled) {
      this.accumulator = Math.min(
        this.accumulator + dt * TICKS_PER_SECOND,
        MAX_TICKS_PER_FRAME,
      );
      const ticks = Math.floor(this.accumulator);
      this.accumulator -= ticks;
      if (ticks > 0) {
        this.simInFlight = true;
        const frame = this.kernel.beginFrame();
        for (let t = 0; t < ticks; t += 1) {
          this.compiled.runTick(this.kernel, frame);
        }
        // Render the sim's texture only while it's being watched (and not
        // superseded by the derived temperature).
        const derivedMode = this.derivedOk
          ? DERIVED_VIEWS[this.viewKey]
          : undefined;
        if (this.viewKey === LIVE_VIEW && derivedMode === undefined) {
          this.compiled.runView(frame, LIVE_SIM_VIEW);
        }
        frame
          .finish()
          .then(() => {
            this.tickCount += ticks;
            const week = Math.floor(
              ((this.tickCount % this.yearTicks) / this.yearTicks) * 52,
            );
            if (week !== this.weekReadout) this.weekReadout = week;
            // Seasonal tier: sweep the derived temperature (and everything
            // colored from it) with the advanced year phase.
            if (
              derivedMode !== undefined &&
              this.derivation &&
              this.derivedConfig &&
              !this.recolorBusy
            ) {
              return this.derivation.tickSeasons(
                this.derivedConfig,
                derivedMode,
                this.seasonal(),
                this.runtime(),
              );
            }
          })
          .catch((error: unknown) => {
            this.status = (error as Error).message;
          })
          .finally(() => {
            this.simInFlight = false;
          });
      }
    }

    // The camera presents every display frame regardless of sim cadence.
    this.renderer.syncSize();
    if (this.pendingFit && this.renderer.mapWidth > 0) {
      this.pendingFit = false;
      this.camera = {
        cx: this.mapWidth / 2,
        cy: this.mapHeight / 2,
        scale: this.renderer.fitScale() * 0.95,
      };
    }
    this.clampCamera();
    this.renderer.render(this.camera);
    const zoom = Math.round(this.camera.scale * 100) / 100;
    if (zoom !== this.zoomReadout) this.zoomReadout = zoom;
  };

  /** Recolor tier, single-flight: a slider mid-drag can fire faster than the
   * GPU frame returns; collapse the backlog into one trailing rerun. */
  private queueRecolor(): void {
    if (!this.derivedOk || !this.derivation || !this.derivedConfig) return;
    if (this.recolorBusy) {
      this.recolorDirty = true;
      return;
    }
    this.recolorBusy = true;
    this.derivation
      .recolor(
        this.derivedConfig,
        DERIVED_VIEWS[this.viewKey] ?? "terrain",
        this.seasonal(),
        this.runtime(),
      )
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

  /** Pointer position in framebuffer pixels. */
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

  private onPointerDown = (event: PointerEvent): void => {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(
      event.pointerId,
    );
    this.dragging = true;
    this.lastPointer = this.framebufferPoint(event);
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.updateHover(event);
    if (!this.dragging) return;
    const point = this.framebufferPoint(event);
    this.camera.cx -= (point.x - this.lastPointer.x) / this.camera.scale;
    this.camera.cy -= (point.y - this.lastPointer.y) / this.camera.scale;
    this.lastPointer = point;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  private onPointerLeave = (): void => {
    this.hoverTile = null;
  };

  /** Map the cursor to the tile under it (map coords), or null off-map. */
  private updateHover(event: PointerEvent): void {
    const canvas = event.currentTarget as HTMLCanvasElement;
    const point = this.framebufferPoint(event);
    const mapX =
      this.camera.cx + (point.x - canvas.width / 2) / this.camera.scale;
    const mapY =
      this.camera.cy + (point.y - canvas.height / 2) / this.camera.scale;
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

  /** Everything known about the hovered tile, as label/value rows. */
  private hoverReadout(): {
    x: number;
    y: number;
    rows: [string, string][];
  } | null {
    const tile = this.hoverTile;
    const f = this.hoverFields;
    if (!tile || !f) return null;
    const i = tile.y * this.mapWidth + tile.x;
    const lon = ((tile.x + 0.5) / this.mapWidth) * 360 - 180;
    const lat = 90 - ((tile.y + 0.5) / this.mapHeight) * 180;
    const seaLevel = this.derivedConfig?.seaLevel ?? 0.46;

    // Live temperature: baked annual mean + the seasonal swing (the same
    // model the climate pass runs). The plane is linear −30..35 °C.
    const yearPhase = (this.tickCount % this.yearTicks) / this.yearTicks;
    let seasonal: number;
    if (f.seasonAmp && f.seasonPhase) {
      // Real harmonic (season.bin): amplitude already in normalized units.
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

    const water = f.waterMask[i]; // 0 land, 1 sea, 2 lake (map.bin)
    const isOcean = water === 1;
    const isLake = water === 2 || f.lakeBase[i] > 0.5;
    const river = f.riverBase[i];

    // Snow cover, matching the colorizer's smoothstep.
    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-4, b - a)));
      return t * t * (3 - 2 * t);
    };
    // iceThreshold is the freeze/melt pivot; snowBand is the half-width of
    // the slush transition either side (matches snowCoverAt in color.wesl).
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
    else if (river > this.derivedConfig!.riverWeakThreshold) surface = "river";

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
    return { x: tile.x, y: tile.y, rows };
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.renderer) return;
    const point = this.framebufferPoint(event);
    const canvas = event.currentTarget as HTMLCanvasElement;
    // Map point under the cursor stays fixed through the zoom.
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

    return html`
      <section class="fixed inset-0 z-[9000] bg-neutral-950 overflow-hidden">
        <canvas
          id="shell-canvas"
          class="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
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
          class="absolute top-3 left-3 flex items-center gap-3 text-sm text-white bg-black/60 backdrop-blur px-3 py-2 rounded"
        >
          <select
            class="bg-black/40 border border-white/20 px-2 py-1 text-white"
            @change=${(e: Event) => {
              this.mapKey = (e.target as HTMLSelectElement).value;
              void this.loadMap();
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
            @change=${(e: Event) =>
              void this.applyView(
                (e.target as HTMLSelectElement).value as ShellViewKey,
              )}
          >
            ${VIEW_KEYS.map(
              (view) =>
                html`<option value=${view} ?selected=${view === this.viewKey}>
                  ${view}
                </option>`,
            )}
          </select>
          <button
            class="border border-white/20 px-2 py-1 hover:bg-white/10"
            title="Cycle layer (n / shift+n)"
            @click=${() => this.cycleView(1)}
          >
            ⟳
          </button>
          <span class="text-white/70">week ${this.weekReadout}</span>
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
          <span class="text-white/50"
            >drag to pan · wheel to zoom · n cycles layers</span
          >
          ${this.derivedNote
            ? html`<span class="text-amber-300/80">${this.derivedNote}</span>`
            : null}
          ${this.status
            ? html`<span class="text-amber-300">${this.status}</span>`
            : null}
        </div>

        ${this.showKnobs && this.derivedOk && this.derivedConfig
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
