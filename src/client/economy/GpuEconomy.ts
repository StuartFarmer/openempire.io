import { setFarmTickProvider } from "../../core/execution/utils/FarmGrowth";
import { setDistrictYieldProvider } from "../../core/execution/utils/FoodEconomy";
import type { PlayerFoodShed } from "../../core/execution/utils/FoodShed";
import { setShedFloodProvider } from "../../core/execution/utils/FoodShed";
import type { Game, Player } from "../../core/game/Game";
import { compileFieldSystem } from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import { CUTOFF_RADII, economyFields } from "./fields/system";
import { EconomyFieldUploader } from "./upload";

/**
 * The economy's GPU pipeline, owned by whoever runs the simulation.
 *
 * Everything up to here has lived in probe workers: build a game, dispatch
 * once, compare, throw the result away. This is the same pipeline with a
 * lifetime — a device, a compiled system and an uploader that persist across
 * ticks — so the shipping sim worker can hold one.
 *
 * WHY IT IS ASYNC, and why that shapes the tick loop. A dispatch has to be
 * submitted and awaited before its results exist, but `executeNextTick` is
 * synchronous and `src/core` cannot reach a GPU at all. So the order is: await
 * a dispatch BETWEEN ticks, store what came back, then run the tick with the
 * providers serving stored answers. The provider seams were written for exactly
 * this ("whatever provides it must already have the answer"), and it is safe
 * for determinism because the refresh schedule is tick-based, never wall-clock.
 *
 * WHAT CROSSES BACK is per district: two arrays of MAX_CELLS integers, 128 KB,
 * flat in map size. Measured against the alternative on spqr at tick 9102 —
 * 0.7 ms for these, against 4.3 ms to copy two shed planes plus 13.2 ms of
 * O(grid) scan to partition them back into per-player answers. The copy was
 * never the expensive half; the scan it implies is.
 *
 * WHAT IS NOT SWITCHED YET: the two floods. Their seams
 * (`SupplyProvider`, `ShedFloodProvider`) are defined in terms of per-tile
 * `dist`/`cell`, so serving them means exactly that partition. Moving the
 * shed's DERIVATION — the ranked/tilled classification and the labour pooling —
 * onto the GPU turns that readback per-district too, and takes the uploader's
 * remaining per-player walk with it, since `tilled`/`ranked` are what it reads.
 */
export class GpuEconomy {
  private constructor(
    private readonly kernel: FieldKernel,
    private readonly compiled: Awaited<ReturnType<typeof compileFieldSystem>>,
    readonly uploader: EconomyFieldUploader,
    readonly adapter: string,
  ) {}

  /** Wall time of the most recent upload, dispatch and readback. */
  uploadMs = 0;
  dispatchMs = 0;
  readMs = 0;

  /** Per-district results of the most recent dispatch, and the map from a
   *  nucleus tile to its slot in them. Populated only after a dispatch, so a
   *  provider asked before the first one falls back to the CPU. */
  private prod: Int32Array = new Int32Array(0);
  private cap: Int32Array = new Int32Array(0);
  private slotOf = new Map<number, number>();
  private ready = false;
  /** The crop plane as a list — `cropTile[i]` carries `cropVal[i]` milli. Only
   *  `cropN` entries are valid; the buffers are sized for the worst case. */
  private cropTile = new Uint32Array(0);
  private cropVal = new Float32Array(0);
  private cropN = 0;
  /** Which tiles this dispatch reported, so a player's stale entries can be
   *  retired without a second pass over the grid. */
  private seen = new Uint8Array(0);
  /**
   * The shed flood, scattered back into the tile-indexed arrays its seam wants,
   * plus each player's covered tiles.
   *
   * Built LAZILY, on the first `flood` call after a dispatch: sheds refresh on
   * a ten-tick cadence, so most ticks never ask, and paying for the scatter
   * every tick would hand back most of what the compaction saved.
   */
  private shedDist = new Uint32Array(0);
  private shedCell = new Int32Array(0);
  private shedTilesByOwner: number[][] = [];
  private shedBuilt = false;
  private shedRaw: {
    tiles: Uint32Array;
    dist: Uint32Array;
    cell: Uint32Array;
    n: number;
  } | null = null;
  /** Districts the CPU asked for that the GPU had no slot for — a real
   *  disagreement about the farm SET, and a reason to fall back rather than
   *  serve a district's neighbours' numbers. */
  fallbacks = 0;
  /** Districts actually served from the GPU — the counterpart to `fallbacks`,
   *  so a null result can be told apart from a seam that never fired. */
  served = 0;

