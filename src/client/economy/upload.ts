import { isFallow, peekFoodShed } from "../../core/execution/utils/FoodShed";
import { Game, LandUse, Player, UnitType } from "../../core/game/Game";
import type { FieldKernel } from "../webgpu/FieldKernel";
import { MAX_CELLS } from "./fields/system";

/**
 * Keeps the economy floods' input planes resident on the GPU and pushes only
 * what CHANGED since the last refresh.
 *
 * Measured motivation: re-uploading all three planes every refresh costs
 * ~12.5 ms at 2048×1024 (24 MB across the bus), which is as much as the floods
 * themselves — enough to wipe out the win. The planes barely change between
 * refreshes, so this mirrors them on the CPU, records the tiles that actually
 * moved, and uploads merged contiguous runs. Same technique the shell already
 * uses for its render conduits (GameShellPage.flushDirty).
 *
 * The two seed planes are SPARSE (a few farms and settlements per player), so
 * they are updated by walking the units — never the map. The owner plane still
 * costs one pass over the grid to rebuild; folding the sim's own
 * `packedTileUpdates` in here would remove even that, and is the obvious next
 * step if this pass shows up in a profile.
 */
// Upload cost model, calibrated on this workload at 2048×1024 (apple/metal-3):
// a full three-plane push measured 12.3–12.6 ms for 6.3M elements and 3 calls,
// and a 1159-call/153k-element delta measured 5.3 ms. Solving those gives ~4.5 µs
// of fixed overhead per `queue.writeBuffer` and ~0.002 µs per 4-byte element —
// i.e. ONE CALL COSTS AS MUCH AS ~2000 ELEMENTS. Dirty tiles are scattered along
// fronts across the whole map, so strictly-contiguous runs are ~2 tiles long and
// the call overhead, not the bandwidth, is what to minimise.
/** Sentinel for "this tile is not a district nucleus". */
const NO_SLOT = 0xffffffff;

// farmFlags bit layout — must match the WESL passes.
const FLAG_DAMAGED = 1;
const FLAG_FIELD_ZONE = 2;
const FLAG_NUCLEUS = 4;
const FLAG_FALLOW = 8;
const FLAG_TILLED = 16;
const FLAG_URBAN_ZONE = 32;
const FLAG_PLOT = 64;
/**
 * This tile changed hands since the last dispatch.
 *
 * The conquest RULE lives on the GPU (see farm_ripen); only the DETECTION is
 * here, and it is free: the uploader already diffs `owner` every refresh to
 * build its dirty-run list, so the delta is computed either way. Packing it as
 * a flag bit costs no bandwidth (farmFlags is already uploaded) and no extra
 * storage buffer — farm_ripen is at WebGPU's 8-buffer cap, so a second owner
 * plane could not have been bound anyway.
 *
 * One-tick event: the flags are cleared and rebuilt every refresh.
 */
const FLAG_OWNER_CHANGED = 128;

const CALL_US = 4.5;
const ELEM_US = 0.002;
/** Gap sizes to consider when merging runs; the cheapest by the model wins. */
const MERGE_GAPS = [256, 1024, 4096, 16384];

/** Merge sorted dirty indices into runs, bridging gaps up to `gap`. */
function mergeRuns(dirty: number[], gap: number): [number, number][] {
  const runs: [number, number][] = [];
  let start = dirty[0];
  let prev = dirty[0];
  for (let i = 1; i < dirty.length; i++) {
    const t = dirty[i];
    if (t === prev) continue;
    if (t - prev <= gap) {
      prev = t;
      continue;
    }
    runs.push([start, prev]);
    start = t;
    prev = t;
  }
  runs.push([start, prev]);
  return runs;
}

const runCost = (runs: [number, number][]): number => {
  let elements = 0;
  for (const [a, b] of runs) elements += b - a + 1;
  return runs.length * CALL_US + elements * ELEM_US;
};

