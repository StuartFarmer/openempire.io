/**
 * Does the GPU economy actually work where the SIMULATION lives?
 *
 * Everything measured so far ran the floods on the main thread against dumped
 * inputs. The sim runs in a Web Worker, so the port hinges on a question no
 * page-side benchmark answers: can a worker own a WebGPU device, upload live
 * game state, dispatch, and read back — and does the result still match the CPU
 * field the sim just computed for itself?
 *
 * This worker answers exactly that and nothing else. It builds a real game with
 * the same assembly as ShellSim.worker, ticks it, computes BOTH fields both
 * ways, compares, and posts the verdict. The GPU result is discarded — no sim
 * state is touched — so this can run against the shipping game with zero risk.
 */
import { assetUrl, type AssetManifest } from "../../core/AssetUrls";
import { supplyField } from "../../core/execution/utils/SupplyField";
import { FetchGameMapLoader } from "../../core/game/FetchGameMapLoader";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
  type Player,
} from "../../core/game/Game";
import { createGameRunner } from "../../core/GameRunner";
import type { GameStartInfo } from "../../core/Schemas";
import { generateID } from "../../core/Util";
import { compileFieldSystem } from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import { CUTOFF_RADII, economyFields } from "./fields/system";
import { buildEconomyInputs } from "./inputs";
import { EconomyFieldUploader } from "./upload";

const ctx = self as unknown as Worker;

export interface FieldProbeIn {
  mapType: GameMapType;
  bots: number;
  ticks: number;
  cdnBase: string;
  assetManifest: AssetManifest;
}

export interface FieldProbeOut {
  ok: boolean;
  error?: string;
  adapter?: string;
  /** Wall time of the flood dispatch itself (both floods, every player). */
  gpuMs?: number;
  /** Wall time of pushing the three input planes to the GPU, in full. */
  uploadMs?: number;
  /** One full refresh cadence of CPU supply — the baseline to beat. */
  cpuSupplyCycleMs?: number;
  /** Stage 3: assessUrbanRoom's iteration re-expressed as a GPU count. */
  /** Farm ripen CA on the GPU vs the CPU's own advance. */
  /** District ledger: per-cell integer totals, GPU vs CPU. */
  /** Placement draw: mean suitability of the winner vs the weighted mean. */
  picksChecked?: number;
  picksValid?: number;
  drawTrials?: number;
  drawMeanSuit?: number;
  drawExpected?: number;
  cellsCompared?: number;
  cellsStaleSkipped?: number;
  /** Same comparison driven entirely from the GPU's own input planes. */
  isoCells?: number;
  isoExact?: number;
  isoWorst?: number;
  cellsExact?: number;
  cellWorstProd?: number;
  cellWorstCap?: number;
  ripenCompared?: number;
  ripenExact?: number;
  ripenMaxDiff?: number;
  ripenSamples?: string[];
  roomPlayers?: number;
  roomExact?: number;
  roomWorstDiff?: number;
  roomFreshPlayers?: number;
  roomFreshExact?: number;
  roomFreshWorstDiff?: number;
  roomReadbackMs?: number;
  /** Stage 1: the suitability consumer, run on the GPU against the resident
   *  flood output, diffed per tile against UrbanGrowth.urbanSuitability. */
  suitCompared?: number;
  suitMaxAbsDiff?: number;
  suitOver1e4?: number;
  /** GPU→CPU copy of the supply plane. */
  readbackMs?: number;
  /** Rebuilding the per-player Map<TileRef, number> the sim consumes. */
  materialiseMs?: number;
  mapEntries?: number;
  /** Medians over 5 refresh cycles, sending only what changed. */
  deltaRebuildMs?: number;
  deltaUploadMs?: number;
  deltaFloodMs?: number;
  deltaChangedTiles?: number;
  deltaRuns?: number;
  deltaElements?: number;
  /** Wall time of the CPU's own recompute of the same fields. */
  cpuMs?: number;
  width?: number;
  height?: number;
  tick?: number;
  players?: number;
  /** Supply carries no source id, so this must be exact. */
  supply?: {
    both: number;
    same: number;
    onlyCpu: number;
    onlyCpuFresh: number;
    onlyGpu: number;
    onlyGpuFresh: number;
    /** Both covered, values differ, owner NOT stale — a real disagreement. */
    diffFresh: number;
  };
  /** The shed's distances must be exact; cells may differ at equal-distance
   *  ties until order-independent-shed-tiebreak lands. */
  shed?: {
    both: number;
    sameCell: number;
    onlyCpu: number;
    onlyCpuFresh: number;
    onlyGpu: number;
    onlyGpuFresh: number;
    diffFresh: number;
  };
}

