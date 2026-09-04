import { html, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getAssetManifest, getCdnBase } from "../core/AssetUrls";
import {
  FOOD_DEFAULTS,
  FOOD_TUNABLE_KEYS,
  type FoodConfig,
} from "../core/configuration/FoodConfig";
import { borderSegment } from "../core/execution/utils/BorderSegment";
import { GameMapType, UnitType } from "../core/game/Game";
import type { MapData } from "../core/game/GameMapLoader";
import { UserSettings } from "../core/game/UserSettings";
import type { Intent } from "../core/Schemas";
import {
  normalizeFoundationWorldEngineMapConfig,
  type FoundationWorldEngineMapConfig,
} from "../games/alternative/world/WorldEngineElevation";
import {
  getLiveGame,
  LIVE_GAMES,
  type LiveGameDefinition,
} from "./games/registry";
import {
  flagForSeed,
  loadFlagCatalog,
  resolveFlagUrl,
  type FlagEntry,
} from "./flags/FlagCatalog";
import { findFoodPreset, foodPresets, presetKnobChanges } from "./FoodPresets";
import { TUNING_GROUPS } from "./hud/layers/TuningPanel";
import { conquest } from "./lab/systems/conquest/system";
import { empire } from "./lab/systems/empire/system";
import { grazing } from "./lab/systems/grazing/system";
import { settlement } from "./lab/systems/settlement/system";
import {
  composeTerrain,
  terrain as terrainSystem,
} from "./lab/systems/terrain/system";
import { CameraRenderer } from "./shell/CameraRenderer";
import { KNOB_HELP } from "./shell/KnobHelp";
import {
  buildViewBitmap,
  SHELL_VIEWS,
  type ShellView,
} from "./shell/MapLayerViews";
import { themeProvider } from "./theme/ThemeProvider";
import type { PlayerView } from "./view";
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
/** localStorage key for the climate knobs (survives a page refresh). */
const CLIMATE_STORE_KEY = "openfront.shell.climate";

/** Ints per player in the worker's packed `stats` array. */
const STAT_STRIDE = 7;
/** Samples kept per series (the sparkline's width in points). */
const HISTORY_LEN = 80;
/** Sim ticks between samples — ~8s of history at 10 ticks/s. */
const HISTORY_EVERY = 10;

interface PlayerHistory {
  troops: number[];
  tiles: number[];
  food: number[];
  balance: number[];
}

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
// clock with brushes and generic param/scalar panels. Two entries are LIVE
// games — OpenFront and its LeanFront fork — driven by the real CPU sim in the
// ShellSim worker; the registry lookup gates that whole path. The shared machinery
// (headless kernel on the camera's device, tick loop, turbo, brushes) lives in
// FieldViewerBase; this page adds the camera, the terrain derivation on the
// base kernel, and the terrain-specific panels. Baked terrain-colors.png (via
// MapLayerViews) is the fallback when the derivation is unavailable.

/** Ticks per in-world year — drives the terrain seasonal clock. */
const YEAR_TICKS = 520;

/** Re-derive the terrain season every Nth OpenFront-live render frame — the
 * season changes slowly, so this bounds the GPU derive cost on huge maps. */
const SEASON_DERIVE_EVERY = 8;
/** Per-frame approach rate for the territory mask fade (~1s at 60fps). */
const MASK_FADE_RATE = 0.05;
/** Zoom the camera settles at when you place your spawn. */
const SETTLE_ZOOM = 20;
/** Per-frame approach rate for the camera fly-to. */
const CAMERA_TWEEN_RATE = 0.08;
/**
 * How long the camera stays on one place, in milliseconds. Deliberately wall
 * clock rather than a step count: the ambient step runs on the shell's redraw
 * cadence, which swings with load (measured anywhere from ~13/s to ~85/s), so
 * counting steps gave shot lengths between 2 seconds and 69.
 */
const AMBIENT_HOLD_MS = 15000;
/** Tiles per second the camera coasts along its arrival bearing. */
const AMBIENT_DRIFT_PER_S = 0.5;
/** Farthest the camera travels between shots, in tiles. Past this a move stops
 *  reading as a pan and becomes a cut across the world. */
const AMBIENT_MAX_HOP = 90;
/** Zoom the ambient camera frames a shot at — close enough to read borders
 *  and combat rather than looking at a world map. */