export class EconomyFieldUploader {
  private readonly owner: Uint32Array;
  private readonly farmMaturity: Float32Array;
  private readonly supplyNode: Uint32Array;
  /** Tiles currently non-zero in each sparse plane, so they can be cleared
   *  without scanning the whole grid. */
  private farmTiles: number[] = [];
  private nodeTiles: number[] = [];
  private uploaded = false;
  /**
   * The economy's per-tile STATE, as distinct from the flood inputs above.
   *
   * `farmMaturity` is the shed's SEED plane — nuclei only. The crop CA needs
   * every field tile, which is a different (and much larger) set, so it gets
   * its own plane. Without these four the ported consumer passes run on zeroed
   * flags and prove nothing, which is exactly the state they shipped in.
   */
  private readonly maturity: Float32Array;
  private readonly farmFlags: Uint32Array;
  private readonly tenure: Float32Array;
  private readonly density: Float32Array;
  private matTiles: number[] = [];
  private flagTiles: number[] = [];
  private tenureTiles: number[] = [];
  private densityTiles: number[] = [];
  /** Tile -> dense district slot (NO_SLOT elsewhere). */
  private readonly cellSlot: Uint32Array;
  /** Dense slot -> cell tile: the inverse, for reading aggregates back. */
  private cells: number[] = [];
  private slotTiles: number[] = [];
  private overflowed = false;

  constructor(private readonly tiles: number) {
    this.owner = new Uint32Array(tiles);
    this.farmMaturity = new Float32Array(tiles);
    this.supplyNode = new Uint32Array(tiles);
    this.cellSlot = new Uint32Array(tiles).fill(NO_SLOT);
    this.maturity = new Float32Array(tiles);
    this.farmFlags = new Uint32Array(tiles);
    this.tenure = new Float32Array(tiles);
    this.density = new Float32Array(tiles);
  }

  /** Cell tile for each dense slot — how a read-back aggregate is attributed
   *  back to a district. Index is the slot, value is the nucleus tile. */
  get cellTiles(): readonly number[] {
    return this.cells;
  }

  /** The resident supply-source plane (Core + completed Settlements). */
  get supplyNodePlane(): Readonly<Uint32Array> {
    return this.supplyNode;
  }

  /** The resident owner plane. A merged all-players field read back from the
   *  GPU needs it to route each tile to the player it belongs to. */
  get ownerPlane(): Readonly<Uint32Array> {
    return this.owner;
  }