  /**
   * Build the pipeline for a game's map and config. Returns null when the
   * device cannot be had — no WebGPU, a lost adapter, a shader that will not
   * link — so the caller keeps the CPU economy rather than failing to start.
   * A game that will not launch is worse than a game that runs at CPU speed.
   */
  static async create(game: Game): Promise<GpuEconomy | null> {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    try {
      const f = game.config().food();
      const system = economyFields(
        {
          shed: Math.ceil(f.foodShedRadius * CUTOFF_RADII),
          supply: Math.ceil(f.supplyRadius * CUTOFF_RADII),
        },
        {
          wFood: f.wFood,
          wWater: f.wWater,
          wShore: f.wShore,
          wFieldWater: f.wFieldWater,
          wLogi: f.wLogi,
          wCong: f.wCong,
          supplyRadius: f.supplyRadius,
          supplyDecayPower: f.supplyDecayPower,
          popPerDensity: f.popPerDensity,
          foodShedRadius: f.foodShedRadius,
          foodShedPower: f.foodShedPower,
          wFoodShed: f.wFoodShed,
          fieldClaimMilli: f.fieldClaimMilli,
          farmSeedMilli: f.farmSeedMilli,
          farmGrowthRate: f.farmGrowthRate,
          farmSenesceRate: f.farmSenesceRate,
          humidityWeight: f.humidityWeight,
          tempBaseN: f.tempBaseN,
          tempOptLoN: f.tempOptLoN,
          tempOptHiN: f.tempOptHiN,
          tempMaxN: f.tempMaxN,
          waterWiltN: f.waterWiltN,
          waterFullN: f.waterFullN,
          fieldTileStorageMilli: f.fieldTileStorageMilli,
          fieldTileYieldMilli: f.fieldTileYieldMilli,
          tenureHalfTicks: f.tenureHalfTicks,
          fieldPatchCostMilli: f.fieldPatchCostMilli,
          fieldPatchDriveCapMilli: f.fieldPatchDriveCapMilli,
          farmersPerFieldTile: f.farmersPerFieldTile,
          tickSeed: 0,
        },
      );
      const compiled = await compileFieldSystem(system);
      const kernel = await FieldKernel.create(null, compiled.kernelConfig);
      const w = game.width();
      const h = game.height();
      kernel.resize(w, h);

      // The static map planes, uploaded once. They are the terrain; nothing in
      // the simulation writes them.
      const n = w * h;
      const crop = new Float32Array(n);
      const temperature = new Float32Array(n);
      const humidity = new Float32Array(n);
      const water = new Float32Array(n);
      const shore = new Float32Array(n);
      const map = game.map();
      for (let t = 0; t < n; t++) {
        crop[t] = game.layer("crop", t);
        temperature[t] = game.layer("temperature", t);
        humidity[t] = game.layer("humidity", t);
        water[t] = game.layer("water", t);
        shore[t] = map.isShoreline(t) || map.isOceanShore(t) ? 1 : 0;
      }
      kernel.writeBuffer("crop", crop);
      kernel.writeBuffer("temperature", temperature);
      kernel.writeBuffer("humidity", humidity);
      kernel.writeBuffer("water", water);
      kernel.writeBuffer("shore", shore);

      return new GpuEconomy(
        kernel,
        compiled,
        new EconomyFieldUploader(n),
        kernel.adapterInfo,
      );
    } catch {
      return null;
    }
  }