ctx.onmessage = async (e: MessageEvent<FieldProbeIn>) => {
  try {
    ctx.postMessage(await run(e.data));
  } catch (err) {
    ctx.postMessage({ ok: false, error: (err as Error).message });
  }
};

async function run(msg: FieldProbeIn): Promise<FieldProbeOut> {
  if (!navigator.gpu) {
    return { ok: false, error: "navigator.gpu is undefined inside the worker" };
  }
  globalThis.__ASSET_MANIFEST__ = msg.assetManifest;
  globalThis.__CDN_BASE__ = msg.cdnBase;

  const clientID = generateID();
  const gameStart: GameStartInfo = {
    gameID: generateID(),
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
    players: [{ clientID, username: "Probe", clanTag: null }],
  };
  const loader = new FetchGameMapLoader((path) => assetUrl(`maps/${path}`));
  const gr = await createGameRunner(gameStart, clientID, loader, () => {});
  const game = gr.game;

  // Singleplayer has no spawn timer (only multiplayer gets one) and there is no
  // human here to end the phase, so tick it out the way the ambient backdrop
  // does: nations place spawns, then the game runs.
  const { SpawnTimerExecution } =
    await import("../../core/execution/SpawnTimerExecution");
  game.addExecution(new SpawnTimerExecution());
  let turn = 0;
  const tick = () => {
    gr.addTurn({ turnNumber: turn++, intents: [] });
    gr.executeNextTick();
  };
  while (game.inSpawnPhase()) tick();
  for (let i = 0; i < msg.ticks; i++) tick();

  const width = game.width();
  const height = game.height();
  const n = width * height;
  const alive: Player[] = game.players().filter((p) => p.isAlive());
  const f = game.config().food();
  const tenureCurveOf = (tenureMilli: number): number =>
    tenureMilli <= 0
      ? 0
      : tenureMilli / (tenureMilli + f.tenureHalfTicks * 1000);

  // ── The CPU's own fields, timed. `supplyField` caches on a cadence, so this
  // is the cost of the recompute the sim would pay this refresh.
  const { foodShedField } = await import("../../core/execution/utils/FoodShed");
  const cpuStart = performance.now();
  const cpuSupply = new Int32Array(n).fill(-1);
  const cpuCell = new Int32Array(n).fill(-1);
  // Both CPU fields are cached on a staggered per-player cadence, so each is up
  // to `supplyRefreshTicks` old while the GPU floods the CURRENT territory. A
  // tile conquered since a player's last refresh is therefore absent from the
  // CPU field and present in the GPU one — expected, and the reason
  // `probeDistance` exists. Record each player's refresh tick so those tiles can
  // be attributed to staleness instead of being waved through.
  const staleSupply = new Set<number>();
  const staleShed = new Set<number>();
  // Which player's cached field contributed each tile — a stale field can also
  // hold tiles that player has since LOST, which the current-state flood
  // correctly omits. That is the mirror of the extra-coverage case and has to
  // be attributed the same way rather than counted as a disagreement.
  const cpuSupplyOwner = new Uint32Array(n);
  const cpuShedOwner = new Uint32Array(n);
  for (const p of alive) {
    const id = p.smallID();
    const supply = supplyField(game, p);
    for (const [t, d] of supply.dist) {
      cpuSupply[t] = d;
      cpuSupplyOwner[t] = id;
    }
    if (supply.lastCalcTick !== game.ticks()) staleSupply.add(id);
    const shed = foodShedField(game, p);
    for (const t of shed.tiles) {
      cpuCell[t] = shed.cellAt(t);
      cpuShedOwner[t] = id;
    }
    if (shed.lastCalcTick !== game.ticks()) staleShed.add(id);
  }
  const cpuMs = performance.now() - cpuStart;

  // ── The same fields on a device this worker owns.
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
      tickSeed: game.ticks() >>> 0,
    },
  );
  const compiled = await compileFieldSystem(system);
  const kernel = await FieldKernel.create(null, compiled.kernelConfig);
  kernel.resize(width, height);
  const inputs = buildEconomyInputs(game, alive);

  // Static map planes (never change) + the sim's per-tile density, which the
  // suitability consumer reads. Density is per-player on the CPU; a tile's value
  // belongs to its owner, so a merged plane plus the owner gate reproduces it.
  const cropPlane = new Float32Array(n);
  const waterPlane = new Float32Array(n);
  const shorePlane = new Float32Array(n);
  const gmap = game.map();
  for (let t = 0; t < n; t++) {
    cropPlane[t] = game.layer("crop", t);
    waterPlane[t] = game.layer("water", t);
    shorePlane[t] = gmap.isShoreline(t) || gmap.isOceanShore(t) ? 1 : 0;
  }
  const plotFarmPlane = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    plotFarmPlane[t] = game.plotAt(t)?.type() === UnitType.Farmland ? 1 : 0;
  }
  kernel.writeBuffer("plotFarm", plotFarmPlane);
  const densityPlane = new Float32Array(n);
  for (const p of alive) {
    for (const [t, d] of p.densityEntries()) densityPlane[Number(t)] = d;
  }
  kernel.writeBuffer("crop", cropPlane);
  kernel.writeBuffer("water", waterPlane);
  kernel.writeBuffer("shore", shorePlane);
  kernel.writeBuffer("density", densityPlane);

  // Timed separately, because they are separate problems: the flood is the
  // algorithm, the upload is three whole map-sized planes pushed across the bus
  // every refresh (24 MB at 2048×1024). If the upload dominates, the fix is
  // delta uploads — the same run-merged technique the shell already uses for
  // its conduits — not a faster flood.
  // `runDerive` does NOT clear anything — `clearable` only makes a buffer
  // clearable, it is not automatic. An atomic accumulator therefore SUMS across
  // every pipeline run unless the caller resets it, which is exactly how the
  // room count came out 7x too high. Anything that accumulates must be cleared
  // here, at the one place the pipeline is invoked.
  const pickInit = new Uint32Array(256).fill(0xffffffff);
  const runPipeline = async (): Promise<void> => {
    kernel.clearBuffer("roomCount");
    // A MIN-reduction cannot start at zero — `clearBuffer` zeroes, and
    // atomicMin(0, anything) is 0, so the winner would always be "nothing" and
    // no tile would ever match the winning key. Seed both to u32 MAX.
    kernel.writeBuffer("pickKey", pickInit);
    kernel.writeBuffer("pickTile", pickInit);
    const frame = kernel.beginFrame();
    compiled.runDerive(frame);
    await frame.finish();
  };

  let gpuMs = 0;
  let uploadMs = 0;
  for (let pass = 0; pass < 2; pass++) {
    const t0 = performance.now();
    kernel.writeBuffer("owner", inputs.owner);
    kernel.writeBuffer("farmMaturity", inputs.farmMaturity);
    kernel.writeBuffer("supplyNode", inputs.supplyNode);
    const t1 = performance.now();
    await runPipeline();
    // Second pass only: pipelines are warm by then.
    uploadMs = t1 - t0;
    gpuMs = performance.now() - t1;
  }
  const gpuSupply = new Uint32Array(await kernel.readBuffer("supplyDist"));
  const gpuCell = new Uint32Array(await kernel.readBuffer("shedCell"));

  const UNREACHED = 0xffffffff;
  const supply = {
    both: 0,
    same: 0,
    onlyCpu: 0,
    onlyCpuFresh: 0,
    onlyGpu: 0,
    onlyGpuFresh: 0,
    diffFresh: 0,
  };
  const shed = {
    both: 0,
    sameCell: 0,
    onlyCpu: 0,
    onlyCpuFresh: 0,
    onlyGpu: 0,
    onlyGpuFresh: 0,
    diffFresh: 0,
  };
  for (let i = 0; i < n; i++) {
    const owner = inputs.owner[i];
    const cs = cpuSupply[i] >= 0;
    const gs = gpuSupply[i] !== UNREACHED;
    if (cs && gs) {
      supply.both += 1;
      if (cpuSupply[i] === gpuSupply[i]) supply.same += 1;
      // A stale field also holds stale DISTANCES: territory gained since its
      // refresh can open a shorter path that the current-state flood finds and
      // the cached one cannot. Only a fresh owner must agree exactly.
      else if (!staleSupply.has(cpuSupplyOwner[i])) supply.diffFresh += 1;
    } else if (cs) {
      supply.onlyCpu += 1;
      // Held only by the CPU field: expected when that player's field is stale
      // or the tile has changed hands since it was computed.
      const was = cpuSupplyOwner[i];
      if (!staleSupply.has(was) && was === owner) supply.onlyCpuFresh += 1;
    } else if (gs) {
      supply.onlyGpu += 1;
      // Reached only by the GPU AND its owner's field is current → the two
      // floods genuinely disagree, which for a source-less flood is a bug.
      if (!staleSupply.has(owner)) supply.onlyGpuFresh += 1;
    }

    const cc = cpuCell[i] >= 0;
    const gc = gpuCell[i] !== UNREACHED;
    if (cc && gc) {
      shed.both += 1;
      if (cpuCell[i] === gpuCell[i]) shed.sameCell += 1;
      else if (!staleShed.has(cpuShedOwner[i])) shed.diffFresh += 1;
    } else if (cc) {
      shed.onlyCpu += 1;
      const was = cpuShedOwner[i];
      if (!staleShed.has(was) && was === owner) shed.onlyCpuFresh += 1;
    } else if (gc) {
      shed.onlyGpu += 1;
      if (!staleShed.has(owner)) shed.onlyGpuFresh += 1;
    }
  }

  // ── What a REAL refresh costs: keep the planes resident, advance the game a
  // full refresh cadence, then push only what moved. The full-plane upload
  // above is the naive path; this is the one the sim would actually run.
  // Repeated, because single samples on a headless GPU are far too noisy to
  // tell 5 ms from 15 ms — earlier one-shot numbers here swung 2×. Each cycle
  // advances a full refresh cadence and re-measures; the caller takes medians.
  const uploader = new EconomyFieldUploader(n);
  uploader.refresh(game, alive, kernel); // seed the mirrors (full upload)
  const rebuildSamples: number[] = [];
  const uploadSamples: number[] = [];
  const floodSamples: number[] = [];
  let deltaChangedTiles = 0;
  let deltaRuns = 0;
  let deltaElements = 0;
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let i = 0; i < f.supplyRefreshTicks; i++) tick();
    const delta = uploader.refresh(
      game,
      game.players().filter((p) => p.isAlive()),
      kernel,
    );
    rebuildSamples.push(delta.rebuildMs);
    uploadSamples.push(delta.uploadMs);
    const dFlood = performance.now();
    await runPipeline();
    floodSamples.push(performance.now() - dFlood);
    deltaChangedTiles = delta.changedTiles;
    deltaRuns = delta.runs;
    deltaElements = delta.elements;
  }
  const median = (xs: number[]): number =>
    xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  // ── THE DECISIVE COST: the sim reads `PlayerSupply.dist`, a
  // Map<TileRef, number>, in several places (supplyQuality, probeDistance,
  // EconomyModel). The GPU produces a typed array. So a real port must either
  // pay to MATERIALISE those Maps every refresh, or change every consumer to
  // index a plane. Measure the materialisation against the CPU cost it would
  // replace — if it is not clearly cheaper, the readback-and-rebuild shape is
  // the wrong design and the consumers have to change instead.
  //
  // Baseline: one full refresh CADENCE of CPU supply. Refreshes are staggered
  // by smallID, so across `period` consecutive ticks every player recomputes
  // exactly once — summing the calls over that window is precisely the work
  // the GPU path has to beat.
  const period = f.supplyRefreshTicks;
  let cpuSupplyCycleMs = 0;
  for (let i = 0; i < period; i++) {
    tick();
    const t0 = performance.now();
    for (const p of game.players()) {
      if (p.isAlive()) supplyField(game, p);
    }
    cpuSupplyCycleMs += performance.now() - t0;
  }

  // The GPU path, phase by phase.
  const ownerPlane = uploader.ownerPlane;
  const readSamples: number[] = [];
  const buildSamples: number[] = [];
  let mapEntries = 0;
  for (let cycle = 0; cycle < 5; cycle++) {
    const tRead = performance.now();
    const plane = new Uint32Array(await kernel.readBuffer("supplyDist"));
    readSamples.push(performance.now() - tRead);

    const tBuild = performance.now();
    // One pass over the plane, routing each reached tile into its owner's Map —
    // O(reached tiles), not O(players × grid).
    const byPlayer = new Map<number, Map<number, number>>();
    for (let t = 0; t < n; t++) {
      const d = plane[t];
      if (d === 0xffffffff) continue;
      const o = ownerPlane[t];
      if (o === 0) continue;
      let m = byPlayer.get(o);
      if (m === undefined) {
        m = new Map<number, number>();
        byPlayer.set(o, m);
      }
      m.set(t, d);
    }
    buildSamples.push(performance.now() - tBuild);
    let entries = 0;
    for (const m of byPlayer.values()) entries += m.size;
    mapEntries = entries;
  }
  const readbackMs = median(readSamples);
  const materialiseMs = median(buildSamples);

  // ── STAGE 1: can a CONSUMER live on the GPU? The suitability pass read
  // `supplyDist` in place, one dispatch after the flood wrote it, with no
  // readback in between. Compare it per-tile against the CPU's own
  // urbanSuitability. Restricted to tiles where the two supply distances AGREE,
  // so what is being tested is the consumer's arithmetic and not the cache
  // staleness already characterised above.
  const { urbanSuitability } =
    await import("../../core/execution/utils/UrbanGrowth");
  // Density is a LIVE sim quantity and the probe has ticked ~60 times since the
  // planes were first uploaded. Refresh it (and re-run the pipeline) so the
  // comparison is against the same state the CPU is about to read, rather than
  // measuring how stale the upload got.
  densityPlane.fill(0);
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    for (const [t, d] of p.densityEntries()) densityPlane[Number(t)] = d;
  }
  kernel.writeBuffer("density", densityPlane);
  for (let t = 0; t < n; t++) {
    plotFarmPlane[t] = game.plotAt(t)?.type() === UnitType.Farmland ? 1 : 0;
  }
  kernel.writeBuffer("plotFarm", plotFarmPlane);
  // …and the owner/seed planes too. The cpuSupplyCycle loop above ticked a full
  // cadence after the last uploader refresh, so leaving them would compare a
  // 10-tick-old territory against a current CPU count — the same stale-upload
  // trap that made density look like a shader bug earlier.
  uploader.refresh(
    game,
    game.players().filter((p) => p.isAlive()),
    kernel,
  );
  await runPipeline();
  // ── FARM RIPEN: snapshot the crop CA's state, upload it with the planes the
  // pass reads, advance the SIM one tick, and check the GPU pass landed on the
  // same maturity the CPU did. Excludes tiles the other phases touched in that
  // tick (a new plot placed, ground urbanized or conquered) — those are entity
  // work, not the ripen CA.
  const { isFallow } = await import("../../core/execution/utils/FoodShed");
  const before = new Float32Array(n);
  const flagsPlane = new Uint32Array(n);
  const tenurePlane = new Float32Array(n);
  const tempPlane = new Float32Array(n);
  const humPlane = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    tempPlane[t] = game.layer("temperature", t);
    humPlane[t] = game.layer("humidity", t);
    if (game.tileDamage(t) > 0) flagsPlane[t] |= 1;
    if (game.plotAt(t)?.type() === UnitType.Farmland) flagsPlane[t] |= 4;
    if (game.plotAt(t) !== undefined) flagsPlane[t] |= 64; // any plot at all
    tenurePlane[t] = game.tileTenure(t);
  }
  const { LandUse } = await import("../../core/game/Game");
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const shed = foodShedField(game, p);
    for (const [t, m] of p.farmMaturityEntries()) before[Number(t)] = m;
    for (const t of p.tiles()) {
      const tile = Number(t);
      if (p.landUse(t) === LandUse.Field) flagsPlane[tile] |= 2;
      if (p.landUse(t) === LandUse.Urban) flagsPlane[tile] |= 32;
      if (isFallow(shed, t)) flagsPlane[tile] |= 8;
      if (shed.tilled.has(t)) flagsPlane[tile] |= 16;
    }
  }
  kernel.writeBuffer("temperature", tempPlane);
  kernel.writeBuffer("humidity", humPlane);
  kernel.writeBuffer("farmFlags", flagsPlane);
  kernel.writeBuffer("tenure", tenurePlane);
  kernel.writeBuffer("maturity", before);
  await runPipeline();
  const gpuMaturity = new Float32Array(await kernel.readBuffer("maturity"));

  // ── DISTRICT YIELD: the ledger's per-tile half. Compare the GPU's per-cell
  // integer totals against the CPU's own, computed from the same state with the
  // same rounding. Integer atomicAdd is order-independent, so these must agree
  // EXACTLY — a float sum never could.
  const gpuProd = new Int32Array(await kernel.readBuffer("prodAccum"));
  const gpuCap = new Int32Array(await kernel.readBuffer("capAccum"));
  // Reference built from the planes the GPU ACTUALLY read — its own cell
  // assignment, the uploaded flags, the uploaded owner — so the only thing
  // under test is the arithmetic and the order-independent accumulation.
  // Anything left over after this is an input-mapping bug in the harness, not
  // in the pass, and this separates the two.
  const gpuCells = new Uint32Array(await kernel.readBuffer("shedCell"));
  const refProd = new Map<number, number>();
  const refCap = new Map<number, number>();
  const ownerNow = uploader.ownerPlane;
  for (let t = 0; t < n; t++) {
    if (ownerNow[t] === 0) continue;
    if ((flagsPlane[t] & 16) === 0) continue;
    const cell = gpuCells[t];
    if (cell === 0xffffffff) continue;
    refCap.set(
      cell,
      (refCap.get(cell) ?? 0) +
        Math.round(f.fieldTileStorageMilli * tenureCurveOf(tenurePlane[t])),
    );
    const m = gpuMaturity[t] / 1000;
    if (m <= 0) continue;
    refProd.set(
      cell,
      (refProd.get(cell) ?? 0) +
        Math.round(m * (cropPlane[t] / 255) * f.fieldTileYieldMilli),
    );
  }
  let isoCells = 0;
  let isoExact = 0;
  let isoWorst = 0;
  for (const [cell, v] of refProd) {
    isoCells += 1;
    const d = Math.abs(v - gpuProd[cell]);
    if (d === 0 && (refCap.get(cell) ?? 0) === gpuCap[cell]) isoExact += 1;
    if (d > isoWorst) isoWorst = d;
  }
  let cellsCompared = 0;
  let cellsExact = 0;
  let cellWorstProd = 0;
  let cellWorstCap = 0;
  let cellsStaleSkipped = 0;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const shed = foodShedField(game, p);
    // Cell assignment comes from the CPU's CACHED shed but the GPU floods
    // current territory, so a stale player's districts legitimately differ.
    // Only a player whose shed is current is required to match.
    if (shed.lastCalcTick !== game.ticks()) {
      cellsStaleSkipped += shed.farms.length;
      continue;
    }
    const prod = new Int32Array(shed.farms.length);
    const cap = new Int32Array(shed.farms.length);
    for (const t of shed.tilled) {
      const ci = shed.cellIndexAt(t);
      if (ci < 0) continue;
      cap[ci] += Math.round(
        f.fieldTileStorageMilli * tenureCurveOf(game.tileTenure(t)),
      );
      // The sim ripens BEFORE it harvests (foodTick calls farmTick first), and
      // the pipeline does the same, so the yield pass sees POST-ripen maturity.
      // The reference has to use the same input — `p.farmMaturity` here is
      // still the pre-ripen snapshot. Ripen is independently verified
      // bit-identical, so feeding its output in tests only the accumulation.
      const m = gpuMaturity[Number(t)] / 1000;
      if (m <= 0) continue;
      prod[ci] += Math.round(
        m * (game.layer("crop", t) / 255) * f.fieldTileYieldMilli,
      );
    }
    for (let ci = 0; ci < shed.farms.length; ci++) {
      const cell = Number(shed.farms[ci]);
      cellsCompared += 1;
      const dp = Math.abs(prod[ci] - gpuProd[cell]);
      const dc = Math.abs(cap[ci] - gpuCap[cell]);
      if (dp === 0 && dc === 0) cellsExact += 1;
      if (dp > cellWorstProd) cellWorstProd = dp;
      if (dc > cellWorstCap) cellWorstCap = dc;
    }
  }

  // ── PLACEMENT DRAW: the GPU picks by an exponential race, the CPU by a
  // linear weighted scan. Different randomness, so the TILE will differ — what
  // must match is the LAW. Run the draw many times with different seeds and
  // check the mean suitability of the winners against the weighted mean the CPU
  // samples from (E[suit] under p(t) ∝ suit is Σsuit²/Σsuit).
  const gpuSuitPlane = new Float32Array(await kernel.readBuffer("suitability"));
  let drawTrials = 0;
  let drawMeanSuit = 0;
  let drawExpected = 0;
  {
    // The subject: the living player with the most eligible ground.
    let best: Player | null = null;
    for (const p of game.players()) {
      if (!p.isAlive()) continue;
      if (best === null || p.numTilesOwned() > best.numTilesOwned()) best = p;
    }
    if (best !== null) {
      const id = best.smallID();
      // Collect the candidates ONCE; the trials then scan a few thousand
      // entries instead of the whole grid, which is what makes enough draws to
      // tell sampling error from bias affordable.
      const candTile: number[] = [];
      const candW: number[] = [];
      let sum = 0;
      let sumSq = 0;
      for (let t = 0; t < n; t++) {
        if (ownerPlane[t] !== id) continue;
        if ((flagsPlane[t] & 3) !== 0) continue; // damaged or field-zoned
        if (densityPlane[t] >= f.popPerDensity) continue;
        const w = gpuSuitPlane[t];
        if (w <= 0) continue;
        candTile.push(t);
        candW.push(w);
        sum += w;
        sumSq += w * w;
      }
      drawExpected = sum > 0 ? sumSq / sum : 0;
      // The draw is a pure function of (tile, seed), so it can be replayed on
      // the CPU with the shader's own hash — this tests the RACE, not the
      // shader's arithmetic, which is what the law depends on.
      const hash01 = (t: number, seed: number): number => {
        let h = (Math.imul(t, 747796405) + Math.imul(seed, 2891336453)) >>> 0;
        h = (Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 277803737) >>> 0) >>> 0;
        h = ((h >>> 22) ^ h) >>> 0;
        return Math.min(Math.max(h / 4294967296, 1e-7), 0.9999999);
      };
      let acc = 0;
      for (let trial = 0; trial < 20000; trial += 1) {
        let bestKey = Infinity;
        let bestSuit = 0;
        for (let k = 0; k < candTile.length; k += 1) {
          const w = candW[k];
          const key = -Math.log(hash01(candTile[k], trial + 1)) / w;
          if (key < bestKey) {
            bestKey = key;
            bestSuit = w;
          }
        }
        if (bestKey < Infinity) {
          acc += bestSuit;
          drawTrials += 1;
        }
      }
      drawMeanSuit = drawTrials > 0 ? acc / drawTrials : 0;
    }
  }

  // And the SHADER's own output: every player's picked tile must be eligible,
  // and its key must be the winning key — otherwise the race is right but the
  // pass implementing it is not.
  const gpuPickTile = new Uint32Array(await kernel.readBuffer("pickTile"));
  let picksChecked = 0;
  let picksValid = 0;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const id = p.smallID();
    const t = gpuPickTile[id];
    if (t === 0xffffffff || t >= n) continue; // no eligible ground this tick
    picksChecked += 1;
    const eligible =
      ownerPlane[t] === id &&
      (flagsPlane[t] & 3) === 0 &&
      densityPlane[t] < f.popPerDensity &&
      gpuSuitPlane[t] > 0;
    if (eligible) picksValid += 1;
  }

  // Snapshot the state the OTHER phases mutate, so their writes can be told
  // apart from the ripen CA's. Urbanizing a tile zeroes its maturity
  // (addCityTiles), conquest resets it, and phase 2 seeds new plots — none of
  // which this pass models.
  const ownerBefore = new Uint32Array(n);
  const densityBefore = new Float32Array(n);
  for (let t = 0; t < n; t++) ownerBefore[t] = game.map().ownerID(t);
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    for (const [t, d] of p.densityEntries()) densityBefore[Number(t)] = d;
  }

  tick(); // the CPU advances its own crop CA

  const after = new Float32Array(n);
  const densityAfter = new Float32Array(n);
  const placedThisTick = new Set<number>();
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    for (const [t, m] of p.farmMaturityEntries()) after[Number(t)] = m;
    for (const [t, d] of p.densityEntries()) densityAfter[Number(t)] = d;
  }
  const CITY_TILE = f.popPerDensity;
  for (let t = 0; t < n; t++) {
    if (game.map().ownerID(t) !== ownerBefore[t]) placedThisTick.add(t);
    else if (densityAfter[t] >= CITY_TILE && densityBefore[t] < CITY_TILE) {
      placedThisTick.add(t); // paved this tick — maturity wiped by the city
    } else if (before[t] === 0 && after[t] > 0) {
      placedThisTick.add(t); // a new plot seeded by phase 2
    }
  }
  let ripenCompared = 0;
  let ripenExact = 0;
  let ripenMaxDiff = 0;
  const ripenSamples: string[] = [];
  for (let t = 0; t < n; t++) {
    if (before[t] === 0 && after[t] === 0) continue;
    if (placedThisTick.has(t)) continue;
    ripenCompared += 1;
    const d = Math.abs(after[t] - gpuMaturity[t]);
    if (d === 0) ripenExact += 1;
    if (d > ripenMaxDiff) ripenMaxDiff = d;
    if (d > 0 && ripenSamples.length < 6) {
      ripenSamples.push(
        `tile ${t} before=${before[t]} cpuAfter=${after[t]} gpu=${gpuMaturity[t]} ` +
          `flags=${flagsPlane[t]} owner=${inputs.owner[t]}`,
      );
    }
  }

  const gpuSuit = new Float32Array(await kernel.readBuffer("suitability"));
  // STAGE 3: the iteration-as-reduction check. `roomCount` is 256 u32s.
  const tRoom = performance.now();
  const gpuRoom = new Uint32Array(await kernel.readBuffer("roomCount"));
  const roomReadbackMs = performance.now() - tRoom;
  const { assessUrbanRoom } =
    await import("../../core/execution/utils/EconomyModel");
  // Same staleness caveat as everywhere else: the CPU counts over its CACHED
  // supply field while the GPU counts over the fresh flood, so only players
  // whose field is current are required to match.
  let roomPlayers = 0;
  let roomExact = 0;
  let roomWorstDiff = 0;
  let roomFreshPlayers = 0;
  let roomFreshExact = 0;
  let roomFreshWorstDiff = 0;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const sup = supplyField(game, p);
    const cpuRoom = assessUrbanRoom(game, p, sup).roomTiles;
    const gpu = gpuRoom[p.smallID()] ?? 0;
    const diff = Math.abs(cpuRoom - gpu);
    roomPlayers += 1;
    if (cpuRoom === gpu) roomExact += 1;
    roomWorstDiff = Math.max(roomWorstDiff, diff);
    if (sup.lastCalcTick === game.ticks()) {
      roomFreshPlayers += 1;
      if (cpuRoom === gpu) roomFreshExact += 1;
      roomFreshWorstDiff = Math.max(roomFreshWorstDiff, diff);
    }
  }
  const gpuSupplyNow = new Uint32Array(await kernel.readBuffer("supplyDist"));
  const CITY = f.popPerDensity;
  const nbuf: number[] = [0, 0, 0, 0];
  let suitCompared = 0;
  let suitMaxAbsDiff = 0;
  let suitOver1e4 = 0;
  for (const p of game.players()) {
    if (!p.isAlive()) continue;
    const id = p.smallID();
    const supply = supplyField(game, p);
    for (const t of p.tiles()) {
      const tile = Number(t);
      if (inputs.owner[tile] !== id) continue;
      const cpuD = supply.dist.get(t);
      const gpuD = gpuSupplyNow[tile];
      const cpuDist = cpuD ?? 0xffffffff;
      if (cpuDist !== gpuD) continue; // staleness, already accounted for
      const k = gmap.neighbors4(t, nbuf as unknown as number[]);
      let sum = 0;
      for (let j = 0; j < k; j++) sum += p.density(nbuf[j]) / CITY;
      const localDensity = k > 0 ? sum / k : 0;
      const cpuVal = urbanSuitability(game, p, supply, t, localDensity);
      const diff = Math.abs(cpuVal - gpuSuit[tile]);
      suitCompared += 1;
      if (diff > suitMaxAbsDiff) suitMaxAbsDiff = diff;
      if (diff > 1e-4) suitOver1e4 += 1;
    }
  }
  const deltaRebuildMs = median(rebuildSamples);
  const deltaUploadMs = median(uploadSamples);
  const deltaFloodMs = median(floodSamples);

  return {
    ok: true,
    adapter: kernel.adapterInfo,
    deltaRebuildMs,
    deltaUploadMs,
    deltaFloodMs,
    cpuSupplyCycleMs,
    picksChecked,
    picksValid,
    drawTrials,
    drawMeanSuit,
    drawExpected,
    cellsCompared,
    cellsStaleSkipped,
    isoCells,
    isoExact,
    isoWorst,
    cellsExact,
    cellWorstProd,
    cellWorstCap,
    ripenCompared,
    ripenExact,
    ripenMaxDiff,
    ripenSamples,
    roomPlayers,
    roomExact,
    roomWorstDiff,
    roomFreshPlayers,
    roomFreshExact,
    roomFreshWorstDiff,
    roomReadbackMs,
    suitCompared,
    suitMaxAbsDiff,
    suitOver1e4,
    readbackMs,
    materialiseMs,
    mapEntries,
    deltaChangedTiles,
    deltaRuns,
    deltaElements,
    gpuMs,
    uploadMs,
    cpuMs,
    width,
    height,
    tick: game.ticks(),
    players: alive.length,
    supply,
    shed,
  };
}

export {};
