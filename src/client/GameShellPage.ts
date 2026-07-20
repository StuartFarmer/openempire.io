import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getAssetManifest, getCdnBase } from "../core/AssetUrls";
import {
  FOOD_DEFAULTS,
  FOOD_TUNABLE_KEYS,
  type FoodConfig,
} from "../core/configuration/FoodConfig";
import { GameMapType, UnitType } from "../core/game/Game";
import type { MapData } from "../core/game/GameMapLoader";
import type { Intent } from "../core/Schemas";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import { TUNING_GROUPS } from "./hud/layers/TuningPanel";
import { conquest } from "./lab/systems/conquest/system";
import { empire } from "./lab/systems/empire/system";
import { grazing } from "./lab/systems/grazing/system";
import { openfront } from "./lab/systems/openfront/system";
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
import { FieldViewerBase } from "./viewer/FieldViewerBase";
import { loadMapInputs, type MapInputBundle } from "./webgpu/MapInputs";
import type {
  ShellFrontLabel,
  ShellSimFrame,
  ShellSimIn,
  ShellSimOut,
} from "./webgpu/ShellSimProtocol";
import {
  buildWorldgenParams,
  type WebGpuViewMode,
  type WorldgenRuntimeParams,
  type WorldgenSeasonalParams,
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

/** Re-derive the terrain season every Nth OpenFront-live render frame — the
 * season changes slowly, so this bounds the GPU derive cost on huge maps. */
const SEASON_DERIVE_EVERY = 8;

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
  // --- OpenFront-live: the sim runs in a Web Worker (move-shell-sim-to-worker).
  // The worker owns every Game read; the main thread applies conduit deltas to
  // these persistent GPU buffers and drives the HUD/hover/labels from the small
  // per-tick summary the worker ships. Deltas apply in place and only changed
  // tiles upload (run-merged writeBufferU32Range) — the GPU buffers retain rest.
  private worker: Worker | null = null;
  private ownerScratch: Uint32Array | null = null;
  private plotU32: Uint32Array | null = null;
  private densityU32: Uint32Array | null = null;
  private frontU32: Uint32Array | null = null;
  /** The sim's baked fertility plane (tile-fertility spec), shipped once by
   * the worker at ready — the hover readout shows the exact byte it reads. */
  private fertilityPlane: Uint8Array | null = null;
  /** The sim's baked city-suitability plane (city-growth spec), shipped with
   * the fertility plane at ready for the hover readout. */
  private suitabilityPlane: Uint8Array | null = null;
  /** Last placement-preview answer from the worker (farm-growth spec). */
  private previewData: {
    tile: number;
    unit: UnitType;
    ok: boolean;
    fraction: number;
  } | null = null;
  /** Tile the pending/answered preview query was issued for. */
  private previewQueryTile = -1;
  /** Pooled placement-preview box (child of #shell-labels). */
  private previewEl: HTMLDivElement | null = null;
  /** Changed tile indices per conduit this tick (uploaded as merged runs). */
  private dirtyTiles = new Map<string, number[]>();
  /** The human's smallID (from the worker), for "you" + hover ownership. */
  private mySmallID = 0;
  /** Per-player summary from the worker: name + troops + tiles + alive. */
  private playerName = new Map<number, string>();
  private playerStat = new Map<
    number,
    { troops: number; tiles: number; alive: boolean }
  >();
  /** Front labels shipped this tick (cluster tiles + signed delta). */
  private frontLabelsData: ShellFrontLabel[] = [];
  /** Throttles the terrain season re-derive (GPU) to a few times/second. */
  private deriveClock = 0;
  /** People per full-density urban tile (from the worker, for hover). */
  private popPerDensity = 10000;
  /** Bot count for the OpenFront-live sim. */
  @state() private simBots = 50;
  /** Debounce timers for the in-panel game-mechanics knob edits. */
  private tunePending = new Map<
    keyof FoodConfig,
    ReturnType<typeof setTimeout>
  >();
  /** Local mirror of tuned FoodConfig knobs (the sim's config lives in the
   * worker; the panel tracks its own values and applies via a tune intent). */
  private foodOverrides = new Map<keyof FoodConfig, number>();
  /** Fraction of the human's troops committed per attack/boat. */
  @state() private attackRatio = 0.25;
  /** Whether the sim is still in the spawn phase (human must place a spawn). */
  @state() private inSpawn = true;
  /** Live readout of the human player (null until spawned / resolvable). */
  @state() private myStats: {
    troops: number;
    food: number;
    population: number;
    tiles: number;
    alive: boolean;
    farmSeeds: number;
    settlementSeeds: number;
    nextSeedRung: number;
  } | null = null;
  /** Selected buildable placed on the next tile click (null = attack mode). */
  @state() private buildType: UnitType | null = null;
  /** Per-player name anchors from the sim's placeName data (tile coords). */
  private nameAnchors: Record<string, { x: number; y: number; size: number }> =
    {};
  /** Dedupe repeated same-tile gestures within one drag stroke. */
  private lastGestureKey = -1;
  /** Whether the camera has been recentered on the human's spawn. */
  private centeredOnSpawn = false;
  /** Pooled on-map name labels (DOM overlay), keyed by PlayerID. */
  private labelPool = new Map<string, HTMLDivElement>();
  /** Pooled front imbalance labels (+N/-N), keyed by attack id + cluster. */
  private frontLabelPool = new Map<string, HTMLDivElement>();
  private recolorBusy = false;
  private recolorDirty = false;
  private deriveBusy = false;
  private viewCache = new Map<ShellViewKey, ImageBitmap>();

  connectedCallback(): void {
    // Terrain is the always-on base; the picker lists GAMES composed onto it
    // (plus "terrain" alone). The default is terrain on the big Earth map.
    this.systems = [
      terrainSystem,
      composeTerrain(openfront),
      composeTerrain(conquest),
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
    this.destroySim();
    super.disconnectedCallback();
  }

  private isOpenfront(): boolean {
    return this.systemId === openfront.id;
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

  // --- per-frame overlay ------------------------------------------------------

  /** Present the camera frame, then reposition the on-map labels (they must
   * track pan/zoom, which don't trigger a Lit re-render). */
  protected present(): void {
    super.present();
    this.updateLabels();
    this.updateFrontLabels();
    this.updateBuildPreview();
  }

  /**
   * Position a pooled `<div>` label (player name + troop count) over each living
   * player's placeName anchor, projected through the shell camera. The human's
   * label is accented. Off-screen labels are culled; stale ones removed.
   */
  private updateLabels(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    if (!container) return;
    if (!this.isOpenfront() || this.inSpawn) {
      if (this.labelPool.size > 0) {
        container.replaceChildren();
        this.labelPool.clear();
      }
      return;
    }
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cam = this.camera;
    const cwCss = canvas.width / dpr;
    const chCss = canvas.height / dpr;
    const seen = new Set<string>();
    for (const [sid, anchor] of Object.entries(this.nameAnchors)) {
      const id = Number(sid);
      const stat = this.playerStat.get(id);
      if (!stat || !stat.alive || stat.tiles === 0) continue;
      const cx = ((anchor.x - cam.cx) * cam.scale + canvas.width / 2) / dpr;
      const cy = ((anchor.y - cam.cy) * cam.scale + canvas.height / 2) / dpr;
      if (cx < -80 || cy < -40 || cx > cwCss + 80 || cy > chCss + 40) continue;
      seen.add(sid);
      let el = this.labelPool.get(sid);
      if (!el) {
        el = document.createElement("div");
        el.className =
          "absolute -translate-x-1/2 -translate-y-1/2 text-center leading-none whitespace-nowrap font-semibold";
        el.style.textShadow = "0 1px 3px rgba(0,0,0,0.95)";
        container.appendChild(el);
        this.labelPool.set(sid, el);
      }
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.fontSize = `${Math.max(9, Math.min(26, anchor.size * cam.scale * 0.6))}px`;
      el.style.color = id === this.mySmallID ? "#fde047" : "#ffffff";
      el.textContent = `${this.playerName.get(id) ?? "?"} · ${stat.troops}`;
    }
    for (const [sid, el] of this.labelPool) {
      if (!seen.has(sid)) {
        el.remove();
        this.labelPool.delete(sid);
      }
    }
  }

  /** Signed troop-imbalance labels at the human's active fronts (green ahead /
   * red behind), from the worker-shipped front summary. */
  private updateFrontLabels(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    if (!container) return;
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    if (!this.isOpenfront() || this.inSpawn || !canvas) {
      if (this.frontLabelPool.size > 0) {
        for (const el of this.frontLabelPool.values()) el.remove();
        this.frontLabelPool.clear();
      }
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const cam = this.camera;
    const cwCss = canvas.width / dpr;
    const chCss = canvas.height / dpr;
    const seen = new Set<string>();
    let i = 0;
    for (const fl of this.frontLabelsData) {
      let k = 0;
      for (const tile of fl.tiles) {
        const key = `${i}:${k++}`;
        const cx =
          (((tile % this.mapWidth) + 0.5 - cam.cx) * cam.scale +
            canvas.width / 2) /
          dpr;
        const cy =
          ((Math.floor(tile / this.mapWidth) + 0.5 - cam.cy) * cam.scale +
            canvas.height / 2) /
          dpr;
        if (cx < -60 || cy < -30 || cx > cwCss + 60 || cy > chCss + 30)
          continue;
        seen.add(key);
        let el = this.frontLabelPool.get(key);
        if (!el) {
          el = document.createElement("div");
          el.className =
            "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold text-sm px-1 rounded bg-black/55";
          el.style.textShadow = "0 1px 2px rgba(0,0,0,0.95)";
          container.appendChild(el);
          this.frontLabelPool.set(key, el);
        }
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.style.color = fl.delta >= 0 ? "#34d399" : "#f87171";
        el.textContent = signedTroops(fl.delta);
      }
      i++;
    }
    for (const [key, el] of this.frontLabelPool) {
      if (!seen.has(key)) {
        el.remove();
        this.frontLabelPool.delete(key);
      }
    }
  }

  /**
   * Placement preview (farm-growth spec): while a buildable is armed and the
   * map is hovered, outline the site — the full (2·farmRadius+1)² footprint
   * for Farmland, a single tile for Settlement — green when the sim's
   * canBuild allows it, red otherwise (spacing, unowned, water). Farmland
   * also shows the site's full-field potential fraction (the worker answers
   * with farmPotentialMilli / farmOutputMilli — the sim's own formula). The
   * box is camera-projected each frame like the labels, so it tracks pan/zoom.
   */
  private updateBuildPreview(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    if (!container) return;
    // updateLabels' replaceChildren may have detached a pooled box.
    if (this.previewEl && !this.previewEl.isConnected) this.previewEl = null;
    const hover = this.hoverTile;
    const buildType = this.buildType;
    if (
      !this.isOpenfront() ||
      this.inSpawn ||
      this.worker === null ||
      buildType === null ||
      hover === null
    ) {
      if (this.previewEl) {
        this.previewEl.remove();
        this.previewEl = null;
      }
      this.previewQueryTile = -1;
      return;
    }
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    if (!canvas) return;
    const tile = hover.y * this.mapWidth + hover.x;
    if (tile !== this.previewQueryTile) {
      this.previewQueryTile = tile;
      this.postWorker({ type: "preview", tile, unit: buildType });
    }
    const isFarm = buildType === UnitType.Farmland;
    const r = isFarm
      ? Math.max(0, Math.floor(this.foodValue("farmRadius")))
      : 0;
    const dpr = window.devicePixelRatio || 1;
    const cam = this.camera;
    const left = ((hover.x - r - cam.cx) * cam.scale + canvas.width / 2) / dpr;
    const top = ((hover.y - r - cam.cy) * cam.scale + canvas.height / 2) / dpr;
    const sizePx = ((2 * r + 1) * cam.scale) / dpr;

    let el = this.previewEl;
    if (!el) {
      el = document.createElement("div");
      el.className = "absolute pointer-events-none rounded-[2px]";
      const label = document.createElement("div");
      label.className =
        "absolute left-1/2 -translate-x-1/2 -top-6 whitespace-nowrap font-bold text-xs px-1 rounded bg-black/60";
      label.style.textShadow = "0 1px 2px rgba(0,0,0,0.95)";
      el.appendChild(label);
      container.appendChild(el);
      this.previewEl = el;
    }
    // The worker's answer for THIS tile; while it's in flight show neutral.
    const d = this.previewData;
    const known = d !== null && d.tile === tile && d.unit === buildType;
    const ok = known ? d.ok : null;
    const color =
      ok === null ? "rgba(255,255,255,0.6)" : ok ? "#34d399" : "#f87171";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${sizePx}px`;
    el.style.height = `${sizePx}px`;
    el.style.border = `2px solid ${color}`;
    el.style.background =
      ok === null
        ? "transparent"
        : ok
          ? "rgba(52,211,153,0.12)"
          : "rgba(248,113,113,0.15)";
    const label = el.firstElementChild as HTMLDivElement;
    if (isFarm && known && d) {
      label.style.display = "";
      label.style.color = color;
      label.textContent = `${Math.round(d.fraction * 100)}% potential`;
    } else {
      label.style.display = "none";
    }
  }

  // --- mount ------------------------------------------------------------------

  /** After a system mounts, terrain ALWAYS derives (the base); a game's layers
   * were already init'd by the base. Show a terrain view by default, then fit. */
  protected async onSystemMounted(mapData: MapData): Promise<void> {
    this.clearViewCache();
    this.tickCount = 0;
    this.tool = "pan"; // start in pan; the brush tool is opt-in per game
    this.destroySim();
    await this.deriveTerrain(mapData);
    if (this.isOpenfront()) {
      // OpenFront-live: run the REAL sim in a Web Worker and show its territory
      // overlay over the derived terrain. Drag pans, a click acts (no tool
      // select); the sim auto-runs so bots place spawns while the human picks.
      await this.startWorker();
      await this.applyGameView("openfront");
      this.tool = "pan";
      this.centeredOnSpawn = false;
      this.running = true;
      this.pendingFit = true;
      return;
    }
    // Default to a terrain view; the game overlay is opt-in via the picker.
    if (!VIEW_KEYS.includes(this.shellView)) this.shellView = "terrain";
    this.showingGame = false;
    await this.applyTerrainView(this.shellView);
    this.pendingFit = true;
  }

  // --- OpenFront-live sim bridge ----------------------------------------------

  /** Spin up the real core simulation for the current map (Singleplayer, N
   * bots, random spawn). No worker, no LocalServer, no HUD — it's ticked
   * directly from the viewer loop and read for per-tile ownership. */
  private async startWorker(): Promise<void> {
    this.destroySim();
    const mapType = GameMapType[this.mapKey as keyof typeof GameMapType];
    if (mapType === undefined) return;
    const n = this.mapWidth * this.mapHeight;
    this.ownerScratch = new Uint32Array(n);
    this.plotU32 = new Uint32Array(n);
    this.densityU32 = new Uint32Array(n);
    this.frontU32 = new Uint32Array(n);
    this.dirtyTiles.clear();
    this.nameAnchors = {};
    this.myStats = null;
    this.buildType = null;
    this.inSpawn = true;
    this.lastGestureKey = -1;
    this.mySmallID = 0;
    this.playerName.clear();
    this.playerStat.clear();
    this.frontLabelsData = [];
    this.tickReadout = 0;
    this.fertilityPlane = null;
    this.suitabilityPlane = null;
    this.previewData = null;
    this.previewQueryTile = -1;
    const { default: Worker } =
      await import("./webgpu/ShellSim.worker.ts?worker&inline");
    const worker = new Worker();
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<ShellSimOut>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        this.popPerDensity = msg.popPerDensity;
        this.fertilityPlane = msg.fertility;
        this.suitabilityPlane = msg.suitability;
        this.postWorker({
          type: "running",
          running: this.running,
          turbo: this.turbo,
        });
      } else if (msg.type === "frame") {
        this.onWorkerFrame(msg);
      } else if (msg.type === "preview") {
        this.previewData = msg;
      } else if (msg.type === "error") {
        this.status = msg.message;
      }
    };
    this.postWorker({
      type: "init",
      mapType,
      bots: this.simBots,
      cdnBase: getCdnBase(),
      assetManifest: getAssetManifest(),
    });
  }

  private postWorker(msg: ShellSimIn): void {
    this.worker?.postMessage(msg);
  }

  /** Apply a shipped conduit frame from the worker: write deltas into the GPU
   * buffers (run-merged), then refresh the shipped HUD/hover/label state. */
  private onWorkerFrame(f: ShellSimFrame): void {
    if (!this.kernel || !this.ownerScratch) return;
    // owner: [tile, state] pairs → owner = state & 0xfff.
    if (f.owner) {
      const a = f.owner;
      for (let k = 0; k + 1 < a.length; k += 2) {
        this.ownerScratch[a[k]] = a[k + 1] & 0xfff;
        this.markDirty("owner", a[k]);
      }
    }
    this.applyPairs("plot", this.plotU32, f.plot);
    this.applyPairs("front", this.frontU32, f.front);
    this.applyByte24("density", this.densityU32, f.density);
    this.flushDirty("owner", this.ownerScratch);
    this.flushDirty("plot", this.plotU32!);
    this.flushDirty("front", this.frontU32!);
    this.flushDirty("density", this.densityU32!);

    // Summaries.
    this.mySmallID = f.mySmallID;
    if (f.names) for (const nm of f.names) this.playerName.set(nm.id, nm.name);
    if (f.stats) {
      const s = f.stats;
      for (let i = 0; i + 3 < s.length; i += 4) {
        this.playerStat.set(s[i], {
          troops: s[i + 1],
          tiles: s[i + 2],
          alive: s[i + 3] === 1,
        });
      }
    }
    if (f.nameAnchors) this.nameAnchors = f.nameAnchors;
    this.frontLabelsData = f.fronts ?? [];
    if (this.inSpawn !== f.inSpawn) this.inSpawn = f.inSpawn;
    if (this.tickReadout !== f.tick) this.tickReadout = f.tick;
    this.tickCount = f.tick; // drives the terrain season phase
    const week = Math.floor(((f.tick % YEAR_TICKS) / YEAR_TICKS) * 52);
    if (week !== this.weekReadout) this.weekReadout = week;
    this.applyMyStats(f.myStats);
    if (!this.centeredOnSpawn && f.spawnAnchor !== null) {
      this.camera = {
        ...this.camera,
        cx: (f.spawnAnchor % this.mapWidth) + 0.5,
        cy: Math.floor(f.spawnAnchor / this.mapWidth) + 0.5,
        scale: Math.max(this.camera.scale, 6),
      };
      this.centeredOnSpawn = true;
    }
    this.needsRedraw = true;
  }

  private applyPairs(
    name: string,
    buf: Uint32Array | null,
    delta: Uint32Array | null,
  ): void {
    if (!buf || !delta) return;
    for (let k = 0; k + 1 < delta.length; k += 2) {
      buf[delta[k]] = delta[k + 1];
      this.markDirty(name, delta[k]);
    }
  }

  private applyByte24(
    name: string,
    buf: Uint32Array | null,
    delta: Uint32Array | null,
  ): void {
    if (!buf || !delta) return;
    for (let k = 0; k < delta.length; k += 1) {
      const t = delta[k] & 0x00ffffff;
      buf[t] = (delta[k] >>> 24) & 0xff;
      this.markDirty(name, t);
    }
  }

  /** Store the shipped human stats + auto-drop the build tool when it becomes
   * unaffordable. */
  private applyMyStats(s: ShellSimFrame["myStats"]): void {
    this.myStats = s;
    if (s && this.buildType !== null && this.seedsFor(this.buildType) <= 0) {
      this.buildType = null;
    }
  }

  /** Banked seeds for a shell-placeable structure (seed-ladder spec). */
  private seedsFor(type: UnitType): number {
    const s = this.myStats;
    if (s === null) return 0;
    if (type === UnitType.Settlement) return s.settlementSeeds;
    if (type === UnitType.Farmland) return s.farmSeeds;
    return 0;
  }

  /** Mark a tile index dirty for a conduit's next partial upload. */
  private markDirty(name: string, i: number): void {
    let a = this.dirtyTiles.get(name);
    if (!a) {
      a = [];
      this.dirtyTiles.set(name, a);
    }
    a.push(i);
  }

  /**
   * Upload a conduit's changed tiles as merged contiguous runs — cheap whether
   * the changes are localized (few runs) or scattered (many tiny runs), and a
   * single full upload when nearly everything changed. Avoids re-DMAing a whole
   * 8.4M-tile buffer to write a few hundred tiles.
   */
  private flushDirty(name: string, arr: Uint32Array): void {
    const a = this.dirtyTiles.get(name);
    this.dirtyTiles.delete(name);
    if (!a || a.length === 0 || !this.kernel) return;
    // Too many changes to be worth run-merging → one full upload.
    if (a.length > arr.length >> 4) {
      this.kernel.writeBuffer(name, arr);
      return;
    }
    a.sort((x, y) => x - y);
    let start = a[0];
    let prev = a[0];
    for (let k = 1; k < a.length; k += 1) {
      const t = a[k];
      if (t === prev) continue; // duplicate
      if (t === prev + 1) {
        prev = t; // extend the run
        continue;
      }
      this.kernel.writeBufferU32Range(name, arr, start, prev);
      start = t;
      prev = t;
    }
    this.kernel.writeBufferU32Range(name, arr, start, prev);
  }

  private destroySim(): void {
    for (const t of this.tunePending.values()) clearTimeout(t);
    this.tunePending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.ownerScratch = null;
    this.fertilityPlane = null;
    this.suitabilityPlane = null;
    this.previewData = null;
    this.previewQueryTile = -1;
    this.plotU32 = null;
    this.densityU32 = null;
    this.frontU32 = null;
    this.dirtyTiles.clear();
    this.playerName.clear();
    this.playerStat.clear();
    this.frontLabelsData = [];
    this.clearLabels();
  }

  private clearLabels(): void {
    this.querySelector("#shell-labels")?.replaceChildren();
    this.labelPool.clear();
    this.frontLabelPool.clear();
    this.previewEl = null;
  }

  /** Queue a human intent (spawn/build/food/tune — no Game reads) via the worker. */
  private queueIntent(intent: Intent): void {
    this.postWorker({ type: "intent", intent });
  }

  /** OpenFront-live acts on a discrete click (drag pans, click acts) — no tool
   * select. Cellular games keep the Pan/Brush toggle for tile painting. */
  protected hasClickAction(): boolean {
    return this.isOpenfront() || super.hasClickAction();
  }

  /** New click/stroke → allow re-acting on the same tile (repeated attacks). */
  protected onStrokeStart(): void {
    this.lastGestureKey = -1;
  }

  /** Play/pause + turbo drive the WORKER's tick loop for OpenFront-live (the
   * base's pump() path ticks GPU layers, which openfront doesn't have). */
  protected toggleRunning(): void {
    if (!this.isOpenfront()) return super.toggleRunning();
    this.running = !this.running;
    this.postWorker({
      type: "running",
      running: this.running,
      turbo: this.turbo,
    });
  }

  protected setTurbo(on: boolean): void {
    if (!this.isOpenfront()) return super.setTurbo(on);
    this.turbo = on;
    this.postWorker({
      type: "running",
      running: this.running,
      turbo: this.turbo,
    });
  }

  /**
   * A click at map-tile coords in OpenFront-live: spawn during the spawn phase,
   * else attack (or boat over water) the tile. Returns true when it acted (so
   * the base does not pan). Other systems fall back to the base brush routing.
   */
  protected onTileGesture(x: number, y: number, event: PointerEvent): boolean {
    if (!this.isOpenfront()) return super.onTileGesture(x, y, event);
    if (!this.worker) return false;
    if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight)
      return false;
    // Dedupe repeated hits on the same tile while dragging a stroke.
    const tile = y * this.mapWidth + x; // TileRef === y*w+x
    if (tile === this.lastGestureKey) return true;
    this.lastGestureKey = tile;

    // Post a semantic action; the worker validates + resolves against the Game.
    if (this.inSpawn) {
      this.queueIntent({ type: "spawn", tile });
      return true;
    }
    if (!this.myStats?.alive) return false;
    if (this.buildType !== null) {
      this.queueIntent({ type: "build_unit", unit: this.buildType, tile });
      return true;
    }
    this.postWorker({ type: "act", tile, ratio: this.attackRatio });
    return true;
  }

  /** Restart the sim with the current bot count and re-show the overlay. */
  private async restartSim(): Promise<void> {
    if (!this.isOpenfront() || !this.kernel) return;
    this.running = false;
    for (const b of ["owner", "plot", "density", "front"]) {
      this.kernel.clearBuffer(b);
    }
    await this.startWorker();
    await this.applyGameView("openfront");
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
    if (!this.kernel || !this.compiled || this.recolorBusy) return;
    // OpenFront-live: the sim runs in the worker; this is render-only. The view
    // reads the conduits (uploaded in onWorkerFrame) + the terrain tint; the
    // season re-derive is throttled to a few times/second (GPU cost bound).
    if (this.isOpenfront()) {
      this.renderOpenfront();
      return;
    }
    if (ticks <= 0) return;
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
    if (this.derivedOk) this.compiled.runDerive(frame, "season");
    if (this.hasGame()) {
      for (let t = 0; t < ticks; t += 1)
        this.compiled.runTick(this.kernel, frame);
    }
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

  /** Render the OpenFront-live overlay from the (already-uploaded) conduits;
   * the terrain season derive runs only every Nth frame (GPU throttle). */
  private renderOpenfront(): void {
    if (!this.kernel || !this.compiled) return;
    this.inFlight = true;
    const doDerive =
      this.derivedOk && this.deriveClock++ % SEASON_DERIVE_EVERY === 0;
    if (doDerive) this.writeTP("terrain");
    const frame = this.kernel.beginFrame();
    if (doDerive) this.compiled.runDerive(frame, "season");
    this.compiled.runView(frame, this.view);
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
    // OpenFront-live: a rich game + terrain readout.
    if (this.isOpenfront()) return this.openfrontHoverRows(hx, hy);
    if (!this.isTerrain()) return super.hoverRows(hx, hy);
    return this.terrainHoverRows(hx, hy) ?? super.hoverRows(hx, hy);
  }

  /** The terrain readout (elevation/surface/climate/biome) from the derived
   * source fields; null when the derivation isn't available. Shared by the
   * terrain view and the OpenFront-live info box. */
  private terrainHoverRows(hx: number, hy: number): [string, string][] | null {
    const tile = { x: hx, y: hy };
    const f = this.hoverFields;
    if (!f || !this.derivedOk) return null;
    if (hx < 0 || hy < 0 || hx >= this.mapWidth || hy >= this.mapHeight)
      return null;
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

  /** Rich hover readout for OpenFront-live: tile ownership + structure + soil,
   * followed by the terrain detail (elevation/climate/biome). */
  private openfrontHoverRows(hx: number, hy: number): [string, string][] {
    const rows: [string, string][] = [["tile", `${hx}, ${hy}`]];
    if (hx < 0 || hy < 0 || hx >= this.mapWidth || hy >= this.mapHeight) {
      return rows;
    }
    const i = hy * this.mapWidth + hx;
    // Everything reads the main-thread conduit buffers + the shipped player
    // table — no Game access (the sim is in the worker).
    const isOcean = this.hoverFields?.waterMask?.[i] === 1;
    if (!isOcean && this.ownerScratch) {
      const ownerId = this.ownerScratch[i];
      if (ownerId === 0) {
        rows.push(["owner", "unclaimed"]);
      } else {
        const isMe = ownerId === this.mySmallID;
        const name = this.playerName.get(ownerId) ?? "?";
        rows.push(["owner", `${name}${isMe ? " (you)" : ""}`]);
        const st = this.playerStat.get(ownerId);
        if (st) rows.push(["troops", String(st.troops)]);
      }
      const p = this.plotU32?.[i] ?? 0;
      if (p === 1) rows.push(["structure", "Settlement"]);
      else if (p === 3) rows.push(["structure", "Barn"]);
      else if (p === 2) rows.push(["structure", "Farmland"]);
      const dens = this.densityU32?.[i] ?? 0;
      if (dens > 0) {
        const pop = Math.round((dens / 255) * this.popPerDensity);
        rows.push(["urban", `${compactNum(pop)} pop`]);
      }
      // The sim's baked fertility + suitability bytes as the 0..1 values it
      // reads (farm production / city growth).
      if (this.fertilityPlane) {
        rows.push(["fertility", (this.fertilityPlane[i] / 255).toFixed(2)]);
      }
      if (this.suitabilityPlane) {
        rows.push(["suitability", (this.suitabilityPlane[i] / 255).toFixed(2)]);
      }
    }
    // Append the terrain detail (skip the duplicate tile / lat-lon rows).
    const terrain = this.terrainHoverRows(hx, hy);
    if (terrain) {
      for (const r of terrain) {
        if (r[0] !== "tile" && r[0] !== "lat / lon") rows.push(r);
      }
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
          class="absolute inset-0 w-full h-full touch-none ${this.hasBrushPainting() &&
          this.tool === "brush"
            ? "cursor-crosshair"
            : this.isOpenfront()
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

        <!-- On-map name/troop labels (imperatively positioned each frame in
             updateLabels(); a static node Lit won't reconcile children of). -->
        <div
          id="shell-labels"
          class="absolute inset-0 pointer-events-none overflow-hidden"
        ></div>

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
          ${this.isOpenfront()
            ? html`<label
                class="flex items-center gap-1 text-white/80"
                title="Bot count — applied on restart"
              >
                bots
                <input
                  type="number"
                  min="0"
                  max="400"
                  class="w-16 bg-black/40 border border-white/20 px-1 py-0.5 text-white"
                  .value=${String(this.simBots)}
                  @change=${(e: Event) => {
                    const n = (e.target as HTMLInputElement).valueAsNumber;
                    this.simBots = Math.max(0, Math.min(400, n || 0));
                    void this.restartSim();
                  }}
                />
              </label>`
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
          ${this.hasBrushPainting()
            ? html`<div class="flex items-center gap-1">
                <button
                  class="border border-white/20 px-2 py-1 hover:bg-white/10 ${this
                    .tool === "pan"
                    ? "bg-white/15"
                    : ""}"
                  title="Pan tool (drag to move the map)"
                  @click=${() => (this.tool = "pan")}
                >
                  ✋ pan
                </button>
                <button
                  class="border border-white/20 px-2 py-1 hover:bg-white/10 ${this
                    .tool === "brush"
                    ? "bg-white/15"
                    : ""}"
                  title="Brush tool (drag on the map to paint)"
                  @click=${() => (this.tool = "brush")}
                >
                  🖌 brush
                </button>
              </div>`
            : null}
          ${this.tool === "brush" && (compiled?.brushNames.length ?? 0) > 0
            ? html`<select
                class="bg-black/40 border border-white/20 px-2 py-1 text-white"
                title="Active brush"
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
              </select>`
            : null}
          ${this.derivedNote
            ? html`<span class="text-amber-300/80">${this.derivedNote}</span>`
            : null}
          ${this.status
            ? html`<span class="text-amber-300">${this.status}</span>`
            : null}
        </div>

        ${this.isOpenfront() ? this.renderPlayerHud() : null}
        ${game && !this.isOpenfront() ? this.renderSimPanel() : null}
        ${this.showKnobs && this.derivedOk && this.derivedConfig
          ? this.renderKnobs(this.derivedConfig)
          : null}
      </section>
    `;
  }

  /** OpenFront-live human HUD: spawn prompt, live stats, attack-ratio. */
  private renderPlayerHud() {
    const s = this.myStats;
    const stat = (label: string, value: string | number) => html`
      <div class="flex flex-col items-center px-2">
        <span class="text-white/50 text-[10px] uppercase tracking-wide"
          >${label}</span
        >
        <span class="text-white/95 tabular-nums text-base">${value}</span>
      </div>
    `;
    return html`
      ${this.inSpawn
        ? html`<div
            class="absolute top-24 left-1/2 -translate-x-1/2 text-center pointer-events-none"
          >
            <div
              class="inline-block bg-black/70 backdrop-blur px-4 py-2 rounded text-white text-lg font-semibold"
            >
              Click land to place your spawn
            </div>
          </div>`
        : null}
      ${s && s.alive && !this.inSpawn ? this.renderBuildBar(s) : null}
      <div
        class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 text-sm text-white bg-black/70 backdrop-blur px-4 py-2 rounded"
      >
        ${s && !s.alive
          ? html`<span class="text-red-400 font-semibold px-2">Defeated</span>`
          : null}
        ${stat("troops", s ? s.troops : "—")}
        ${stat("pop", s ? s.population : "—")} ${stat("food", s ? s.food : "—")}
        ${stat("tiles", s ? s.tiles : "—")}
        <div class="flex flex-col gap-0.5 pl-3 border-l border-white/15 w-40">
          <div class="flex justify-between text-[10px] text-white/60">
            <span>attack</span>
            <span class="tabular-nums"
              >${Math.round(this.attackRatio * 100)}%</span
            >
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            .value=${String(this.attackRatio)}
            @input=${(e: Event) =>
              (this.attackRatio = (e.target as HTMLInputElement).valueAsNumber)}
          />
        </div>
      </div>
    `;
  }

  /** Build bar (seed-placed structures + the ladder readout), above the
   *  stats (seed-ladder spec). */
  private renderBuildBar(s: NonNullable<GameShellPage["myStats"]>) {
    const buildBtn = (type: UnitType) => {
      const active = this.buildType === type;
      const seeds = this.seedsFor(type);
      return html`<button
        class="border border-white/20 px-2 py-1 rounded hover:bg-white/10 disabled:opacity-40 ${active
          ? "bg-emerald-500/30 border-emerald-300/60"
          : ""}"
        ?disabled=${seeds <= 0}
        title=${`Place a ${type} (uses one seed)`}
        @click=${() => (this.buildType = active ? null : type)}
      >
        ${type} <span class="text-white/60 tabular-nums">${seeds}</span>
      </button>`;
    };
    return html`
      <div
        class="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-white bg-black/70 backdrop-blur px-3 py-1.5 rounded"
      >
        ${buildBtn(UnitType.Settlement)} ${buildBtn(UnitType.Farmland)}
        <span class="text-white/60 tabular-nums px-1"
          >next pair at ${compactNum(s.nextSeedRung)}</span
        >
        ${this.buildType
          ? html`<span class="text-emerald-300 px-1"
              >placing ${this.buildType} — click a tile</span
            >`
          : null}
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
                ([name, value]) =>
                  html`<div class="flex justify-between gap-3">
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
                >${(this.paramValues[param.name] ?? param.value).toFixed(
                  2,
                )}</span
              >
            </label>
          `,
        )}
      </div>
    `;
  }

  // --- OpenFront-live game-mechanics tuning (in the climate panel) -----------

  /** The tuned value of a FoodConfig knob (local mirror; the sim's config is in
   * the worker). */
  private foodValue(key: keyof FoodConfig): number {
    return this.foodOverrides.get(key) ?? FOOD_DEFAULTS[key];
  }

  /** Pin one knob: mirror it locally AND send a tune_food_config intent to the
   * worker (which applies it to the sim's Config). */
  private applyFoodKnob(key: keyof FoodConfig, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.foodOverrides.set(key, value);
    this.queueIntent({ type: "tune_food_config", key, value });
    this.requestUpdate();
  }

  private onFoodKnobInput(key: keyof FoodConfig, e: Event): void {
    const value = Number((e.target as HTMLInputElement).value);
    const existing = this.tunePending.get(key);
    if (existing !== undefined) clearTimeout(existing);
    this.tunePending.set(
      key,
      setTimeout(() => {
        this.tunePending.delete(key);
        this.applyFoodKnob(key, value);
      }, 300),
    );
  }

  /** All FoodConfig knobs in display groups; unknown keys land in "other". */
  private foodKnobGroups(): [string, (keyof FoodConfig)[]][] {
    const listed = new Set(TUNING_GROUPS.flatMap(([, keys]) => keys));
    const rest = FOOD_TUNABLE_KEYS.filter((k) => !listed.has(k));
    const groups = TUNING_GROUPS.map(
      ([labelKey, keys]) =>
        // The shell uses raw labels; strip the i18n key prefix.
        [labelKey.replace("tuning_panel.group_", ""), keys] as [
          string,
          (keyof FoodConfig)[],
        ],
    );
    if (rest.length > 0) groups.push(["other", rest]);
    return groups;
  }

  /** Game-mechanics knob rows for the climate panel (OpenFront-live only). */
  private renderGameKnobs() {
    const modifiedKeys = FOOD_TUNABLE_KEYS.filter(
      (k) => this.foodValue(k) !== FOOD_DEFAULTS[k],
    );
    const row = (key: keyof FoodConfig) => {
      const modified = this.foodValue(key) !== FOOD_DEFAULTS[key];
      return html`
        <div
          class="flex items-center gap-1 py-px ${modified
            ? "text-amber-300"
            : "text-white/80"}"
          title="default: ${FOOD_DEFAULTS[key]}"
        >
          <span class="flex-1 truncate font-mono text-[11px]">${key}</span>
          ${modified
            ? html`<button
                class="text-[10px] px-1 rounded bg-white/10 hover:bg-white/20"
                @click=${() => this.applyFoodKnob(key, FOOD_DEFAULTS[key])}
              >
                reset
              </button>`
            : null}
          <input
            type="number"
            step="any"
            min="0"
            class="w-24 px-1 py-0 text-right text-[11px] tabular-nums bg-black/40 border rounded ${modified
              ? "border-amber-400"
              : "border-white/20"} text-white"
            .value=${String(this.foodValue(key))}
            @input=${(e: Event) => this.onFoodKnobInput(key, e)}
          />
        </div>
      `;
    };
    return html`
      <div
        class="flex items-center justify-between pt-2 mt-1 border-t border-white/15"
      >
        <span class="font-bold text-white/90">game mechanics</span>
        ${modifiedKeys.length > 0
          ? html`<button
              class="text-[10px] px-1.5 py-0.5 rounded bg-amber-700 hover:bg-amber-600"
              @click=${() => {
                for (const k of modifiedKeys)
                  this.applyFoodKnob(k, FOOD_DEFAULTS[k]);
              }}
            >
              reset all
            </button>`
          : null}
      </div>
      ${this.foodKnobGroups().map(
        ([label, keys]) => html`
          <div class="mt-1">
            <div
              class="text-[10px] uppercase tracking-wide text-white/50 border-b border-white/15 mb-0.5"
            >
              ${label}
            </div>
            ${keys.map(row)}
          </div>
        `,
      )}
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
        class="absolute top-16 right-3 flex flex-col gap-1.5 text-xs text-white bg-black/60 backdrop-blur px-3 py-3 rounded w-80 max-h-[calc(100vh-6rem)] overflow-y-auto"
        @wheel=${(e: Event) => e.stopPropagation()}
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
        ${this.isOpenfront() && this.worker ? this.renderGameKnobs() : null}
      </div>
    `;
  }
}

// Signed, abbreviated troop delta for front labels: +1.2k / -340.
function signedTroops(n: number): string {
  return (n >= 0 ? "+" : "-") + compactNum(Math.abs(n));
}

// Abbreviate a magnitude: 1234 → "1.2k", 12 → "12".
function compactNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
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
