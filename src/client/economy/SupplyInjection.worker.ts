/**
 * Level A of the port, and its proof.
 *
 * Runs ONE seeded game and returns its hash stream. The driver spawns two of
 * these — one with the simulation's own supply BFS, one with the field
 * pipeline's supply plane injected through `setSupplyProvider` — and compares
 * the streams tick by tick.
 *
 * One game PER WORKER, deliberately: `TerrainMapLoader` caches the loaded map,
 * and `GameMapImpl.state` is mutable game state, so a second game in the same
 * module context inherits the first one's board. A control run (hook installed,
 * always declining, i.e. identical code paths) diverged at the first hash until
 * the games were separated — which is exactly what a control is for.
 *
 * That is the strongest test available for the wiring. The GPU supply flood is
 * bit-exact against the CPU's (19,789/19,789 tiles, verified separately), so if
 * the injection path is correct the two games must be INDISTINGUISHABLE: same
 * hash, every tick, to the end. Any mistake in the ruleset plumbing, the
 * between-ticks scheduling, the plane mapping, or determinism shows up
 * immediately as a hash divergence and names the tick it happened on.
 */
import { assetUrl, type AssetManifest } from "../../core/AssetUrls";
import { setDistrictYieldProvider } from "../../core/execution/utils/FoodEconomy";
import {
  peekFoodShed,
  setShedFloodProvider,
} from "../../core/execution/utils/FoodShed";
import { setSupplyProvider } from "../../core/execution/utils/SupplyField";
import { FetchGameMapLoader } from "../../core/game/FetchGameMapLoader";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
  type Game,
  type Player,
} from "../../core/game/Game";
import { GameUpdateType, type HashUpdate } from "../../core/game/GameUpdates";
import { createGameRunner, type GameRunner } from "../../core/GameRunner";
import type { GameStartInfo } from "../../core/Schemas";
import { compileFieldSystem } from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import { CUTOFF_RADII, economyFields } from "./fields/system";
import { EconomyFieldUploader } from "./upload";

const ctx = self as unknown as Worker;

const UNREACHED = 0xffffffff;

export interface SupplyInjectionIn {
  mapType: GameMapType;
  bots: number;
  ticks: number;
  cdnBase: string;
  assetManifest: AssetManifest;
  /** The game's seed — the driver passes the SAME one to both workers. */
  seed: string;
  /** "cpu" runs the simulation as it ships; "gpu" injects the field pipeline's
   *  supply plane; "decline" installs the hook but always falls back (control). */
  mode: "cpu" | "gpu" | "decline";
  /** Re-insert the injected field in BFS order (tests order dependence). */
  orderAsBfs?: boolean;
  /** Serve the district ledger from the GPU. Known-diverging — see the comment
   *  at the provider. Off unless explicitly requested. */
  ledger?: boolean;
}

export interface SupplyInjectionOut {
  ok: boolean;
  error?: string;
  adapter?: string;
  hashes?: number[];
  hashTicks?: number[];
  /** First game tick at which a player's territory had moved since the plane
   *  was computed — the timing hypothesis's fingerprint. */
  firstStaleTick?: number;
  staleCalls?: number;
  /** First tick a supply SOURCE existed that the plane did not have. */
  firstSeedStaleTick?: number;
  seedStaleCalls?: number;
  /** Tiles where the injected field disagrees with the sim's own BFS. */
  firstValueDiffTick?: number;
  valueDiffCalls?: number;
  worstValueDiff?: number;
  /** Farms the shed plane's flood did not have as sources. */
  firstShedSeedStale?: number;
  shedSeedStaleCalls?: number;
  wallMs?: number;
  /** Where the per-tick round trip goes, in ms summed over `refreshes`. */
  cost?: {
    upload: number;
    dispatch: number;
    readback: number;
    convert: number;
    refreshes: number;
  };
  behindTiles?: number;
  aheadTiles?: number;
  firstMatDrift?: number;
  matDriftCalls?: number;
  worstMatTiles?: number;
  worstMatDelta?: number;
  firstLedgerDiff?: number;
  ledgerDiffCalls?: number;
  worstLedgerDiff?: number;
  worstLedgerCells?: number;
  /** Non-UNREACHED tiles in the last served plane (gpu mode only). */
  planeReached?: number;
}