  /**
   * Push the tick's changes and run the pipeline. Call BETWEEN ticks — the
   * results have to exist before the providers are asked for them.
   */
  async dispatch(game: Game, players: readonly Player[]): Promise<void> {
    const t0 = performance.now();
    this.uploader.refresh(game, players, this.kernel);
    this.uploadMs = performance.now() - t0;

    const t1 = performance.now();
    const frame = this.kernel.beginFrame();
    this.compiled.runDerive(frame);
    await frame.finish();
    this.dispatchMs = performance.now() - t1;

    // AGGREGATES ONLY. Two arrays of MAX_CELLS integers — 128 KB — regardless
    // of how large the map is. Measured at 0.7 ms on spqr, against 4.3 ms for
    // two full planes plus 13.2 ms of O(grid) scan to partition them.
    const t2 = performance.now();
    this.prod = new Int32Array(await this.kernel.readBuffer("prodAccum"));
    this.cap = new Int32Array(await this.kernel.readBuffer("capAccum"));
    this.slotOf.clear();
    this.uploader.cellTiles.forEach((t, slot) => this.slotOf.set(t, slot));

    // The crop plane, COMPACTED. Bounded by how much crop exists rather than by
    // the map: 154k entries (1.2 MB) on spqr at tick 9102, against 8 MB for the
    // plane itself. Two round trips — the count, then that many entries.
    const counts = new Uint32Array(await this.kernel.readBuffer("cropCount"));
    this.cropN = Math.min(counts[0], 2097152);
    if (this.cropN > 0) {
      this.cropTile = new Uint32Array(
        await this.kernel.readBuffer("cropTile", this.cropN),
      );
      this.cropVal = new Float32Array(
        await this.kernel.readBuffer("cropVal", this.cropN),
      );
    } else {
      this.cropN = 0;
    }

    // The shed flood, compacted. Read here, scattered on demand.
    const shedCounts = new Uint32Array(
      await this.kernel.readBuffer("shedCount"),
    );
    const shedN = Math.min(shedCounts[0], 2097152);
    this.shedRaw =
      shedN > 0
        ? {
            tiles: new Uint32Array(
              await this.kernel.readBuffer("shedTileList", shedN),
            ),
            dist: new Uint32Array(
              await this.kernel.readBuffer("shedDistList", shedN),
            ),
            cell: new Uint32Array(
              await this.kernel.readBuffer("shedCellList", shedN),
            ),
            n: shedN,
          }
        : null;
    this.shedBuilt = false;

    this.ready = true;
    this.readMs = performance.now() - t2;
  }

  /** Scatter the compacted flood into tile-indexed arrays and per-owner tile
   *  lists. One pass over the covered tiles, never over the grid. */
  private buildShed(tiles: number): void {
    if (this.shedBuilt) return;
    this.shedBuilt = true;
    if (this.shedDist.length !== tiles) {
      this.shedDist = new Uint32Array(tiles);
      this.shedCell = new Int32Array(tiles);
    }
    // Indexed by smallID, so it is SPARSE — `for...of` yields undefined for
    // the holes, and `undefined.length = 0` throws. That exception fired inside
    // `flood`, which is called from `recompute` inside `foodTick`, so it
    // aborted the whole economy for every player from the second dispatch
    // onward. The tick got FASTER (17 ms) while the board died, which is the
    // most dangerous shape a bug can take: it looks like the result you wanted.
    for (let i = 0; i < this.shedTilesByOwner.length; i++) {
      const bucket = this.shedTilesByOwner[i];
      if (bucket !== undefined) bucket.length = 0;
    }
    const raw = this.shedRaw;
    if (raw === null) return;
    for (let i = 0; i < raw.n; i++) {
      const t = raw.tiles[i];
      this.shedDist[t] = raw.dist[i];
      this.shedCell[t] = raw.cell[i];
      const o = this.uploader.ownerPlane[t];
      let bucket = this.shedTilesByOwner[o];
      if (bucket === undefined) {
        bucket = [];
        this.shedTilesByOwner[o] = bucket;
      }
      bucket.push(t);
    }
  }

