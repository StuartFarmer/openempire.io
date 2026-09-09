// Message protocol between GameShellPage (main thread) and ShellSim.worker
// (move-shell-sim-to-worker). The worker owns the src/core sim and every Game
// read; the main thread is a pure client that applies conduit deltas + renders
// and drives the HUD/hover/labels from the small per-tick summary below.
import type { AssetManifest } from "../../core/AssetUrls";
import type { PaintedEconomyConfig } from "../../core/configuration/PaintedEconomyConfig";
import type { GrowthConfig } from "../../core/development/CityDevelopmentConfig";
import type { PaintedResourceSnapshot } from "../../core/execution/utils/PaintedEconomy";
import {
  UnitType,
  type Difficulty,
  type GameMapType,
} from "../../core/game/Game";
import type {
  CityDevelopmentUpdate,
  PaintResultUpdate,
} from "../../core/game/GameUpdates";
import type { RulesetID } from "../../core/game/Rulesets";
import type { Intent } from "../../core/Schemas";
import type { LivePlotAction } from "../games/LiveGameRuntime";
import type { SimpleFrontMatchResult } from "../shell/SimpleFrontMatch";

export const SHELL_TRANSPORT_STRIDE = 4;

interface ShellTransportSource {
  type(): UnitType;
  isActive(): boolean;
  id(): number;
  tile(): number;
  lastTile(): number;
  owner(): { smallID(): number };
}

export function packTransportShips(units: readonly ShellTransportSource[]) {
  const out: number[] = [];
  for (const unit of units) {
    if (unit.type() !== UnitType.TransportShip || !unit.isActive()) continue;
    out.push(
      unit.id(),
      Number(unit.tile()),
      Number(unit.lastTile()),
      unit.owner().smallID(),
    );
  }
  return Int32Array.from(out);
}

/** The human's live stats readout (shipped each tick). */
export interface ShellUrbanSummary {
  population: number;
  idle: number;
  deployed: number;
  housing: number;
  occupancy: number | null;
  birthsPerSecond: number;
  pressure: number;
  status:
    | "no-housing"
    | "vacancies"
    | "construction"
    | "no-space"
    | "disabled"
    | "waiting";
  upgradeBlocked: boolean;
}

export interface ShellMyStats {
  urban?: ShellUrbanSummary;
  painted?: PaintedResourceSnapshot;
  paintedPricing?: Pick<
    PaintedEconomyConfig,
    | "farmCostMilli"
    | "cityCostMilli"
    | "landDispatchMilliPerTroop"
    | "transportDispatchMilliPerTroop"
  >;
  troops: number;
  food: number;
  population: number;
  /** Troops lost to starvation on the last food tick (supply legibility). */
  starved: number;
  tiles: number;
  alive: boolean;
  // Peak-ratchet seed awards (rework-settlement-ecology): banked founding seeds.
  farmSeeds: number;
  settlementSeeds: number;
  /** First outgoing attack, if any; lets the shared HUD cancel it. */
  activeAttackID?: string;
}

/** A front-imbalance label: cluster tile(s) + signed troop delta (human view). */
export interface ShellFrontLabel {
  tiles: number[];
  delta: number;
}

/** main → worker. */
export type ShellSimIn =
  | {
      type: "init";
      mapType: GameMapType;
      bots: number;
      difficulty?: Difficulty;
      cdnBase: string;
      assetManifest: AssetManifest;
      /** Front-page backdrop: nobody is going to place a spawn, so the sim
       *  needs the spawn phase to end on a timer instead of on a human. */
      ambient?: boolean;
      /** Which game's Config and live runtime to use. Omitted = `openfront`;
       *  LeanFront may install its GPU economy before each worker tick. */
      ruleset?: RulesetID;
      /** Internal next-match integration seam. Only SimpleFront accepts this;
       * absence retains normal-match rules until the release gate. */
      cityDevelopment?: GrowthConfig;
    }
  | { type: "running"; running: boolean; turbo: boolean }
  // The worker resolves attack-vs-boat + ratio-scaled troops (needs Game reads).
  | { type: "act"; tile: number; ratio: number }
  // Any intent the main can build without Game reads (spawn, build_unit,
  // tune_food_config); the worker stamps + queues it.
  | { type: "intent"; intent: Intent }
  | { type: "plot_action"; action: LivePlotAction; tile: number }
  // Placement-preview query (farm-growth spec): the worker answers with the
  // sim's own canBuild + production fraction for the hovered site.
  | { type: "preview"; tile: number; unit: UnitType };