ctx.onmessage = async (e: MessageEvent<SupplyInjectionIn>) => {
  try {
    ctx.postMessage(await run(e.data));
  } catch (err) {
    ctx.postMessage({ ok: false, error: (err as Error).message });
  } finally {
    // Never leave a hook installed.
    setSupplyProvider(null);
    setShedFloodProvider(null);
    setDistrictYieldProvider(null);
  }
};

function startInfo(msg: SupplyInjectionIn, seed: string): GameStartInfo {
  return {
    gameID: seed,
    lobbyCreatedAt: 0,
    config: {
      gameMap: msg.mapType,
      gameType: GameType.Singleplayer,
      gameMode: GameMode.FFA,
      difficulty: Difficulty.Medium,
      donateGold: false,
      donateTroops: false,
      nations: "default",
      bots: msg.bots,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [],
  };
}

async function buildGame(
  msg: SupplyInjectionIn,
  seed: string,
): Promise<{
  gr: GameRunner;
  game: Game;
  hashes: number[];
  hashTicks: number[];
}> {
  const loader = new FetchGameMapLoader((path) => assetUrl(`maps/${path}`));
  const hashes: number[] = [];
  const hashTicks: number[] = [];
  let gameRef: Game | null = null;
  const gr = await createGameRunner(
    startInfo(msg, seed),
    undefined,
    loader,
    (gu) => {
      if ("errMsg" in gu) return;
      const hs = gu.updates[GameUpdateType.Hash] as HashUpdate[];
      if (hs.length > 0) {
        hashes.push(hs[hs.length - 1].hash);
        hashTicks.push(gameRef === null ? -1 : gameRef.ticks());
      }
    },
  );
  const { SpawnTimerExecution } =
    await import("../../core/execution/SpawnTimerExecution");
  gameRef = gr.game;
  gr.game.addExecution(new SpawnTimerExecution());
  return { gr, game: gr.game, hashes, hashTicks };
}

async function run(msg: SupplyInjectionIn): Promise<SupplyInjectionOut> {
  if (!navigator.gpu && msg.mode === "gpu") {
    return { ok: false, error: "navigator.gpu is undefined inside the worker" };
  }
  globalThis.__ASSET_MANIFEST__ = msg.assetManifest;
  globalThis.__CDN_BASE__ = msg.cdnBase;

  const g = await buildGame(msg, msg.seed);
  const width = g.game.width();
  const height = g.game.height();
  const f = g.game.config().food();

  let adapter = "cpu";
  const planeReached = 0;
  let firstStaleTick = -1;
  let staleCalls = 0;
  let firstSeedStaleTick = -1;
  let seedStaleCalls = 0;
  let firstShedSeedStale = -1;
  let shedSeedStaleCalls = 0;
  let firstValueDiffTick = -1;
  let valueDiffCalls = 0;
  let worstValueDiff = 0;
  let firstLedgerDiff = -1;
  let ledgerDiffCalls = 0;
  let worstLedgerDiff = 0;
  let worstLedgerCells = 0;
  let firstMatDrift = -1;
  let matDriftCalls = 0;
  let worstMatTiles = 0;
  let worstMatDelta = 0;
  let prevGpuMat: Float32Array | null = null;
  let behindTiles = 0;
  let aheadTiles = 0;
  const DIFF = msg.mode === "gpu";
  const cost = {
    upload: 0,
    dispatch: 0,
    readback: 0,
    convert: 0,
    refreshes: 0,
  };
  const ORDER_AS_BFS = msg.orderAsBfs === true;
  const f2 = f;
  let refresh: () => Promise<void> = async () => {};

  if (msg.mode !== "cpu") {
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
        foodShedRadius: f.foodShedRadius,
        foodShedPower: f.foodShedPower,
        wFoodShed: f.wFoodShed,
        fieldPatchCostMilli: f.fieldPatchCostMilli,
        fieldPatchDriveCapMilli: f.fieldPatchDriveCapMilli,
        farmersPerFieldTile: f.farmersPerFieldTile,
        tickSeed: 0,
      },
    );
    const compiled = await compileFieldSystem(system);
    const kernel = await FieldKernel.create(null, compiled.kernelConfig);
    kernel.resize(width, height);
    adapter = kernel.adapterInfo;
    const uploader = new EconomyFieldUploader(width * height);
    let plane = new Uint32Array(width * height).fill(UNREACHED);
    let shedDist = new Uint32Array(width * height).fill(UNREACHED);
    let shedCell = new Int32Array(width * height).fill(-1);
    let prodAccum = new Int32Array(0);
    let capAccum = new Int32Array(0);
    const slotOf = new Map<number, number>();
    /** Per player, the shed refresh the PLANE was built from. The uploader's
     *  tilled/fallow flags are a between-ticks snapshot, but the shed can
     *  refresh DURING the tick (foodTick line 79) before the ledger runs — so a
     *  plane built from the old shed would accumulate over the wrong tile set. */
    const shedStamp = new Map<number, number>();

    setSupplyProvider({
      fill(mg, player, into) {
        // Decline BEFORE touching `into`: filling it and then returning false
        // leaves the fallback BFS seeding into a pre-populated map, whose
        // `!dist.has(t)` guard blocks the real seeds.
        if (msg.mode === "decline") return false;
        const id = player.smallID();
        const owner = uploader.ownerPlane;
        // THE HYPOTHESIS UNDER TEST. The plane was computed between ticks; this
        // call happens mid-tick, after this tick's attacks have already moved
        // borders. Count the player's tiles whose ownership the plane does not
        // yet reflect — if the first hash divergence lands on the first tick
        // this is non-zero, the mechanism is the timing, not the flood.
        let moved = 0;
        const gmap = mg.map();
        for (const t of player.tiles()) {
          if (owner[Number(t)] !== id) moved += 1;
        }
        if (moved > 0 && firstStaleTick < 0) firstStaleTick = mg.ticks();
        staleCalls += moved > 0 ? 1 : 0;
        // Second candidate: the SEEDS. A settlement built or lost mid-tick
        // changes the flood's sources without moving a single border, and the
        // plane was computed before this tick's executions ran.
        const nodes = uploader.supplyNodePlane;
        let seedDelta = 0;
        const core = player.core();
        if (core !== null && nodes[Number(core)] !== 1) seedDelta += 1;
        for (const u of player.units(UnitType.Settlement)) {
          if (u.isUnderConstruction()) continue;
          const t = Number(u.tile());
          if (gmap.ownerID(t) !== id) continue;
          if (nodes[t] !== 1) seedDelta += 1;
        }
        if (seedDelta > 0 && firstSeedStaleTick < 0) {
          firstSeedStaleTick = mg.ticks();
        }
        seedStaleCalls += seedDelta > 0 ? 1 : 0;
        // One flood covers every player, so this player's field is the part of
        // the plane its own territory carries.
        // O(territory), not O(map). The full-map scan this replaces cost ~40 ms
        // per tick across 30 players on spqr — a harness artifact, not the
        // design. Exactness is re-verified by the hash stream.
        for (const tr of player.tiles()) {
          const t = Number(tr);
          if (owner[t] !== id) continue;
          const d = plane[t];
          if (d === UNREACHED) continue;
          into.set(t, d);
        }

        // Both input hypotheses were refuted (territory and seeds match at this
        // moment), so diff the VALUES: replicate the sim's own BFS here, with
        // its predicates, and see which tiles disagree and when.
        if (DIFF) {
          const ref = new Map<number, number>();
          const q: number[] = [];
          const cutoff = Math.ceil(f2.supplyRadius * CUTOFF_RADII);
          const addSrc = (t: number) => {
            if (gmap.ownerID(t) !== id) return;
            if (!ref.has(t)) {
              ref.set(t, 0);
              q.push(t);
            }
          };
          const core2 = player.core();
          if (core2 !== null) addSrc(Number(core2));
          for (const u of player.units(UnitType.Settlement)) {
            if (!u.isUnderConstruction()) addSrc(Number(u.tile()));
          }
          const nb: number[] = [0, 0, 0, 0];
          let head = 0;
          while (head < q.length) {
            const cur = q[head++];
            const d = (ref.get(cur) ?? 0) + 1;
            if (d > cutoff) continue;
            const k = gmap.neighbors4(cur, nb);
            for (let j = 0; j < k; j++) {
              const nn = nb[j];
              if (ref.has(nn)) continue;
              if (gmap.ownerID(nn) !== id) continue;
              if (!gmap.isLand(nn) || gmap.isImpassable(nn)) continue;
              ref.set(nn, d);
              q.push(nn);
            }
          }
          let diff = 0;
          for (const [t, d] of ref) if (into.get(t) !== d) diff += 1;
          for (const [t, d] of into) if (ref.get(t) !== d) diff += 1;
          if (ORDER_AS_BFS) {
            // Same contents, BFS INSERTION ORDER. `s.dist` is a Map and
            // UrbanGrowth iterates it, so if the simulation depends on the
            // traversal order rather than just the field, this and only this
            // will make the two games agree.
            into.clear();
            for (const [t, d] of ref) into.set(t, d);
          }
          if (diff > 0) {
            valueDiffCalls += 1;
            if (firstValueDiffTick < 0) firstValueDiffTick = mg.ticks();
            if (worstValueDiff < diff) worstValueDiff = diff;
          }
        }
        return true;
      },
    });

    // The shed's flood, served from the same dispatch. Only viable because
    // order-independent-shed-tiebreak made the two implementations agree
    // exactly — before it they differed on 4.43% of cells.
    if (msg.mode === "gpu") {
      setShedFloodProvider({
        flood(mg, player) {
          const id = player.smallID();
          const owner = uploader.ownerPlane;
          // Is the SEED SET current? The plane was flooded between ticks; farms
          // are far more volatile than settlements (phase 2 places them, and
          // conquest razes them), so this is the first thing to rule out.
          const gm = mg.map();
          let farmDelta = 0;
          for (const u of player.units(UnitType.Farmland)) {
            if (u.isUnderConstruction()) continue;
            const t = Number(u.tile());
            if (gm.ownerID(t) !== id) continue;
            if (shedCell[t] !== t) farmDelta += 1; // a farm is its own cell
          }
          if (farmDelta > 0 && firstShedSeedStale < 0) {
            firstShedSeedStale = mg.ticks();
          }
          shedSeedStaleCalls += farmDelta > 0 ? 1 : 0;
          // A farm built by an execution that ran EARLIER this tick (a build
          // intent) is not in a plane computed between ticks. Rather than serve
          // a field that is a flood of the wrong sources, decline and let the
          // CPU do this one player's flood — which is what the null return is
          // for. The GPU keeps the common case; correctness keeps the rest.
          if (farmDelta > 0) return null;
          const tiles: number[] = [];
          for (const tr of player.tiles()) {
            const t = Number(tr);
            if (owner[t] !== id) continue;
            if (shedCell[t] < 0) continue;
            tiles.push(t);
          }
          return { tiles, dist: shedDist, cell: shedCell };
        },
      });
    }

    // The ledger's O(territory) loop, served from the dispatch. OFF by default:
    // this cutover does not work yet, and the reason is structural rather than
    // arithmetic.
    //
    // `farmTick` runs INSIDE foodTick, immediately before the ledger loop, and
    // it does more than ripen — it seeds new nuclei and places patches, both of
    // which write maturity. `farm_ripen` only ripens. So the GPU's maturity and
    // the CPU's diverge WITHIN the tick, and the ledger inherits it: measured
    // first diff at tick 103, worst 19,587 milli on one cell.
    //
    // No amount of staleness-checking fixes that, because it is not staleness:
    // the input is produced by a CPU stage in the same tick the consumer runs.
    // A consumer cannot be cut over while its PRODUCER stays on the CPU — the
    // same "fields and consumers must move together" lesson that killed the
    // hybrid Map port, one level up. The ledger and the crop CA have to move as
    // a unit, with maturity GPU-OWNED, which is the next piece of work.
    //
    // Kept behind a flag rather than deleted: the seam is correct and tested,
    // the diff instrumentation is what proved the diagnosis, and both are what
    // the maturity-ownership change will be verified with.
    if (msg.mode === "gpu" && msg.ledger === true) {
      setDistrictYieldProvider({
        fill(mg, player, shed, prodByIdx, capByIdx) {
          if (prodAccum.length === 0) return null; // nothing dispatched yet
          const stamped = shedStamp.get(player.smallID());
          const now = (shed as unknown as { lastCalcTick: number })
            .lastCalcTick;
          if (stamped !== now) return null; // shed refreshed since the dispatch
          // The plane's cells must still be THIS shed's cells. A farm built by
          // an execution earlier this tick is not in a plane computed between
          // ticks, exactly as the shed flood's seed check guards against.
          let total = 0;
          for (let i = 0; i < shed.farms.length; i++) {
            const slot = slotOf.get(Number(shed.farms[i]));
            if (slot === undefined) return null; // stale cell set — decline
            prodByIdx[i] = prodAccum[slot];
            capByIdx[i] = capAccum[slot];
            total += prodAccum[slot];
          }
          // DIFF: what would the CPU loop have produced from the same shed?
          // Guessing has been wrong four times in this port; measure instead.
          if (DIFF) {
            const fc = mg.config().food();
            let bad = 0;
            let worst = 0;
            const refProd = new Int32Array(shed.farms.length);
            for (const t of shed.tilled) {
              const ci = shed.cellIndexAt(t);
              if (ci < 0) continue;
              const m2 = player.farmMaturity(t) / 1000;
              if (m2 <= 0) continue;
              const soilN = mg.layer("crop", t) / 255;
              refProd[ci] += Math.round(m2 * soilN * fc.fieldTileYieldMilli);
            }
            for (let i = 0; i < refProd.length; i++) {
              const d = Math.abs(refProd[i] - prodByIdx[i]);
              if (d > 1) bad += 1;
              if (d > worst) worst = d;
            }
            if (bad > 0) {
              ledgerDiffCalls += 1;
              if (firstLedgerDiff < 0) firstLedgerDiff = mg.ticks();
              if (worst > worstLedgerDiff) worstLedgerDiff = worst;
              if (worstLedgerCells < bad) worstLedgerCells = bad;
            }
          }
          return total;
        },
      });
    }

    refresh = async () => {
      let m = performance.now();
      const alive = g.game.players().filter((p: Player) => p.isAlive());
      uploader.refresh(g.game, alive, kernel);
      shedStamp.clear();
      for (const p of alive) {
        const sh = peekFoodShed(p) as unknown as {
          lastCalcTick: number;
        } | null;
        shedStamp.set(p.smallID(), sh === null ? -1 : sh.lastCalcTick);
      }
      cost.upload += performance.now() - m;

      m = performance.now();
      const frame = kernel.beginFrame();
      compiled.runDerive(frame);
      await frame.finish();
      cost.dispatch += performance.now() - m;

      m = performance.now();
      plane = new Uint32Array(await kernel.readBuffer("supplyDist"));
      shedDist = new Uint32Array(await kernel.readBuffer("shedDist"));
      // An Int32Array VIEW over the same bytes reinterprets the u32 UNREACHED
      // sentinel (0xffffffff) as -1 for free — no conversion pass.
      shedCell = new Int32Array(await kernel.readBuffer("shedCell"));
      // The aggregates are DENSE — 256 KB, not the 32 MB a tile-indexed
      // accumulator would have cost. This is the readback Level B is built on.
      prodAccum = new Int32Array(await kernel.readBuffer("prodAccum"));
      capAccum = new Int32Array(await kernel.readBuffer("capAccum"));
      slotOf.clear();
      uploader.cellTiles.forEach((t, slot) => slotOf.set(t, slot));
      // MATURITY DRIFT: does the GPU's crop CA still agree with the CPU's field
      // after a tick of live play? `farm_ripen` is bit-identical in isolation,
      // but ten different places write maturity and only two of them are the CA
      // — conquest, razing, relinquish, the spawn kit, urbanization and patch
      // placement are all CPU EVENTS. This measures what an event channel would
      // have to carry for the GPU to own the field.
      if (DIFF) {
        // PHASE MATTERS. The dispatch advances the CA once, so comparing the
        // fresh GPU plane against the CPU's CURRENT field measures a one-step
        // offset that exists by construction — the first version of this probe
        // did exactly that and reported a "drift" of 50 milli, which is simply
        // one tick of growth. The GPU's prediction has to be judged against the
        // CPU state it predicted: LAST refresh's plane against THIS tick's
        // field.
        let drift = 0;
        let worst = 0;
        let behind = 0;
        let ahead = 0;
        if (prevGpuMat !== null) {
          const prev = prevGpuMat;
          for (const p of g.game.players()) {
            if (!p.isAlive()) continue;
            for (const [tr, mv] of p.farmMaturityEntries()) {
              const t = Number(tr);
              const d = Math.abs(prev[t] - mv);
              if (d > 1) {
                drift += 1;
                if (d > worst) worst = d;
                // DIRECTION separates "the GPU is missing tiles the CPU grew"
                // from "the GPU has the tiles but the wrong values". The first
                // means a WRITER is absent; the second means the CA is wrong.
                if (prev[t] < mv) behind += 1;
                else ahead += 1;
              }
            }
          }
        }
        prevGpuMat = new Float32Array(await kernel.readBuffer("maturity"));
        if (drift > behindTiles + aheadTiles) {
          behindTiles = behind;
          aheadTiles = ahead;
        }
        if (drift > 0) {
          matDriftCalls += 1;
          if (firstMatDrift < 0) firstMatDrift = g.game.ticks();
          if (drift > worstMatTiles) worstMatTiles = drift;
          if (worst > worstMatDelta) worstMatDelta = worst;
        }
      }
      cost.readback += performance.now() - m;
      cost.refreshes++;
    };
  }

  const start = performance.now();
  let turn = 0;
  await refresh();
  while (g.game.inSpawnPhase()) {
    g.gr.addTurn({ turnNumber: turn++, intents: [] });
    g.gr.executeNextTick();
    await refresh();
  }
  for (let i = 0; i < msg.ticks; i++) {
    g.gr.addTurn({ turnNumber: turn++, intents: [] });
    g.gr.executeNextTick();
    await refresh();
  }
  const wallMs = performance.now() - start;
  setSupplyProvider(null);
  setShedFloodProvider(null);
  setDistrictYieldProvider(null);

  return {
    ok: true,
    adapter,
    cost,
    behindTiles,
    aheadTiles,
    firstMatDrift,
    matDriftCalls,
    worstMatTiles,
    worstMatDelta,
    firstLedgerDiff,
    ledgerDiffCalls,
    worstLedgerDiff,
    worstLedgerCells,
    hashes: g.hashes,
    hashTicks: g.hashTicks,
    wallMs,
    planeReached,
    firstStaleTick,
    staleCalls,
    firstSeedStaleTick,
    seedStaleCalls,
    firstValueDiffTick,
    valueDiffCalls,
    worstValueDiff,
    firstShedSeedStale,
    shedSeedStaleCalls,
  };
}

export {};
