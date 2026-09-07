import { peekFoodShed } from "../../../../core/execution/utils/FoodShed";
import { Game, LandUse, Player, UnitType } from "../../../../core/game/Game";
import { simpleHash } from "../../../../core/Util";
import type { FieldKernel } from "../../../webgpu/FieldKernel";
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
  /**
   * Scratch for the CLEAR-FREE rebuild.
   *
   * The mirrors used to be cleared and then rewritten, which dirtied every
   * tile TWICE per refresh whether or not its value moved — so the delta upload
   * degraded to "resend the whole plane" on four of the eight planes and cost
   * 113 ms on spqr at full conquest with nothing actually changing.
   *
   * Instead: mark which tiles this refresh touches (`seen`), write values
   * straight into the mirror only when they differ, and clear only the tiles
   * that were present last refresh and are absent now. `flagScratch` exists
   * because flags are ACCUMULATED bit by bit, so the final value is not known
   * until the walk finishes and cannot be compared as it goes.
   *
   * `seen` carries ONE BIT PER PLANE, not a single flag. A nucleus tile appears
   * in the maturity list AND the tenure list, so a shared mark that the first
   * plane's retire pass cleared would make the second plane conclude the tile
   * had gone away and zero it — which is precisely what happened: 586 nuclei
   * lost their tenure and the city weight picked up 6,452 phantom tiles.
   */
  private static readonly SEEN_MATURITY = 1;
  private static readonly SEEN_TENURE = 2;
  private static readonly SEEN_DENSITY = 4;
  private readonly seen: Uint8Array;
  private readonly flagScratch: Uint32Array;
  /**
   * The placement draws' PRNG seeds, one per player and one per district.
   *
   * The CPU has to compute these: `simpleHash("urban:<player id>:<tick>")`
   * hashes the player's STRING id, which is not a quantity the GPU holds and
   * not one worth shipping. Hashing a few hundred short strings per tick is
   * nothing beside the territory-sized work the seeds go on to drive, and it
   * keeps the id an entirely CPU-side concept.
   */
  private readonly playerSeed: Uint32Array;
  private readonly slotSeed: Uint32Array;
  /**
   * The patch phase's per-district ledger.
   *
   * `slotResidents` is the shed's labour pooling (`peopleByFarm`), which is
   * per-player state and stays here under D1.
   *
   * `slotCredit` is MIRRORED, keyed by nucleus TILE, because slots are
   * renumbered in ascending tile order every time the farm set changes — one
   * farm dying shifts every slot after it, so a credit array that lived only on
   * the GPU would hand one district's savings to its neighbour. The CPU keeps
   * the map, uploads it in slot order, and reads the updated values back after
   * the dispatch (`absorbCredit`). O(districts) each way: 2.5 KB at the measured
   * peak of 617.
   */
  private readonly slotResidents: Int32Array;
  private readonly slotCredit: Int32Array;
  /** THE SHED DERIVATION'S INPUTS (design D1). Slot -> nucleus tile is the
   *  inverse of `cellSlot`, needed because the per-slot and per-player passes
   *  know a slot and the owner plane is indexed by tile. The four per-player
   *  arrays are scalars the host already holds — occupancy, the rural split and
   *  its remainder, and which slot is the player's `farms[0]`. */
  private readonly slotTile: Uint32Array;
  private readonly slotCountBuf: Uint32Array;
  private readonly playerOcc: Float32Array;
  private readonly playerRural: Int32Array;
  private readonly playerRuralRem: Int32Array;
  private readonly playerFirstSlot: Uint32Array;
  private readonly creditByNucleus = new Map<number, number>();
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
    this.playerSeed = new Uint32Array(256);
    this.slotSeed = new Uint32Array(MAX_CELLS);
    this.slotResidents = new Int32Array(MAX_CELLS);
    this.slotCredit = new Int32Array(MAX_CELLS);
    this.slotTile = new Uint32Array(MAX_CELLS);
    this.slotCountBuf = new Uint32Array(1);
    this.playerOcc = new Float32Array(256);
    this.playerRural = new Int32Array(256);
    this.playerRuralRem = new Int32Array(256);
    this.playerFirstSlot = new Uint32Array(256);
    this.seen = new Uint8Array(tiles);
    this.flagScratch = new Uint32Array(tiles);
  }

  /**
   * Take the dispatch's updated credit back into the tile-keyed mirror, and
   * forget districts that no longer exist — the CPU's own sweep of dead nuclei
   * (`farmTick` ends by dropping credits whose nucleus is no longer a Farmland).
   */
  absorbCredit(credit: Int32Array): void {
    const live = new Set<number>();
    for (let slot = 0; slot < this.cells.length; slot++) {
      const t = this.cells[slot];
      live.add(t);
      this.creditByNucleus.set(t, credit[slot]);
    }
    for (const t of Array.from(this.creditByNucleus.keys())) {
      if (!live.has(t)) this.creditByNucleus.delete(t);
    }
  }

  /** The per-district credit this refresh, in slot order (pre-dispatch). */
  get slotCreditArray(): Readonly<Int32Array> {
    return this.slotCredit;
  }

  /** The per-district resident counts this refresh, in slot order. */
  get slotResidentsArray(): Readonly<Int32Array> {
    return this.slotResidents;
  }

  /** The per-player draw seeds this refresh, indexed by smallID. */
  get playerSeeds(): Readonly<Uint32Array> {
    return this.playerSeed;
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

  /** The resident farm-flag plane. An isolation probe needs the SAME flags the
   *  shader read to build its reference — deriving them from the live game
   *  instead is how a stale input gets misread as a shader bug, which has
   *  happened four times in this port. */
  get farmFlagsPlane(): Readonly<Uint32Array> {
    return this.farmFlags;
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
    /** Where the rebuild actually goes, so the fix targets the right pass. */
    msOwner: number;
    msClear: number;
    msPlayers: number;
    msGameWide: number;
    msSlots: number;
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

    const tOwner = performance.now();
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

    const msOwner = performance.now() - tOwner;
    const tClear = performance.now();
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
    // No pre-clear: see `seen` / `flagScratch`. Stale entries are removed after
    // the walk, so a tile whose value did not move is never dirtied at all.
    for (const t of this.flagTiles) this.flagScratch[t] = 0;

    const msClear = performance.now() - tClear;
    const tPlayers = performance.now();
    // Map-wide flags: damage and plots are game state, not player state.
    const matTiles: number[] = [];
    const flagTiles: number[] = [];
    const tenureTiles: number[] = [];
    const densityTiles: number[] = [];
    const setFlag = (t: number, bit: number): void => {
      if (this.flagScratch[t] === 0) flagTiles.push(t);
      this.flagScratch[t] |= bit;
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
        this.seen[t] |= EconomyFieldUploader.SEEN_MATURITY;
        matTiles.push(t);
      }
      // WALK THE SPARSE SOURCES, not the territory. This used to iterate
      // `p.tiles()` — every owned tile, ~2M at full conquest — doing two map
      // lookups and three set lookups each, and it cost 68 ms of a 79 ms
      // refresh. Every one of these flags has a sparse origin: zones live in a
      // Map, and `ranked`/`tilled` are the shed's own Sets. Ownership is
      // re-checked per tile because a zone or a shed entry can outlive the
      // player's claim on the ground.
      for (const [tr, use] of p.landUseEntries()) {
        const t = Number(tr);
        if (map.ownerID(t) !== smallID) continue;
        if (use === LandUse.Field) setFlag(t, FLAG_FIELD_ZONE);
        else if (use === LandUse.Urban) setFlag(t, FLAG_URBAN_ZONE);
      }
      if (shed !== null) {
        for (const tr of shed.tilled) {
          const t = Number(tr);
          if (map.ownerID(t) === smallID) setFlag(t, FLAG_TILLED);
        }
        // `isFallow` is `ranked && !tilled`, so this is the same predicate.
        for (const tr of shed.ranked) {
          const t = Number(tr);
          if (shed.tilled.has(tr)) continue;
          if (map.ownerID(t) === smallID) setFlag(t, FLAG_FALLOW);
        }
      }
      for (const [tr, people] of p.densityEntries()) {
        const t = Number(tr);
        if (this.density[t] !== people) {
          this.density[t] = people;
          densityDirty.push(t);
        }
        this.seen[t] |= EconomyFieldUploader.SEEN_DENSITY;
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
    const msPlayers = performance.now() - tPlayers;
    const tGameWide = performance.now();
    // Game-wide (not per-player) tile state.
    for (const [tr, milli] of game.tileTenureEntries()) {
      const t = Number(tr);
      if (this.tenure[t] !== milli) {
        this.tenure[t] = milli;
        tenureDirty.push(t);
      }
      this.seen[t] |= EconomyFieldUploader.SEEN_TENURE;
      tenureTiles.push(t);
    }
    // Damage over EVERY damaged tile, not just the ones carrying crop.
    // Scoping it to `matTiles` was enough while the only consumer was the crop
    // CA, and wrong the moment a consumer asked about bare ground: the city
    // draw excludes battle-worn tiles whether or not anything grew there, and
    // the flag's absence let 54 scarred tiles onto verdantia's frontier.
    for (const [tr, dmg] of game.tileDamageEntries()) {
      if (dmg > 0) setFlag(Number(tr), FLAG_DAMAGED);
    }
    for (const t of farmTiles) setFlag(t, FLAG_NUCLEUS);
    for (const t of matTiles) {
      if (game.plotAt(t) !== undefined) setFlag(t, FLAG_PLOT);
    }

    const msGameWide = performance.now() - tGameWide;
    const tSlots = performance.now();
    // Retire last refresh's entries that this one did not produce, then reset
    // the marks. Both loops are over the SPARSE lists, never the grid.
    const retire = (
      plane: Float32Array,
      was: number[],
      now: number[],
      dirty: number[],
      bit: number,
    ): void => {
      for (const t of was) {
        if ((this.seen[t] & bit) === 0 && plane[t] !== 0) {
          plane[t] = 0;
          dirty.push(t);
        }
      }
      for (const t of now) this.seen[t] &= ~bit;
    };
    retire(
      this.maturity,
      this.matTiles,
      matTiles,
      matDirty,
      EconomyFieldUploader.SEEN_MATURITY,
    );
    retire(
      this.tenure,
      this.tenureTiles,
      tenureTiles,
      tenureDirty,
      EconomyFieldUploader.SEEN_TENURE,
    );
    retire(
      this.density,
      this.densityTiles,
      densityTiles,
      densityDirty,
      EconomyFieldUploader.SEEN_DENSITY,
    );
    // Flags were built into scratch because they accumulate; diff the union of
    // last refresh's tiles and this one's.
    for (const t of this.flagTiles) {
      if (this.farmFlags[t] !== this.flagScratch[t]) {
        this.farmFlags[t] = this.flagScratch[t];
        flagDirty.push(t);
      }
    }
    for (const t of flagTiles) {
      if (this.farmFlags[t] !== this.flagScratch[t]) {
        this.farmFlags[t] = this.flagScratch[t];
        flagDirty.push(t);
      }
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

    // Draw seeds, rebuilt whole every refresh — they change every tick by
    // construction, so a delta would never be smaller than the array.
    // The strings must match the CPU's exactly: `UrbanGrowth.addCityTiles` and
    // `FarmGrowth.placePatch` are the definition, not this.
    const tick = game.ticks();
    this.playerSeed.fill(0);
    this.slotSeed.fill(0);
    for (const p of players) {
      if (!p.isAlive()) continue;
      const id = p.smallID();
      if (id < this.playerSeed.length) {
        this.playerSeed[id] = simpleHash(`urban:${p.id()}:${tick}`);
      }
    }
    // Per-district ledger, in slot order.
    this.slotResidents.fill(0);
    this.slotCredit.fill(0);
    const residentsOf = new Map<number, number>();
    for (const p of players) {
      if (!p.isAlive()) continue;
      const shed = peekFoodShed(p);
      if (shed === null) continue;
      for (const [nucleus, people] of shed.peopleByFarm) {
        residentsOf.set(Number(nucleus), people);
      }
    }
    for (let slot = 0; slot < slotTiles.length; slot++) {
      const t = slotTiles[slot];
      this.slotResidents[slot] = residentsOf.get(t) ?? 0;
      this.slotCredit[slot] = this.creditByNucleus.get(t) ?? 0;
    }

    // THE SHED DERIVATION'S INPUTS (design D1). Slot -> tile first, because the
    // per-slot passes need it to find a slot's owner; NO_TILE marks the dead
    // slots so a stale value from an earlier refresh is never read.
    this.slotTile.fill(0xffffffff);
    for (let slot = 0; slot < slotTiles.length; slot++) {
      this.slotTile[slot] = slotTiles[slot];
    }
    this.slotCountBuf[0] = slotTiles.length;

    // Per-player scalars. `occupancy` scales density (which is HOUSING) down to
    // the civilians who actually live there; the rural cohort is everyone not
    // housed in a city tile, split equally across the player's farms with the
    // division remainder going to `farms[0]`. All O(1) or O(farms) on the host
    // — deriving them on the device would mean reducing a farm count only to
    // divide by it.
    this.playerOcc.fill(0);
    this.playerRural.fill(0);
    this.playerRuralRem.fill(0);
    this.playerFirstSlot.fill(0xffffffff);
    for (const p of players) {
      if (!p.isAlive()) continue;
      const id = p.smallID();
      if (id >= 256) continue;
      let housing = 0;
      for (const [, h] of p.densityEntries()) housing += h;
      const idlePop = p.troops();
      const urbanCivilians = Math.min(idlePop, housing);
      this.playerOcc[id] = housing > 0 ? urbanCivilians / housing : 0;
      const shed = peekFoodShed(p);
      const farmCount = shed === null ? 0 : shed.farms.length;
      if (farmCount > 0) {
        const rural = Math.max(0, idlePop - urbanCivilians);
        const perFarm = Math.floor(rural / farmCount);
        this.playerRural[id] = perFarm;
        this.playerRuralRem[id] = rural - perFarm * farmCount;
      }
    }
    // `farms[0]` is the player's LOWEST slot, because slots are numbered in
    // ascending tile order — so this is a property of the farm set rather than
    // of the order anything was enumerated in.
    for (let slot = 0; slot < slotTiles.length; slot++) {
      const id = map.ownerID(slotTiles[slot]);
      if (id < 256 && this.playerFirstSlot[id] === 0xffffffff) {
        this.playerFirstSlot[id] = slot;
      }
    }

    const ownerOf = new Map<number, string>();
    for (const p of players) ownerOf.set(p.smallID(), p.id());
    for (let slot = 0; slot < slotTiles.length; slot++) {
      const nucleus = slotTiles[slot];
      const pid = ownerOf.get(map.ownerID(nucleus));
      if (pid === undefined) continue;
      this.slotSeed[slot] = simpleHash(`patch:${pid}:${tick}:${nucleus}`);
    }
    const msSlots = performance.now() - tSlots;
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
      kernel.writeBuffer("playerSeed", this.playerSeed);
      kernel.writeBuffer("slotSeed", this.slotSeed);
      kernel.writeBuffer("slotResidents", this.slotResidents);
      kernel.writeBuffer("slotCredit", this.slotCredit);
      kernel.writeBuffer("slotTile", this.slotTile);
      kernel.writeBuffer("slotCount", this.slotCountBuf);
      kernel.writeBuffer("playerOcc", this.playerOcc);
      kernel.writeBuffer("playerRural", this.playerRural);
      kernel.writeBuffer("playerRuralRem", this.playerRuralRem);
      kernel.writeBuffer("playerFirstSlot", this.playerFirstSlot);
      return {
        changedTiles: n * 8,
        runs: 8,
        elements: n * 8,
        rebuildMs,
        msOwner,
        msClear,
        msPlayers,
        msGameWide,
        msSlots,
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
    // Whole, not delta: every seed changes every tick.
    kernel.writeBuffer("playerSeed", this.playerSeed);
    kernel.writeBuffer("slotSeed", this.slotSeed);
    kernel.writeBuffer("slotResidents", this.slotResidents);
    kernel.writeBuffer("slotCredit", this.slotCredit);
    // The shed derivation's inputs, whole: slot numbering shifts
    // whenever the farm set changes, and the per-player scalars move
    // every tick with population.
    kernel.writeBuffer("slotTile", this.slotTile);
    kernel.writeBuffer("slotCount", this.slotCountBuf);
    kernel.writeBuffer("playerOcc", this.playerOcc);
    kernel.writeBuffer("playerRural", this.playerRural);
    kernel.writeBuffer("playerRuralRem", this.playerRuralRem);
    kernel.writeBuffer("playerFirstSlot", this.playerFirstSlot);
    runs += 10;
    elements +=
      this.playerSeed.length +
      this.slotSeed.length +
      this.slotResidents.length +
      this.slotCredit.length;

    return {
      changedTiles: ownerDirty.length + farmDirty.length + nodeDirty.length,
      runs,
      elements,
      rebuildMs,
      msOwner,
      msClear,
      msPlayers,
      msGameWide,
      msSlots,
      uploadMs: performance.now() - tUpload,
    };
  }
}
