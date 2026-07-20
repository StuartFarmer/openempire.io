// Message protocol between GameShellPage (main thread) and ShellSim.worker
// (move-shell-sim-to-worker). The worker owns the src/core sim and every Game
// read; the main thread is a pure client that applies conduit deltas + renders
// and drives the HUD/hover/labels from the small per-tick summary below.
import type { AssetManifest } from "../../core/AssetUrls";
import type { GameMapType, UnitType } from "../../core/game/Game";
import type { Intent } from "../../core/Schemas";

/** The human's live stats readout (shipped each tick). */
export interface ShellMyStats {
  troops: number;
  food: number;
  population: number;
  tiles: number;
  alive: boolean;
  // Seed ladder (restore-organic-growth): banked seeds + the next rung.
  farmSeeds: number;
  settlementSeeds: number;
  nextSeedRung: number;
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
      cdnBase: string;
      assetManifest: AssetManifest;
    }
  | { type: "running"; running: boolean; turbo: boolean }
  // The worker resolves attack-vs-boat + ratio-scaled troops (needs Game reads).
  | { type: "act"; tile: number; ratio: number }
  // Any intent the main can build without Game reads (spawn, build_unit,
  // tune_food_config); the worker stamps + queues it.
  | { type: "intent"; intent: Intent }
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
  type: "frame";
  tick: number;
  inSpawn: boolean;
  mySmallID: number;
  owner: Uint32Array | null; // [tile, state] pairs (owner = state & 0xfff)
  plot: Uint32Array | null; // [tile, type] pairs
  front: Uint32Array | null; // [tile, byte] pairs
  density: Uint32Array | null; // tile | (byte<<24)
  stats: Int32Array | null; // [smallID, troops, tiles, alive] quads
  names: { id: number; name: string }[] | null; // newly-seen players
  myStats: ShellMyStats | null;
  fronts: ShellFrontLabel[] | null;
  nameAnchors: Record<string, { x: number; y: number; size: number }> | null;
  spawnAnchor: number | null; // one-shot: the human's spawn tile
}

export type ShellSimOut =
  // fertility + suitability are the sim's baked per-tile planes
  // (tile-fertility / city-growth specs), shipped once (transferred) for the
  // hover readout — never a separate approximation.
  | {
      type: "ready";
      popPerDensity: number;
      fertility: Uint8Array;
      suitability: Uint8Array;
    }
  | ShellSimFrame
  // Answer to a "preview" query: canBuild verdict for the queried tile, plus
  // (Farmland only) the site's full-field potential fraction 0..1 — the sim's
  // farmPotentialMilli over farmOutputMilli.
  | {
      type: "preview";
      tile: number;
      unit: UnitType;
      ok: boolean;
      fraction: number;
    }
  | { type: "error"; message: string };