/**
 * worker → main, one per sim tick. Conduit deltas are typed arrays whose buffers
 * are TRANSFERRED (zero-copy): owner/plot/front are `[tile, value]` pairs;
 * density is `tile | (byte<<24)` words. The summaries are small
 * structured-clone data.
 */
export interface ShellSimFrame {
  development?: CityDevelopmentUpdate;
  matchResult?: SimpleFrontMatchResult | null;
  type: "frame";
  tick: number;
  inSpawn: boolean;
  mySmallID: number;
  owner: Uint32Array | null; // [tile, state] pairs (owner = state & 0xfff)
  plot: Uint32Array | null; // [tile, type] pairs
  front: Uint32Array | null; // [tile, byte] pairs
  density: Uint32Array | null; // tile | (byte<<24)
  damage: Uint32Array | null; // tile | (byte<<24) — combat scarring, 0 = healed
  supply: Uint32Array | null; // tile | (byte<<24) — human supply quality, 1..255
  /** Tiles where a tribal plot (Settlement/Farmland/Barn) was just razed this
   *  tick — each lights a burn-down fire + ash scar in the renderer. */
  burns: Uint32Array | null;
  /** Per-player stats, 7 ints each:
   *  [smallID, troops, tiles, alive, food, production, consumption]. */
  stats: Int32Array | null;
  transportShips: Int32Array; // [id, tile, lastTile, ownerSmallID] quads
  /** Newly-seen players: smallID, display name, the identity the client THEME
   *  needs for exact WebGL-parity colors (pid + type), and an authored flag ref
   *  (nations with a manifest `flag`; absent → shell assigns a random one). */
  names:
    | { id: number; name: string; pid: string; ptype: string; flag?: string }[]
    | null;
  myStats: ShellMyStats | null;
  paintResults?: PaintResultUpdate[];
  /** LeanFront Simple plot summaries: [tile, kind, level, stock, capacity,
   * growth] sextets. */
  simplePlots?: Float64Array;
  fronts: ShellFrontLabel[] | null;
  spawnAnchor: number | null; // one-shot: the human's spawn tile
  /** Where each nation will land, shipped during the spawn phase only, so the
   *  map you are choosing a home on shows who else is about to appear. */
  nationSpawns: { x: number; y: number; name: string; flag?: string }[] | null;
  /** The human's border tiles (refreshed every few ticks) — feeds the
   *  aimed-segment highlight (WebGL SegmentHighlightController parity). */
  myBorder?: Uint32Array;
}

export type ShellSimOut =
  // fertility + suitability are the sim's baked per-tile planes
  // (tile-fertility / city-growth specs), shipped once (transferred) for the
  // hover readout — never a separate approximation.
  | {
      type: "ready";
      /** Actual enabled rules, absent on ordinary matches. */
      cityDevelopment?: Readonly<GrowthConfig>;
      popPerDensity: number;
      fertility: Uint8Array;
      suitability: Uint8Array;
    }
  | ShellSimFrame
  // Answer to a "preview" query: canBuild verdict for the queried tile, plus
  // (Farmland only) the site's climate-suitability fraction 0..1 — the sim's
  // climateSuitability (the Gompertz ripening ceiling).
  | {
      type: "preview";
      tile: number;
      unit: UnitType;
      ok: boolean;
      fraction: number;
    }
  | {
      type: "action_result";
      action: LivePlotAction;
      tile: number;
      ok: boolean;
      message?: string;
    }
  | { type: "error"; message: string };