const AMBIENT_ZOOM = 22;
/** Map the backdrop runs. Smaller = faster boot and less memory. */
const AMBIENT_MAP = "EarthMini";

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
  /** The game-mechanics knob whose help box is hovered (with cursor y), or
   *  null. Drives the description tooltip beside the climate popover. */
  @state() private knobTip: { key: keyof FoodConfig; y: number } | null = null;
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
  private readonly playerFill = new Uint32Array(256);
  private readonly playerBorder = new Uint32Array(256);
  private plotU32: Uint32Array | null = null;
  /** Byte mirror of the plot conduit for the camera's sub-tile sprite
   *  plane (farmland tilled rows — see CameraRenderer.plotPlane). */
  private plotBytes: Uint8Array | null = null;
  private plotBytesDirty = false;
  /** The mounted map's data source — feeds the baked-terrain upload. */
  private currentMapData: MapData | null = null;
  /** True once the baked terrain-colors plane replaced the derived tint for
   *  OpenFront-live (1:1 with the WebGL game's TerrainPass base). */
  private bakedTintOn = false;
  /** The human's border tiles from the worker (segment-highlight source).
   *  A plain array: borderSegment's map-to-objects silently coerces to
   *  zeros on a typed array. */
  private myBorderTiles: number[] | null = null;
  /** The aimed-segment conduit mirror + currently lit tiles. */
  private highlightU32: Uint32Array | null = null;
  private litHighlight: number[] = [];
  private lastSegKey = -1;
  private densityU32: Uint32Array | null = null;
  private frontU32: Uint32Array | null = null;
  /** Combat-scar conduit (rework-settlement-ecology): 0..255 damage per tile. */
  private damageU32: Uint32Array | null = null;
  /** Human supply-quality conduit (add-supply-lines): 0 out of supply, else
   *  1..255 quality — drives the toggleable supply overlay + hover readout. */
  private supplyU32: Uint32Array | null = null;
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
    {
      troops: number;
      tiles: number;
      alive: boolean;
      food: number;
      production: number;
      consumption: number;
    }
  >();
  /** Rolling per-player series behind the stats panel's sparklines. */
  private history = new Map<number, PlayerHistory>();
  private lastSampleTick = -1;
  @state() private showStats = true;
  /**
   * Ambient mode: the shell rendered as a live backdrop (the front page). No
   * toolbar, HUD, panels, labels or input — just the world, warming itself up
   * in turbo and a camera that drifts toward wherever the fighting is. Reusing
   * the real shell rather than a second renderer means the backdrop is always
   * the current build, and the sim is already warm when you press Start.
   */
  @property({ type: Boolean, reflect: true }) ambient = false;
  /** Counter seeding which shot gets picked next (no longer a pacing clock). */
  private ambientClock = 0;
  private ambientTarget: { cx: number; cy: number; scale: number } | null =
    null;
  /** Unit bearing of the last camera move; the drift continues along it. Null
   *  until the first move, so the opening shot holds still rather than sliding
   *  off in an arbitrary direction. */
  private ambientHeading: { dx: number; dy: number } | null = null;
  /** Whether the opening shot has been framed (we snap, never ease, into it). */
  private ambientFramed = false;
  /** Wall-clock marks for the shot hold and the per-second drift. */
  private ambientShotAt = 0;
  private ambientLastStep = 0;
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
  /** Last swept preset applied, so the dropdown reflects what is loaded. */
  private activeFoodPreset: string | null = null;
  /** Fraction of the human's troops committed per attack/boat. */
  @state() private attackRatio = 0.25;
  /** Whether the sim is still in the spawn phase (human must place a spawn). */
  @state() private inSpawn = true;
  /** Live readout of the human player (null until spawned / resolvable). */
  @state() private myStats: {
    troops: number;
    food: number;
    population: number;
    starved: number;
    tiles: number;
    alive: boolean;
    farmSeeds: number;
    settlementSeeds: number;
  } | null = null;
  /** Selected buildable placed on the next tile click (null = attack mode). */
  @state() private buildType: UnitType | null = null;
  /** Dedupe repeated same-tile gestures within one drag stroke. */
  private lastGestureKey = -1;
  /** Whether the camera has been recentered on the human's spawn. */
  private centeredOnSpawn = false;
  /** Camera destination while flying to the spawn; null when idle. */
  private cameraTween: { cx: number; cy: number; scale: number } | null = null;
  /** Where each nation will land (spawn phase only). */
  private nationSpawns: {
    x: number;
    y: number;
    name: string;
    flag?: string;
  }[] = [];
  /** Pooled markers for those landing sites. */
  private nationSpawnPool = new Map<string, HTMLDivElement>();
  /** Pooled on-map name labels (DOM overlay), keyed by PlayerID. */
  /** The single cursor-following nation chip (replaces the name-label pool). */
  private hoverChipEl: HTMLDivElement | null = null;
  /** Flag library (cosmetic, client-only) + per-player resolved flag URLs.
   *  Every nation gets a deterministic flag (seeded by its name); the human uses
   *  the flag they picked on the front page. Never touches the sim. */
  private flagCatalog: FlagEntry[] = [];
  private flagCatalogLoading = false;
  private playerFlagUrl = new Map<number, string | null>();
  /** Authored flag ref per player (from a map's nation `flag` field), if any. */
  private playerAuthoredFlag = new Map<number, string>();
  private flagSettings = new UserSettings();
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
      ...LIVE_GAMES.map(({ system }) => composeTerrain(system)),
      composeTerrain(conquest),
      composeTerrain(grazing),
      composeTerrain(settlement),
      composeTerrain(empire),
    ];
    // The shell opens on the actual game, not the terrain viewer.
    this.systemId = LIVE_GAMES[0].id;
    // The backdrop runs a smaller world than the playable default: measured
    // ~0.9s to a ticking sim and 231MB, against 3.2s / 340MB for full Earth.
    this.mapKey = this.hasAttribute("ambient") ? AMBIENT_MAP : "SPQR";
    this.restoreClimateState();
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
    if (this.hasAttribute("ambient")) {
      window.addEventListener("showPage", this.onAmbientPageChange);
    }
  }

  private onAmbientPageChange = (e: Event): void => {
    const page = (e as CustomEvent<string>).detail;
    if (page === "page-play") {
      if (!this.kernel) void this.loadWorld();
    } else {
      this.destroySim();
    }
  };

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("showPage", this.onAmbientPageChange);
    this.clearViewCache();
    this.destroySim();
    super.disconnectedCallback();
  }

  private selectedLiveGame(): LiveGameDefinition | undefined {
    return getLiveGame(this.systemId);
  }

  private liveGameView(): string {
    return this.selectedLiveGame()!.view;
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
    // The ambient backdrop is the exact opposite: it must sit UNDER the menu,
    // and it is pointer-events-none, so hit-testing hid this from every check
    // that only asked "is the button clickable".
    this.style.zIndex = this.ambient ? "0" : "9999";
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
    this.updateHoverChip();
    this.updateNationSpawnMarkers();
    this.updateFrontLabels();
    this.updateBuildPreview();
    this.updateSegmentHighlight();
  }

  /** Load the flag library once (lazy). Clears the per-player URL cache so any
   *  labels drawn before the fetch resolved pick up their flags next frame. */
  private ensureFlagCatalog(): void {
    if (this.flagCatalogLoading) return;
    this.flagCatalogLoading = true;
    void loadFlagCatalog().then((c) => {
      this.flagCatalog = c;
      this.playerFlagUrl.clear();
    });
  }

  /** Resolved flag URL for a player slot: the human's chosen flag, else a
   *  deterministic pick seeded by the nation's name. Null until the catalog
   *  loads (label renders name-only). */
  private flagUrlFor(id: number): string | null {
    if (this.flagCatalog.length === 0) return null;
    const cached = this.playerFlagUrl.get(id);
    if (cached !== undefined) return cached;
    const seed = this.playerName.get(id) ?? String(id);
    const authored = this.playerAuthoredFlag.get(id);
    // Precedence: the human's own pick → an authored map flag → a deterministic
    // pick seeded by name. (The human's nation has no authored flag.)
    const ref =
      id === this.mySmallID
        ? (this.flagSettings.getFlag() ??
          authored ??
          flagForSeed(this.flagCatalog, seed))
        : (authored ?? flagForSeed(this.flagCatalog, seed));
    const url = resolveFlagUrl(ref);
    this.playerFlagUrl.set(id, url);
    return url;
  }

  /**
   * Nation readout, on demand (replaces the always-on name + troop labels that
   * covered the map once enough players existed). Hovering another nation's
   * land shows one small chip beside the cursor — same treatment as the
   * front-imbalance chips — with its name and population.
   */
  private updateHoverChip(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    const hide = () => {
      this.hoverChipEl?.remove();
      this.hoverChipEl = null;
      // Nothing being inspected → the mask returns to normal.
      this.paramValues.hoveredPlayer = 0;
    };
    if (
      !container ||
      !canvas ||
      this.selectedLiveGame() === undefined ||
      this.inSpawn
    ) {
      hide();
      return;
    }
    const hover = this.hoverTile;
    const at = this.hoverClient;
    if (hover === null || at === null) {
      hide();
      return;
    }
    const tile = hover.y * this.mapWidth + hover.x;
    const owner = this.ownerScratch?.[tile] ?? 0;
    // Only other nations — your own land needs no label, neutral has none.
    if (owner === 0 || owner === this.mySmallID) {
      hide();
      return;
    }
    const stat = this.playerStat.get(owner);
    if (!stat || !stat.alive) {
      hide();
      return;
    }
    let el = this.hoverChipEl;
    if (!el) {
      el = document.createElement("div");
      // Same chip styling as the front-imbalance labels; flex so the flag sits
      // inline before the name.
      el.className =
        "absolute inline-flex items-center gap-1 whitespace-nowrap font-bold text-sm px-1 rounded bg-black/55 pointer-events-none";
      el.style.textShadow = "0 1px 2px rgba(0,0,0,0.95)";
      el.style.color = "#ffffff";
      const img = document.createElement("img");
      img.className = "h-3.5 w-auto rounded-[1px]";
      img.alt = "";
      img.style.display = "none";
      img.onerror = () => {
        img.style.display = "none";
      };
      const span = document.createElement("span");
      el.append(img, span);
      container.appendChild(el);
      this.hoverChipEl = el;
    }
    // Reveal this nation in the overlay (mask off, white outline) and dip our
    // own land, so the chip and the highlight always agree on the subject.
    this.paramValues.hoveredPlayer = owner;
    const rect = canvas.getBoundingClientRect();
    // Offset off the cursor so the chip never sits under the pointer.
    el.style.left = `${at.x - rect.left + 14}px`;
    el.style.top = `${at.y - rect.top - 10}px`;
    const img = el.querySelector("img")!;
    const flagUrl = this.flagUrlFor(owner);
    if (flagUrl) {
      if (img.getAttribute("src") !== flagUrl) img.src = flagUrl;
      img.style.display = "";
    } else {
      img.style.display = "none";
    }
    // Troops ARE the population in this economy, so one number covers both.
    el.querySelector("span")!.textContent = `${
      this.playerName.get(owner) ?? "?"
    } · ${compactNum(Math.round(stat.troops))}`;
  }

  /**
   * Live strategy readout (lower right). Each row is one series as a
   * sparkline, because the LEVELS are already on the bottom HUD — the only new
   * information here is the shape over time.
   *
   * When you hover a nation its series are drawn on YOUR axes, dimmed, rather
   * than in a second box. The question that decides strategy is "am I gaining
   * on them or falling behind", and that is a crossover — it can only be read
   * when both lines share a scale.
   */
  private renderStatsPanel() {
    if (
      this.selectedLiveGame() === undefined ||
      this.inSpawn ||
      !this.showStats
    )
      return null;
    const mine = this.history.get(this.mySmallID);
    if (!mine) return null;
    const other = this.hoveredStatsId();
    const theirs = other === 0 ? null : this.history.get(other);
    const theirName = other === 0 ? null : (this.playerName.get(other) ?? "?");

    // One row: label, sparkline (yours solid, theirs ghosted on the same
    // scale), current value, and a trend arrow off the recent slope.
    const row = (
      label: string,
      a: number[],
      b: number[] | undefined,
      fmt: (n: number) => string,
      signed = false,
    ) => {
      if (a.length < 2) return null;
      const series = b && b.length > 1 ? [a, b] : [a];
      let lo = Infinity;
      let hi = -Infinity;
      for (const arr of series)
        for (const v of arr) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      if (signed) {
        // Keep zero on the axis so "above/below the line" is meaningful.
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      const span = hi - lo || 1;
      const W = 76;
      const H = 26;
      const path = (arr: number[]) =>
        arr
          .map((v, k) => {
            const x = (k / (HISTORY_LEN - 1)) * W;
            const y = H - ((v - lo) / span) * H;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
      const last = a[a.length - 1];
      const prev = a[Math.max(0, a.length - 6)];
      const dir = last > prev * 1.005 ? "▲" : last < prev * 0.995 ? "▼" : "·";
      const dirColor =
        dir === "▲" ? "#34d399" : dir === "▼" ? "#f87171" : "#94a3b8";
      const zeroY = signed ? H - ((0 - lo) / span) * H : null;
      return html`<div class="flex items-center gap-1.5">
        <span class="w-14 text-white/50">${label}</span>
        <svg
          width=${W}
          height=${H}
          viewBox="0 0 ${W} ${H}"
          preserveAspectRatio="none"
          class="shrink-0"
        >
          ${zeroY !== null
            ? svg`<line x1="0" y1=${zeroY} x2=${W} y2=${zeroY}
                        stroke="rgba(255,255,255,0.18)" stroke-width="1" />`
            : null}
          ${b && b.length > 1
            ? svg`<polyline points=${path(b)} fill="none"
                            stroke="rgba(255,255,255,0.35)" stroke-width="1.25" />`
            : null}
          <polyline
            points=${path(a)}
            fill="none"
            stroke="#7dd3fc"
            stroke-width="1.5"
          />
        </svg>
        <span class="w-14 text-right text-white/90 tabular-nums"
          >${fmt(last)}</span
        >
        <span style="color:${dirColor}">${dir}</span>
      </div>`;
    };

    const num = (n: number) => compactNum(Math.round(n));
    const signedNum = (n: number) =>
      (n >= 0 ? "+" : "−") + compactNum(Math.abs(Math.round(n)));
    const myNow = this.playerStat.get(this.mySmallID);
    const starving =
      myNow !== undefined && myNow.production < myNow.consumption;

    return html`
      <div
        class="absolute bottom-3 right-3 flex flex-col text-[11px] text-white bg-black/70 backdrop-blur px-3 py-2 rounded h-[13.5rem]"
        @wheel=${(e: Event) => e.stopPropagation()}
      >
        <div class="flex justify-between gap-4 pb-1 border-b border-white/10">
          <span class="text-white/70 font-semibold">you</span>
          ${theirName
            ? html`<span class="text-white/40">vs ${theirName}</span>`
            : html`<span class="text-white/25">hover a nation</span>`}
        </div>
        <div class="flex-1 flex flex-col justify-around">
          ${row("pop", mine.troops, theirs?.troops, num)}
          ${row("food", mine.food, theirs?.food, num)}
          ${row("surplus", mine.balance, theirs?.balance, signedNum, true)}
          ${row("tiles", mine.tiles, theirs?.tiles, num)}
        </div>
        <!-- Always rendered, hidden when fed: reserving the line keeps the
             panel a fixed height so it never jumps as the warning appears. -->
        <div
          class="text-[10px] text-red-300 pt-0.5 ${starving ? "" : "invisible"}"
        >
          ⚠ eating reserves — population will fall
        </div>
      </div>
    `;
  }

  /** The nation whose series to ghost: whatever the hover chip is naming. */
  private hoveredStatsId(): number {
    const v = this.paramValues.hoveredPlayer ?? 0;
    return Number.isFinite(v) ? Math.round(v) : 0;
  }

  /** Signed troop-imbalance labels at the human's active fronts (green ahead /
   * red behind), from the worker-shipped front summary. */
  private updateFrontLabels(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    if (!container) return;
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    if (
      this.selectedLiveGame() === undefined ||
      this.inSpawn ||
      !canvas
    ) {
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
   * Placement preview (rework-settlement-ecology): while a buildable is armed
   * and the map is hovered, outline the single-tile site — green when the sim's
   * canBuild allows it, red otherwise (spacing, unowned, water). Farmland also
   * shows the site's climate-suitability fraction (the worker answers with
   * climateSuitability — the Gompertz ripening ceiling). The box is
   * camera-projected each frame like the labels, so it tracks pan/zoom.
   */
  private updateBuildPreview(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    if (!container) return;
    // updateLabels' replaceChildren may have detached a pooled box.
    if (this.previewEl && !this.previewEl.isConnected) this.previewEl = null;
    const hover = this.hoverTile;
    const buildType = this.buildType;
    if (
      this.selectedLiveGame() === undefined ||
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
    // A Farmland occupies a single tile (it ripens + projects a food-shed);
    // there is no square field footprint to outline.
    const r = 0;
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
    this.currentMapData = mapData;
    this.clearViewCache();
    this.tickCount = 0;
    this.tool = "pan"; // start in pan; the brush tool is opt-in per game
    this.destroySim();
    await this.deriveTerrain(mapData);
    if (this.selectedLiveGame() !== undefined) {
      // OpenFront-live: run the REAL sim in a Web Worker and show its territory
      // overlay over the derived terrain. Drag pans, a click acts (no tool
      // select); the sim auto-runs so bots place spawns while the human picks.
      await this.startWorker();
      await this.applyGameView(this.liveGameView());
      // 1:1 terrain: swap the derived tint for the baked terrain-colors
      // plane — the exact pixels the WebGL game's TerrainPass draws.
      void this.uploadBakedTint();
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
    this.plotBytes = new Uint8Array(n);
    this.plotBytesDirty = false;
    this.renderer?.setPlotPlane(this.mapWidth, this.mapHeight);
    this.highlightU32 = new Uint32Array(n);
    this.litHighlight = [];
    this.lastSegKey = -1;
    this.myBorderTiles = null;
    // Fresh per-game color allocators, matching the WebGL client's
    // per-game theme lifecycle.
    themeProvider.reset();
    this.densityU32 = new Uint32Array(n);
    this.frontU32 = new Uint32Array(n);
    this.damageU32 = new Uint32Array(n);
    this.supplyU32 = new Uint32Array(n);
    this.dirtyTiles.clear();
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
      ambient: this.ambient,
      ruleset: this.selectedLiveGame()!.id,
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
    // plot value packs type (low byte) + Farmland maturity (next byte). The
    // kernel buffer gets the full packed value (variant colour); the camera's
    // r8uint plane only needs the TYPE, and only re-uploads when a type
    // actually changes — so a field merely ripening (maturity churn) doesn't
    // trigger a full-plane DMA every tick.
    this.applyPairs("plot", this.plotU32, f.plot);
    if (f.plot && this.plotBytes) {
      const a = f.plot;
      for (let k = 0; k + 1 < a.length; k += 2) {
        const type = a[k + 1] & 0xff;
        if (this.plotBytes[a[k]] !== type) {
          this.plotBytes[a[k]] = type;
          this.plotBytesDirty = true;
        }
      }
    }
    this.applyPairs("front", this.frontU32, f.front);
    this.applyByte24("density", this.densityU32, f.density);
    this.applyByte24("damage", this.damageU32, f.damage);
    this.applyByte24("supply", this.supplyU32, f.supply);
    this.flushDirty("owner", this.ownerScratch);
    this.flushDirty("plot", this.plotU32!);
    this.flushDirty("front", this.frontU32!);
    this.flushDirty("density", this.densityU32!);
    this.flushDirty("damage", this.damageU32!);
    this.flushDirty("supply", this.supplyU32!);
    if (this.plotBytesDirty && this.plotBytes && this.renderer) {
      this.renderer.writePlotPlane(
        this.plotBytes,
        this.mapWidth,
        this.mapHeight,
      );
      this.plotBytesDirty = false;
    }
    // Razed tribal plots light a burn-down fire + ash scar (WebGL
    // PlotFirePass parity). One-shot per tile, driven by the renderer clock.
    if (f.burns && f.burns.length > 0) {
      this.renderer?.addBurns(f.burns, this.mapWidth);
    }

    // Summaries.
    if (this.mySmallID !== f.mySmallID) {
      this.mySmallID = f.mySmallID;
      // Tell the view which slot is ours — the shared overlay darkens every
      // tile that is not flagged here (see games/shared/live-game.wesl).
      if (this.mySmallID > 0) {
        this.mergePlayerIntent(this.mySmallID, { mine: 1 });
        this.flushPlayers();
      }
    }
    if (f.names) {
      this.ensureFlagCatalog();
      for (const nm of f.names) {
        this.playerName.set(nm.id, nm.name);
        if (nm.flag) this.playerAuthoredFlag.set(nm.id, nm.flag);
        this.playerFlagUrl.delete(nm.id); // recompute flag for (re)named slot
        this.assignPaletteSlot(nm.id, nm.pid, nm.ptype);
      }
      this.flushPlayers();
    }
    this.renderer?.setTransportShips(
      f.transportShips,
      this.playerFill,
      this.playerBorder,
    );
    if (f.myBorder) {
      this.myBorderTiles = Array.from(f.myBorder);
      this.updateSegmentHighlight(true);
    }
    if (f.stats) {
      const s = f.stats;
      for (let i = 0; i + STAT_STRIDE - 1 < s.length; i += STAT_STRIDE) {
        this.playerStat.set(s[i], {
          troops: s[i + 1],
          tiles: s[i + 2],
          alive: s[i + 3] === 1,
          food: s[i + 4],
          production: s[i + 5],
          consumption: s[i + 6],
        });
      }
      this.sampleHistory();
    }
    this.frontLabelsData = f.fronts ?? [];
    if (this.inSpawn !== f.inSpawn) this.inSpawn = f.inSpawn;
    if (this.tickReadout !== f.tick) this.tickReadout = f.tick;
    this.tickCount = f.tick; // drives the terrain season phase
    const week = Math.floor(((f.tick % YEAR_TICKS) / YEAR_TICKS) * 52);
    if (week !== this.weekReadout) this.weekReadout = week;
    this.applyMyStats(f.myStats);
    if (!this.centeredOnSpawn && f.spawnAnchor !== null) {
      // Settling flies the camera to your new home rather than snapping — the
      // same easing as the mask, so the two land together.
      this.cameraTween = {
        cx: (f.spawnAnchor % this.mapWidth) + 0.5,
        cy: Math.floor(f.spawnAnchor / this.mapWidth) + 0.5,
        scale: SETTLE_ZOOM,
      };
      this.centeredOnSpawn = true;
    }
    if (f.nationSpawns) this.nationSpawns = f.nationSpawns;
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
    this.renderer?.setTransportShips(
      new Int32Array(),
      this.playerFill,
      this.playerBorder,
    );
    this.playerFill.fill(0);
    this.playerBorder.fill(0);
    this.ownerScratch = null;
    this.fertilityPlane = null;
    this.suitabilityPlane = null;
    this.previewData = null;
    this.previewQueryTile = -1;
    this.plotU32 = null;
    this.plotBytes = null;
    this.plotBytesDirty = false;
    this.renderer?.setPlotPlane(0, 0);
    this.highlightU32 = null;
    this.litHighlight = [];
    this.lastSegKey = -1;
    this.myBorderTiles = null;
    this.bakedTintOn = false;
    this.densityU32 = null;
    this.frontU32 = null;
    this.damageU32 = null;
    this.supplyU32 = null;
    this.dirtyTiles.clear();
    this.playerName.clear();
    this.playerStat.clear();
    this.frontLabelsData = [];
    this.clearLabels();
  }

  private clearLabels(): void {
    this.querySelector("#shell-labels")?.replaceChildren();
    this.hoverChipEl = null;
    this.nationSpawnPool.clear();
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
    return this.selectedLiveGame() !== undefined || super.hasClickAction();
  }

  /** New click/stroke → allow re-acting on the same tile (repeated attacks). */
  protected onStrokeStart(): void {
    this.lastGestureKey = -1;
  }

  /** Play/pause + turbo drive the WORKER's tick loop for OpenFront-live (the
   * base's pump() path ticks GPU layers, which openfront doesn't have). */
  protected toggleRunning(): void {
    if (this.selectedLiveGame() === undefined) return super.toggleRunning();
    this.running = !this.running;
    this.postWorker({
      type: "running",
      running: this.running,
      turbo: this.turbo,
    });
  }

  protected setTurbo(on: boolean): void {
    if (this.selectedLiveGame() === undefined) return super.setTurbo(on);
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
    if (this.selectedLiveGame() === undefined)
      return super.onTileGesture(x, y, event);
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

  /** Compute a player's EXACT WebGL theme colors (territory fill + border)
   *  and write them into the view's palette slot — same ThemeProvider
   *  allocators as the game, keyed by the same PlayerID. */
  private assignPaletteSlot(smallID: number, pid: string, ptype: string): void {
    if (smallID <= 0 || smallID >= 256) return;
    const theme = themeProvider.current();
    const adapter = {
      team: () => null,
      type: () => ptype,
      id: () => pid,
    } as unknown as PlayerView;
    const fill = theme.territoryColor(adapter).toRgb();
    const border = theme.borderColor(theme.territoryColor(adapter)).toRgb();
    const pack = (c: { r: number; g: number; b: number }) =>
      (c.r << 16) | (c.g << 8) | c.b;
    const packedFill = pack(fill);
    const packedBorder = pack(border);
    this.playerFill[smallID] = packedFill;
    this.playerBorder[smallID] = packedBorder;
    this.mergePlayerIntent(smallID, {
      fill: packedFill,
      border: packedBorder,
    });
  }

  /** Replace the derived tint plane with the baked terrain-colors.png —
   *  pixel-identical terrain to the WebGL game. The season re-derive is
   *  skipped while this is on (it would repaint the derived look). */
  private async uploadBakedTint(): Promise<void> {
    if (!this.kernel || !this.currentMapData) return;
    try {
      const bmp = await buildViewBitmap(
        "terrain",
        this.currentMapData,
        this.mapWidth,
        this.mapHeight,
      );
      const cv = new OffscreenCanvas(this.mapWidth, this.mapHeight);
      const c2d = cv.getContext("2d");
      if (!c2d) return;
      c2d.drawImage(bmp, 0, 0, this.mapWidth, this.mapHeight);
      const img = c2d.getImageData(0, 0, this.mapWidth, this.mapHeight).data;
      const packed = new Uint32Array(this.mapWidth * this.mapHeight);
      for (let i = 0; i < packed.length; i++) {
        const o = i * 4;
        packed[i] = (img[o] << 16) | (img[o + 1] << 8) | img[o + 2];
      }
      this.kernel.writeBufferU32Range("tint", packed, 0, packed.length - 1);
      this.bakedTintOn = true;
    } catch {
      // Keep the derived terrain — parity is best-effort.
    }
  }

  /**
   * The aimed-segment highlight (WebGL SegmentHighlightController parity):
   * hovering land you could attack lights the stretch of YOUR border a
   * click would advance — nearest point to the cursor, breadth by distance.
   * `force` recomputes even on the same hover tile (border moved).
   */
  private updateSegmentHighlight(force = false): void {
    if (!this.highlightU32 || !this.kernel) return;
    const hover = this.hoverTile;
    const border = this.myBorderTiles;
    const off =
      this.selectedLiveGame() === undefined ||
      this.inSpawn ||
      this.buildType !== null ||
      hover === null ||
      border === null ||
      border.length === 0 ||
      !this.myStats?.alive;
    let tile = -1;
    if (!off && hover) {
      tile = hover.y * this.mapWidth + hover.x;
      const owner = this.ownerScratch?.[tile] ?? 0;
      const water = this.hoverFields?.waterMask?.[tile] === 1;
      if (owner === this.mySmallID || water) tile = -1;
    }
    if (tile === -1 || border === null) {
      this.clearSegmentHighlight();
      return;
    }
    if (!force && tile === this.lastSegKey) return;
    this.lastSegKey = tile;
    const seg = borderSegment(
      border,
      (tile % this.mapWidth) + 0.5,
      Math.floor(tile / this.mapWidth) + 0.5,
      (t) => t % this.mapWidth,
      (t) => Math.floor(t / this.mapWidth),
    );
    for (const t of this.litHighlight) {
      this.highlightU32[t] = 0;
      this.markDirty("highlight", t);
    }
    this.litHighlight = [];
    if (seg) {
      for (const t of seg.sourceTiles) {
        this.highlightU32[t] = 255;
        this.markDirty("highlight", t);
      }
      this.litHighlight = seg.sourceTiles;
    }
    this.flushDirty("highlight", this.highlightU32);
  }

  private clearSegmentHighlight(): void {
    this.lastSegKey = -1;
    if (!this.highlightU32 || this.litHighlight.length === 0) return;
    for (const t of this.litHighlight) {
      this.highlightU32[t] = 0;
      this.markDirty("highlight", t);
    }
    this.litHighlight = [];
    this.flushDirty("highlight", this.highlightU32);
  }

  /** Restart the sim with the current bot count and re-show the overlay. */
  private async restartSim(): Promise<void> {
    if (this.selectedLiveGame() === undefined || !this.kernel) return;
    this.running = false;
    // A restart is a new game: fly to the new spawn again and fade the mask
    // back in from nothing, rather than staying zoomed on the old capital.
    this.centeredOnSpawn = false;
    this.cameraTween = null;
    this.paramValues.maskFade = 0;
    this.nationSpawns = [];
    // The readouts are page-side counters; without this the toolbar keeps
    // showing the previous game's week/tick.
    this.tickCount = 0;
    this.weekReadout = 0;
    for (const b of [
      "owner",
      "plot",
      "density",
      "front",
      "damage",
      "supply",
      "highlight",
    ]) {
      this.kernel.clearBuffer(b);
    }
    await this.startWorker();
    await this.applyGameView(this.liveGameView());
    // Re-enable running: startWorker's "ready" reply reads this.running to tell
    // the fresh worker whether to tick. Without this the new sim stays paused
    // and the game never visibly restarts (needing a browser refresh).
    this.running = true;
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
        // Anything you tuned last session wins over both the map's baked
        // config and the shell defaults.
        ...this.savedClimateKnobs(),
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
    this.persistClimate();
    this.queueRecolor();
  }

  /**
   * Append one sample per series for every living nation. Sampled on a tick
   * cadence rather than per frame so the sparklines show game time, not
   * however fast the browser happened to be rendering.
   */
  private sampleHistory(): void {
    if (this.tickCount - this.lastSampleTick < HISTORY_EVERY) return;
    this.lastSampleTick = this.tickCount;
    const push = (arr: number[], v: number) => {
      arr.push(v);
      if (arr.length > HISTORY_LEN) arr.shift();
    };
    for (const [id, st] of this.playerStat) {
      if (!st.alive) {
        this.history.delete(id);
        continue;
      }
      let h = this.history.get(id);
      if (!h) {
        h = { troops: [], tiles: [], food: [], balance: [] };
        this.history.set(id, h);
      }
      push(h.troops, st.troops);
      push(h.tiles, st.tiles);
      push(h.food, st.food);
      // Surplus/deficit is the LEADING indicator: it crosses zero long before
      // the food stock visibly bends, so it is what predicts a starving nation.
      push(h.balance, st.production - st.consumption);
    }
  }

  /** Everything the climate panel controls, as one plain object. */
  private climateSettings(): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    for (const k of CLIMATE_KNOBS) {
      const v = this.derivedConfig?.[k.key];
      if (typeof v === "number") out[k.key] = v;
    }
    out.tilt = this.tilt;
    out.seasonStrength = this.seasonStrength;
    out.iceThreshold = this.iceThreshold;
    out.snowBand = this.snowBand;
    out.biomeBlend = this.biomeBlend;
    out.useClimateBase = this.useClimateBase;
    return out;
  }

  /** Read back the stored settings (shape-checked; corrupt entries ignored). */
  private readClimateStore(): Record<string, number | boolean> {
    try {
      const raw = localStorage.getItem(CLIMATE_STORE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      return parsed as Record<string, number | boolean>;
    } catch {
      return {};
    }
  }

  /** Just the map-config knobs from storage, for merging into derivedConfig. */
  private savedClimateKnobs(): Partial<FoundationWorldEngineMapConfig> {
    const saved = this.readClimateStore();
    const out: Record<string, number> = {};
    for (const k of CLIMATE_KNOBS) {
      const v = saved[k.key];
      if (typeof v === "number" && Number.isFinite(v)) out[k.key] = v;
    }
    return out as Partial<FoundationWorldEngineMapConfig>;
  }

  /** Restore the non-map-config climate state (called once at startup). */
  private restoreClimateState(): void {
    const saved = this.readClimateStore();
    const num = (k: string, apply: (v: number) => void) => {
      const v = saved[k];
      if (typeof v === "number" && Number.isFinite(v)) apply(v);
    };
    num("tilt", (v) => (this.tilt = v));
    num("seasonStrength", (v) => (this.seasonStrength = v));
    num("iceThreshold", (v) => (this.iceThreshold = v));
    num("snowBand", (v) => (this.snowBand = v));
    num("biomeBlend", (v) => (this.biomeBlend = v));
    if (typeof saved.useClimateBase === "boolean") {
      this.useClimateBase = saved.useClimateBase;
    }
  }

  private persistClimate(): void {
    try {
      localStorage.setItem(
        CLIMATE_STORE_KEY,
        JSON.stringify(this.climateSettings()),
      );
    } catch {
      // Storage disabled/full — tuning still works, it just will not survive.
    }
  }

  /** Download the climate settings as JSON for keeping alongside a map. */
  private exportClimate(): void {
    const blob = new Blob([JSON.stringify(this.climateSettings(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `climate-${this.mapKey.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    if (this.selectedLiveGame() !== undefined) {
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

  /**
   * Ambient autopilot. Runs the world in turbo so the backdrop is a timelapse
   * of empires spreading rather than a static map, then eases the camera from
   * front to front so what is on screen is combat, not empty ocean.
   */
  private stepAmbient(): void {
    if (!this.ambient) return;
    this.paramValues.ambientView = 1;
    // Just run — no turbo. The worker already ticks the backdrop slower than
    // real time, and a fast-forward at the start reads as a glitch rather than
    // as a game.
    if (!this.running) this.toggleRunning();

    // Open already close in on somewhere, rather than easing down from a world
    // view. Before anyone owns ground the nations' landing sites are the only
    // thing on the map worth pointing at.
    if (!this.ambientFramed) {
      const first = this.pickAmbientShot() ?? this.firstNationShot();
      if (first !== null) {
        this.camera = first;
        this.ambientFramed = true;
        // Advance the clock so the first real move picks a DIFFERENT place —
        // the shot index is derived from it, so leaving it at 0 makes the
        // camera "travel" to where it already is and nothing ever moves.
        this.ambientClock = 1;
        this.ambientShotAt = performance.now();
        this.ambientLastStep = this.ambientShotAt;
      }
      return;
    }

    if (this.cameraTween !== null) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.ambientLastStep) / 1000);
    this.ambientLastStep = now;
    if (now - this.ambientShotAt < AMBIENT_HOLD_MS) {
      // Keep coasting the way the camera arrived, so the move and the drift
      // read as one continuous push rather than a fly-in followed by an
      // unrelated left-to-right slide.
      const h = this.ambientHeading;
      if (h !== null) {
        const step = AMBIENT_DRIFT_PER_S * dt;
        this.camera = {
          ...this.camera,
          cx: this.camera.cx + h.dx * step,
          cy: this.camera.cy + h.dy * step,
        };
        this.needsRedraw = true;
      }
      return;
    }
    this.ambientShotAt = now;
    this.ambientClock += 1;
    const shot = this.pickAmbientShot();
    if (shot === null) return;
    // Remember the bearing of this move; the drift will carry it on.
    const dx = shot.cx - this.camera.cx;
    const dy = shot.cy - this.camera.cy;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) this.ambientHeading = { dx: dx / len, dy: dy / len };
    this.ambientTarget = shot;
    this.cameraTween = shot;
  }

  /** Somewhere to point before anyone owns ground: a nation's landing site. */
  private firstNationShot(): { cx: number; cy: number; scale: number } | null {
    if (this.nationSpawns.length === 0) return null;
    const n = this.nationSpawns[this.nationSpawns.length >> 1];
    return { cx: n.x + 0.5, cy: n.y + 0.5, scale: AMBIENT_ZOOM };
  }

  /** A place worth looking at: an active front, else a populated area. */
  private pickAmbientShot(): { cx: number; cy: number; scale: number } | null {
    const W = this.mapWidth;
    const front = this.frontU32;
    const dens = this.densityU32;
    const pool: number[] = [];
    if (front) {
      for (let i = 0; i < front.length; i += 1) if (front[i] > 0) pool.push(i);
    }
    if (pool.length === 0 && dens) {
      for (let i = 0; i < dens.length; i += 1) if (dens[i] > 0) pool.push(i);
    }
    if (pool.length === 0) return null;
    // Prefer somewhere close by, so the camera walks the map instead of
    // teleporting across it. Falls back to the whole pool when the
    // neighbourhood has nothing left worth looking at.
    const cx = this.camera.cx;
    const cy = this.camera.cy;
    const near = pool.filter((i) => {
      const dx = (i % W) - cx;
      const dy = Math.floor(i / W) - cy;
      return dx * dx + dy * dy <= AMBIENT_MAX_HOP * AMBIENT_MAX_HOP;
    });
    const from = near.length > 0 ? near : pool;
    // Deterministic-ish pick without Math.random so repeated frames are stable.
    const t = from[(this.ambientClock * 7919) % from.length];
    return {
      cx: (t % W) + 0.5,
      cy: Math.floor(t / W) + 0.5,
      scale: AMBIENT_ZOOM,
    };
  }

  /**
   * Fly the camera toward its target. Zoom eases in LOG space so the
   * approach feels linear to the eye — a straight lerp on scale spends most
   * of its time crawling through the high zooms.
   */
  private stepCameraTween(): void {
    const t = this.cameraTween;
    if (t === null) return;
    const cam = this.camera;
    const cx = cam.cx + (t.cx - cam.cx) * CAMERA_TWEEN_RATE;
    const cy = cam.cy + (t.cy - cam.cy) * CAMERA_TWEEN_RATE;
    const logNow = Math.log(Math.max(0.0001, cam.scale));
    const logTo = Math.log(Math.max(0.0001, t.scale));
    const scale = Math.exp(logNow + (logTo - logNow) * CAMERA_TWEEN_RATE);
    const done =
      Math.abs(t.cx - cx) < 0.5 &&
      Math.abs(t.cy - cy) < 0.5 &&
      Math.abs(logTo - Math.log(scale)) < 0.01;
    this.camera = done
      ? { cx: t.cx, cy: t.cy, scale: t.scale }
      : { cx, cy, scale };
    if (done) this.cameraTween = null;
    this.needsRedraw = true;
  }

  /**
   * Landing-site markers for the other nations, shown ONLY while you are
   * choosing your own spawn. They answer "who am I about to be next to?" —
   * a question the blank spawn map could not previously answer at all.
   */
  private updateNationSpawnMarkers(): void {
    const container = this.querySelector<HTMLDivElement>("#shell-labels");
    const canvas = this.querySelector<HTMLCanvasElement>("#shell-canvas");
    const clear = () => {
      if (this.nationSpawnPool.size === 0) return;
      for (const el of this.nationSpawnPool.values()) el.remove();
      this.nationSpawnPool.clear();
    };
    if (
      !container ||
      !canvas ||
      this.selectedLiveGame() === undefined ||
      !this.inSpawn
    ) {
      clear();
      return;
    }
    this.ensureFlagCatalog();
    const dpr = window.devicePixelRatio || 1;
    const cam = this.camera;
    const cwCss = canvas.width / dpr;
    const chCss = canvas.height / dpr;
    const seen = new Set<string>();
    for (const n of this.nationSpawns) {
      const key = `${n.x},${n.y}`;
      const cx = ((n.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2) / dpr;
      const cy = ((n.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2) / dpr;
      if (cx < -60 || cy < -30 || cx > cwCss + 60 || cy > chCss + 30) continue;
      seen.add(key);
      let el = this.nationSpawnPool.get(key);
      if (!el) {
        el = document.createElement("div");
        el.className =
          "absolute inline-flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold text-[10px] px-1 rounded bg-black/55 pointer-events-none";
        el.style.textShadow = "0 1px 2px rgba(0,0,0,0.95)";
        el.style.color = "#fbbf24";
        const flagUrl =
          this.flagCatalog.length > 0
            ? resolveFlagUrl(n.flag ?? flagForSeed(this.flagCatalog, n.name))
            : n.flag
              ? resolveFlagUrl(n.flag)
              : null;
        if (flagUrl) {
          const img = document.createElement("img");
          img.src = flagUrl;
          img.className = "h-3 w-auto rounded-[1px]";
          img.alt = "";
          img.onerror = () => img.remove();
          el.appendChild(img);
        }
        const span = document.createElement("span");
        span.textContent = n.name;
        el.appendChild(span);
        container.appendChild(el);
        this.nationSpawnPool.set(key, el);
      }
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
    }
    for (const [key, el] of this.nationSpawnPool) {
      if (!seen.has(key)) {
        el.remove();
        this.nationSpawnPool.delete(key);
      }
    }
  }

  /**
   * Ease the territory mask in once you have actually settled. Before that —
   * during the spawn phase, or if you have been wiped out — the whole world
   * renders unmasked so you can read the map you are choosing a home on. The
   * fade is exponential so it arrives softly instead of snapping to black the
   * instant the spawn lands.
   */
  private stepMaskFade(): void {
    const settled =
      !this.inSpawn && this.myStats?.alive === true && this.mySmallID > 0;
    const target = settled ? 1 : 0;
    const now = this.paramValues.maskFade ?? 0;
    const next = now + (target - now) * MASK_FADE_RATE;
    // Snap the last sliver so it settles exactly instead of creeping forever.
    this.paramValues.maskFade = Math.abs(target - next) < 0.005 ? target : next;
  }

  /** Render the OpenFront-live overlay from the (already-uploaded) conduits;
   * the terrain season derive runs only every Nth frame (GPU throttle). */
  private renderOpenfront(): void {
    if (!this.kernel || !this.compiled) return;
    this.inFlight = true;
    this.stepMaskFade();
    this.stepAmbient();
    this.stepCameraTween();
    this.kernel.writeUniform(
      "P",
      this.compiled.writeParams(this.paramValues, this.seed),
    );
    const doDerive =
      !this.bakedTintOn &&
      this.derivedOk &&
      this.deriveClock++ % SEASON_DERIVE_EVERY === 0;
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
    if (this.selectedLiveGame() !== undefined)
      return this.openfrontHoverRows(hx, hy);
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
      const pv = this.plotU32?.[i] ?? 0;
      const p = pv & 0xff;
      if (p === 1) rows.push(["structure", "Settlement"]);
      else if (p === 3) rows.push(["structure", "Barn"]);
      else if (p === 2) {
        rows.push(["structure", "Farmland"]);
        rows.push(["maturity", (((pv >> 8) & 0xff) / 255).toFixed(2)]);
      }
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
      // Legibility conduits: the human's supply quality and combat scarring —
      // the two fields the user asked to make visible (0 = none, so hidden).
      const sup = this.supplyU32?.[i] ?? 0;
      if (sup > 0) {
        rows.push(["supply", ((sup - 1) / 254).toFixed(2)]);
      }
      const dmg = this.damageU32?.[i] ?? 0;
      if (dmg > 0) {
        rows.push(["damage", (dmg / 255).toFixed(2)]);
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
      if (this.ambient) return html``;
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
    if (this.ambient) {
      // Backdrop only. No chrome, no pointer handlers — the menu sits on top
      // and must keep every click.
      return html`
        <section class="absolute inset-0 overflow-hidden pointer-events-none">
          <canvas
            id="shell-canvas"
            class="absolute inset-0 w-full h-full"
          ></canvas>
          <div
            id="shell-labels"
            class="absolute inset-0 pointer-events-none overflow-hidden hidden"
          ></div>
        </section>
      `;
    }
    return html`
      <section class="fixed inset-0 z-[9000] bg-neutral-950 overflow-hidden">
        <canvas
          id="shell-canvas"
          class="absolute inset-0 w-full h-full touch-none ${this.hasBrushPainting() &&
          this.tool === "brush"
            ? "cursor-crosshair"
            : this.selectedLiveGame() !== undefined
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
              this.destroySim();
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
              this.destroySim();
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
          ${this.selectedLiveGame() !== undefined
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
          ${this.selectedLiveGame() !== undefined
            ? html`<button
                class="border border-white/20 px-2 py-1 hover:bg-white/10"
                title="Restart the game on this map"
                @click=${() => void this.restartSim()}
              >
                restart
              </button>`
            : null}
          ${this.selectedLiveGame() !== undefined
            ? html`<button
                class="border border-white/20 px-2 py-1 hover:bg-white/10 ${this
                  .showStats
                  ? "bg-white/10"
                  : ""}"
                title="Live statistics (yours, and whoever you hover)"
                @click=${() => (this.showStats = !this.showStats)}
              >
                stats
              </button>`
            : null}
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

        ${this.selectedLiveGame() !== undefined ? this.renderPlayerHud() : null}
        ${this.renderStatsPanel()}
        ${game && this.selectedLiveGame() === undefined ? this.renderSimPanel() : null}
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
        ${s && s.starved > 0
          ? html`<div class="flex flex-col items-center px-2">
              <span
                class="text-red-400/70 text-[10px] uppercase tracking-wide"
                title="Troops lost to starvation last tick — food ran short"
                >starved</span
              >
              <span class="text-red-400 tabular-nums text-base"
                >-${s.starved}</span
              >
            </div>`
          : null}
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
    const params = (compiled?.paramList ?? []).filter((p) => !p.hidden);
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
  /** The description box for the hovered game-mechanics knob. Sits in a fixed
   *  column just left of the climate popover, vertically tracking the cursor —
   *  same "chip beside the thing" treatment as the nation hover chip, but a
   *  multi-line box that teaches the mechanic. */
  private renderKnobTip() {
    const tip = this.knobTip;
    if (!tip) return null;
    const help = KNOB_HELP[tip.key];
    if (!help) return null;
    const value = this.foodValue(tip.key);
    const modified = value !== FOOD_DEFAULTS[tip.key];
    // Keep the box on-screen: it is ~200px tall, so clamp its center.
    const y = Math.max(120, Math.min(tip.y, window.innerHeight - 120));
    return html`
      <div
        class="fixed z-50 w-72 text-xs text-white bg-black/85 backdrop-blur px-3 py-2.5 rounded-lg shadow-xl border border-white/15 pointer-events-none"
        style="right: 21.25rem; top: ${y}px; transform: translateY(-50%)"
      >
        <div class="font-mono text-[12px] text-amber-300 break-all mb-1">
          ${tip.key}
        </div>
        <div class="text-white/85 leading-snug mb-2">${help.affects}</div>
        <div class="flex gap-1.5 leading-snug mb-0.5">
          <span class="text-emerald-400 font-bold shrink-0">▲ raise</span>
          <span class="text-white/75">${help.up}</span>
        </div>
        <div class="flex gap-1.5 leading-snug">
          <span class="text-rose-400 font-bold shrink-0">▼ lower</span>
          <span class="text-white/75">${help.down}</span>
        </div>
        <div
          class="mt-2 pt-1.5 border-t border-white/10 text-[11px] text-white/50"
        >
          now
          <span class=${modified ? "text-amber-300" : "text-white/70"}
            >${value}</span
          >
          · default ${FOOD_DEFAULTS[tip.key]}
        </div>
      </div>
    `;
  }

  /** Apply a swept preset: every knob it names, and defaults for the rest, so
   *  the live game matches exactly the config the sweep measured. */
  private applyFoodPreset(name: string): void {
    const preset = findFoodPreset(name);
    if (preset === undefined) return;
    for (const [key, value] of presetKnobChanges(preset, (k) =>
      this.foodValue(k),
    )) {
      this.applyFoodKnob(key, value);
    }
    this.activeFoodPreset = name;
  }

  private renderFoodPresets() {
    const presets = foodPresets();
    if (presets.length === 0) return null;
    return html`
      <div class="flex items-center gap-1 mt-1">
        <span class="text-[10px] uppercase tracking-wide text-white/50"
          >preset</span
        >
        <select
          class="flex-1 min-w-0 px-1 py-0.5 text-[11px] bg-black/40 border border-white/20 rounded text-white"
          .value=${this.activeFoodPreset ?? ""}
          @change=${(e: Event) => {
            const name = (e.target as HTMLSelectElement).value;
            if (name !== "") this.applyFoodPreset(name);
          }}
        >
          <option value="">— none —</option>
          ${presets.map(
            (p) =>
              html`<option value=${p.name} title=${p.description ?? ""}>
                ${p.name}
              </option>`,
          )}
        </select>
      </div>
    `;
  }

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
            : "text-white/80"} ${KNOB_HELP[key]
            ? "cursor-help hover:bg-white/5 rounded"
            : ""}"
          title="default: ${FOOD_DEFAULTS[key]}"
          @mouseenter=${(e: MouseEvent) => {
            if (KNOB_HELP[key]) this.knobTip = { key, y: e.clientY };
          }}
          @mousemove=${(e: MouseEvent) => {
            if (this.knobTip?.key === key) this.knobTip = { key, y: e.clientY };
          }}
          @mouseleave=${() => {
            if (this.knobTip?.key === key) this.knobTip = null;
          }}
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
      ${this.renderFoodPresets()}
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
      ${this.renderKnobTip()}
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
          this.persistClimate();
          this.queueRecolor();
        })}
        ${slider("seasonStrength", this.seasonStrength, 0, 3, 0.05, (v) => {
          this.seasonStrength = v;
          this.persistClimate();
          this.queueRecolor();
        })}
        ${slider("iceThreshold", this.iceThreshold, 0, 0.6, 0.005, (v) => {
          this.iceThreshold = v;
          this.persistClimate();
          this.queueRecolor();
        })}
        ${slider("snowBand", this.snowBand, 0, 0.3, 0.005, (v) => {
          this.snowBand = v;
          this.persistClimate();
          this.queueRecolor();
        })}
        ${slider("biomeBlend", this.biomeBlend, 0, 0.15, 0.005, (v) => {
          this.biomeBlend = v;
          this.persistClimate();
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
              this.persistClimate();
              this.queueRecolor();
            }}
          />
          <span class="text-white/70"
            >real climate base (off = synthetic model)</span
          >
        </label>
        <div class="flex items-center gap-2 pt-1 border-t border-white/10">
          <button
            class="border border-white/20 px-2 py-1 hover:bg-white/10"
            title="Download these climate values as JSON"
            @click=${() => this.exportClimate()}
          >
            export json
          </button>
          <button
            class="border border-white/20 px-2 py-1 hover:bg-white/10"
            title="Forget saved climate values and reload the map's own"
            @click=${() => {
              try {
                localStorage.removeItem(CLIMATE_STORE_KEY);
              } catch {
                // Nothing to do — storage is unavailable.
              }
              // Re-derive from the map's own config now that the override
              // is gone (same path the map picker takes).
              this.destroySim();
              void this.loadWorld();
            }}
          >
            reset
          </button>
          <span class="text-white/40">saved automatically</span>
        </div>
        ${this.selectedLiveGame() !== undefined && this.worker
          ? this.renderGameKnobs()
          : null}
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