  /**
   * Refresh the planes from the live game and upload the difference.
   * Returns what it had to send, for measurement.
   */
  refresh(
    game: Game,
    players: readonly Player[],
    kernel: FieldKernel,
  ): {
    changedTiles: number;
    runs: number;
    elements: number;
    /** CPU cost of rebuilding the mirrors (the O(grid) owner pass dominates). */
    rebuildMs: number;
    /** GPU cost of pushing the difference. */
    uploadMs: number;
  } {
    const tRebuild = performance.now();
    const map = game.map();
    const n = this.tiles;
    const ownerDirty: number[] = [];
    const farmDirty: number[] = [];
    const nodeDirty: number[] = [];
    const slotDirty: number[] = [];
    const matDirty: number[] = [];
    const flagDirty: number[] = [];
    const tenureDirty: number[] = [];
    const densityDirty: number[] = [];

    // Owner: one pass, comparing as it goes — the rebuild produces the dirty
    // list for free rather than needing a second diff pass.
    for (let t = 0; t < n; t++) {
      let next = 0;
      const o = map.ownerID(t);
      if (o !== 0 && map.isLand(t) && !map.isImpassable(t)) next = o;
      if (this.owner[t] !== next) {
        this.owner[t] = next;
        ownerDirty.push(t);
      }
    }

    // Sparse planes: clear last refresh's entries, then write this one's.
    for (const t of this.farmTiles) {
      if (this.farmMaturity[t] !== 0) {
        this.farmMaturity[t] = 0;
        farmDirty.push(t);
      }
    }
    for (const t of this.nodeTiles) {
      if (this.supplyNode[t] !== 0) {
        this.supplyNode[t] = 0;
        nodeDirty.push(t);
      }
    }
    // Clear last refresh's economy-state entries before rewriting them.
    const clearF32 = (
      plane: Float32Array,
      was: number[],
      dirty: number[],
    ): void => {
      for (const t of was) {
        if (plane[t] !== 0) {
          plane[t] = 0;
          dirty.push(t);
        }
      }
    };
    clearF32(this.maturity, this.matTiles, matDirty);
    clearF32(this.tenure, this.tenureTiles, tenureDirty);
    clearF32(this.density, this.densityTiles, densityDirty);
    for (const t of this.flagTiles) {
      if (this.farmFlags[t] !== 0) {
        this.farmFlags[t] = 0;
        flagDirty.push(t);
      }
    }

    // Map-wide flags: damage and plots are game state, not player state.
    const matTiles: number[] = [];
    const flagTiles: number[] = [];
    const tenureTiles: number[] = [];
    const densityTiles: number[] = [];
    const setFlag = (t: number, bit: number): void => {
      if ((this.farmFlags[t] & bit) === 0) {
        if (this.farmFlags[t] === 0) flagTiles.push(t);
        this.farmFlags[t] |= bit;
        flagDirty.push(t);
      }
    };

    // Ownership deltas, from the diff the owner pass above already produced.
    for (const t of ownerDirty) setFlag(t, FLAG_OWNER_CHANGED);

    const farmTiles: number[] = [];
    const nodeTiles: number[] = [];
    for (const p of players) {
      if (!p.isAlive()) continue;
      const smallID = p.smallID();
      // The CA's state and the consumer passes' predicates. PEEK — the normal
      // accessor recomputes when the cadence is due, and this runs between
      // ticks, so using it moved the sim's own refresh schedule.
      const shed = peekFoodShed(p);
      for (const [tr, m] of p.farmMaturityEntries()) {
        const t = Number(tr);
        if (this.maturity[t] !== m) {
          this.maturity[t] = m;
          matDirty.push(t);
        }
        matTiles.push(t);
      }
      for (const tr of p.tiles()) {
        const t = Number(tr);
        if (p.landUse(tr) === LandUse.Field) setFlag(t, FLAG_FIELD_ZONE);
        else if (p.landUse(tr) === LandUse.Urban) setFlag(t, FLAG_URBAN_ZONE);
        if (shed !== null) {
          if (isFallow(shed, tr)) setFlag(t, FLAG_FALLOW);
          if (shed.tilled.has(tr)) setFlag(t, FLAG_TILLED);
        }
      }
      for (const [tr, people] of p.densityEntries()) {
        const t = Number(tr);
        if (this.density[t] !== people) {
          this.density[t] = people;
          densityDirty.push(t);
        }
        densityTiles.push(t);
      }
      for (const farm of p.units(UnitType.Farmland)) {
        if (farm.isUnderConstruction()) continue;
        const t = Number(farm.tile());
        if (map.ownerID(t) !== smallID) continue;
        const m = p.farmMaturity(t) / 1000;
        if (m > this.farmMaturity[t]) {
          this.farmMaturity[t] = m;
          farmDirty.push(t);
        }
        farmTiles.push(t);
      }
      const core = p.core();
      if (core !== null && map.ownerID(core) === smallID) {
        const t = Number(core);
        if (this.supplyNode[t] !== 1) {
          this.supplyNode[t] = 1;
          nodeDirty.push(t);
        }
        nodeTiles.push(t);
      }
      for (const node of p.units(UnitType.Settlement)) {
        if (node.isUnderConstruction()) continue;
        const t = Number(node.tile());
        if (map.ownerID(t) !== smallID) continue;
        if (this.supplyNode[t] !== 1) {
          this.supplyNode[t] = 1;
          nodeDirty.push(t);
        }
        nodeTiles.push(t);
      }
    }
    // Game-wide (not per-player) tile state.
    for (const [tr, milli] of game.tileTenureEntries()) {
      const t = Number(tr);
      if (this.tenure[t] !== milli) {
        this.tenure[t] = milli;
        tenureDirty.push(t);
      }
      tenureTiles.push(t);
    }
    for (const t of matTiles) {
      if (game.tileDamage(t) > 0) setFlag(t, FLAG_DAMAGED);
    }
    for (const t of farmTiles) setFlag(t, FLAG_NUCLEUS);
    for (const t of matTiles) {
      if (game.plotAt(t) !== undefined) setFlag(t, FLAG_PLOT);
    }

    this.matTiles = matTiles;
    this.flagTiles = flagTiles;
    this.tenureTiles = tenureTiles;
    this.densityTiles = densityTiles;
    this.farmTiles = farmTiles;
    this.nodeTiles = nodeTiles;

    // Dense district slots. Assigned in ASCENDING TILE ORDER, not in the order
    // players and units happened to be walked: a slot must be a function of the
    // farm SET, or the same board would produce different aggregates run to run
    // — the same discipline the shed tie-break and the frontier ordering follow.
    for (const t of this.slotTiles) {
      if (this.cellSlot[t] !== NO_SLOT) {
        this.cellSlot[t] = NO_SLOT;
        slotDirty.push(t);
      }
    }
    const cells = farmTiles.slice().sort((a, b) => a - b);
    if (cells.length > MAX_CELLS && !this.overflowed) {
      this.overflowed = true;
      console.warn(
        `EconomyFieldUploader: ${cells.length} districts exceeds MAX_CELLS ` +
          `(${MAX_CELLS}); the surplus will not accumulate. Raise the cap.`,
      );
    }
    const slotTiles: number[] = [];
    for (let slot = 0; slot < cells.length && slot < MAX_CELLS; slot++) {
      const t = cells[slot];
      if (this.cellSlot[t] !== slot) {
        this.cellSlot[t] = slot;
        slotDirty.push(t);
      }
      slotTiles.push(t);
    }
    this.cells = slotTiles;
    this.slotTiles = slotTiles;
    const rebuildMs = performance.now() - tRebuild;
    const tUpload = performance.now();

    // First refresh has nothing resident, so send everything once.
    if (!this.uploaded) {
      this.uploaded = true;
      kernel.writeBuffer("owner", this.owner);
      kernel.writeBuffer("farmMaturity", this.farmMaturity);
      kernel.writeBuffer("supplyNode", this.supplyNode);
      kernel.writeBuffer("cellSlot", this.cellSlot);
      kernel.writeBuffer("maturity", this.maturity);
      kernel.writeBuffer("farmFlags", this.farmFlags);
      kernel.writeBuffer("tenure", this.tenure);
      kernel.writeBuffer("density", this.density);
      return {
        changedTiles: n * 8,
        runs: 8,
        elements: n * 8,
        rebuildMs,
        uploadMs: performance.now() - tUpload,
      };
    }

    let runs = 0;
    let elements = 0;
    const flush = (
      name: string,
      plane: Uint32Array | Float32Array,
      dirty: number[],
    ): void => {
      if (dirty.length === 0) return;
      dirty.sort((a, b) => a - b);
      // Pick the cheapest shape by the cost model, including "just re-send the
      // whole plane" — which genuinely wins when the changes are spread thinly
      // enough that no gap size collapses them into few runs.
      let best: [number, number][] | null = null;
      let bestCost = CALL_US + n * ELEM_US; // the full-plane option
      for (const gap of MERGE_GAPS) {
        const candidate = mergeRuns(dirty, gap);
        const cost = runCost(candidate);
        if (cost < bestCost) {
          bestCost = cost;
          best = candidate;
        }
      }
      if (best === null) {
        kernel.writeBuffer(name, plane);
        runs += 1;
        elements += n;
        return;
      }
      for (const [a, b] of best) {
        kernel.writeBufferU32Range(name, plane, a, b);
        runs += 1;
        elements += b - a + 1;
      }
    };
    flush("owner", this.owner, ownerDirty);
    flush("farmMaturity", this.farmMaturity, farmDirty);
    flush("supplyNode", this.supplyNode, nodeDirty);
    flush("cellSlot", this.cellSlot, slotDirty);
    flush("maturity", this.maturity, matDirty);
    flush("farmFlags", this.farmFlags, flagDirty);
    flush("tenure", this.tenure, tenureDirty);
    flush("density", this.density, densityDirty);

    return {
      changedTiles: ownerDirty.length + farmDirty.length + nodeDirty.length,
      runs,
      elements,
      rebuildMs,
      uploadMs: performance.now() - tUpload,
    };
  }
}