  /**
   * Serve the district ledger from the dispatch — `foodTick`'s O(territory)
   * loop, the largest single block in the sim's profile.
   *
   * The alignment is exact and worth stating, because it is easy to get wrong
   * by one tick: the dispatch runs BEFORE `executeNextTick`, so the maturity it
   * ripened is the maturity `farmTick` is about to produce, which is the
   * maturity the CPU's own ledger would read. Task 2.3 measures that agreement
   * at 154,178 of 154,178 tiles exact.
   *
   * Falls back (returns null) rather than filling partially: if the GPU has no
   * slot for a farm the CPU knows about, the two disagree about the district
   * SET, and serving a neighbour's number would be worse than being slow.
   */
  install(): void {
    // THE FARM CA. `farmTick`'s two phases both write maturity and the second
    // reads what the first produced, so the provider serves the whole tick or
    // none of it. Task 2.3 measures the GPU landing where the CPU would:
    // 154,178 of 154,178 tiles exact at full conquest.
    //
    // Applying it is a walk over the compacted list, not the grid: write this
    // player's tiles, then retire the entries it used to have and no longer
    // does (senesced to nothing), which is what `setFarmMaturity(t, 0)` means.
    setFarmTickProvider({
      apply: (mg: Game, player: Player): boolean => {
        if (!this.ready) return false;
        const map = mg.map();
        const id = player.smallID();
        if (this.seen.length === 0) {
          this.seen = new Uint8Array(map.width() * map.height());
        }
        for (let i = 0; i < this.cropN; i++) {
          const t = this.cropTile[i];
          if (map.ownerID(t) !== id) continue;
          this.seen[t] = 1;
          player.setFarmMaturity(t, this.cropVal[i]);
        }
        const stale: number[] = [];
        for (const [tr] of player.farmMaturityEntries()) {
          if (this.seen[Number(tr)] === 0) stale.push(Number(tr));
        }
        for (const t of stale) player.setFarmMaturity(t, 0);
        for (let i = 0; i < this.cropN; i++) this.seen[this.cropTile[i]] = 0;
        return true;
      },
    });

    // THE SHED FLOOD. Verified before it was trusted, in two layers, because
    // the first attempt at this made the tick 5x faster by killing the board:
    //   - the flood the provider SERVES against the CPU's own shed — 534,955
    //     tiles against 534,936, ZERO cells assigned differently, and 0.02% of
    //     coverage differing from one tick of ownership churn;
    //   - the DERIVATION built on top of it, recomputed both ways from the same
    //     board — tilled 141,900 both, ranked 141,326 both, pooled people
    //     141,178,585 both, regions 67 both.
    // Both layers identical; the collapse was a sparse-array bug in the scatter
    // above plus a stale-cell hazard in the seam, both now fixed.
    //
    // NOT ENABLED, and for a measured reason rather than a suspicion: serving
    // it costs MORE than it saves. The CPU-side scatter and per-owner bucketing
    // runs on nearly every tick — 43 players on a staggered ten-tick cadence
    // means somebody is refreshing almost always — and 535k entries of it is
    // ~16 ms against a flood worth less. Ledger + farm CA alone measures 65.9
    // ms/tick; adding this takes it to 82.1.
    //
    // The fix is to compact PER OWNER on the GPU so the CPU receives a
    // contiguous slice and does no bucketing at all. That is a prefix-sum, not
    // a rewrite, and it is the subject of its own proposal.

    setDistrictYieldProvider({
      fill: (
        _mg: Game,
        _player: Player,
        shed: PlayerFoodShed,
        prodByIdx: Int32Array,
        capByIdx: Int32Array,
      ): number | null => {
        if (!this.ready) return null;
        let total = 0;
        for (let i = 0; i < shed.farms.length; i++) {
          const slot = this.slotOf.get(Number(shed.farms[i]));
          if (slot === undefined) {
            this.fallbacks += 1;
            return null;
          }
          prodByIdx[i] = this.prod[slot];
          capByIdx[i] = this.cap[slot];
          total += this.prod[slot];
          this.served += 1;
        }
        return total;
      },
    });
  }

  /** Install ONLY the shed flood — for the isolation probe, which needs to
   *  vary one seam at a time. */
  installShedOnly(): void {
    setShedFloodProvider({
      flood: (mg: Game, player: Player) => {
        if (!this.ready || this.shedRaw === null) return null;
        this.buildShed(mg.width() * mg.height());
        const tiles = this.shedTilesByOwner[player.smallID()] ?? [];
        if (tiles.length === 0) return null;
        return { tiles, dist: this.shedDist, cell: this.shedCell };
      },
    });
  }

  /** Hand every consumer back to the CPU. */
  dispose(): void {
    setDistrictYieldProvider(null);
    setFarmTickProvider(null);
    setShedFloodProvider(null);
    this.ready = false;
  }

  /** Copy a readable field back. O(field) — for aggregates, not planes. */
  async read(name: string): Promise<ArrayBuffer> {
    return this.kernel.readBuffer(name);
  }
}
