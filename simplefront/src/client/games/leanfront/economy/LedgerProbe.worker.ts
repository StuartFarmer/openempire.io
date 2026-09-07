/**
 * Does the GPU's district ledger agree with the CPU's?
 *
 * `district_yield` is the first CONSUMER whose output can be compared directly
 * rather than through a game hash: it produces a number per district, so the two
 * implementations can be diffed cell by cell instead of inferred from whether a
 * 4000-tick run drifted.
 *
 * THE REFERENCE IS DRIVEN FROM THE PLANES THE GPU ACTUALLY READ, not from the
 * live game. Four separate times in this port a stale or mismatched input was
 * misread as a shader bug — stale density, stale owner, pre-ripen maturity fed
 * to a post-ripen comparison, and `inputs.owner` against `uploader.ownerPlane`.
 * The last one matters here specifically: the pipeline runs `farm_ripen` BEFORE
 * `district_yield`, so the maturity the ledger sees is POST-advance, while the
 * live game's `farmMaturity` is whatever the CPU tick last wrote. Comparing
 * against the live game would diff the crop CA and the ledger at once and
 * attribute the result to the wrong one. Reading maturity back and computing the
 * reference from it isolates the ledger's own arithmetic, which is the thing
 * under test — `farm_ripen` is verified separately.
 *
 * Tolerance, not equality: the GPU evaluates the per-tile terms in f32 with
 * WGSL's 2.5 ULP slack on division, so exact agreement is not the contract any
 * more. What matters is that no district is materially wrong.
 */
import { assetUrl, type AssetManifest } from "../../../../core/AssetUrls";
import { climateSuitability } from "../../../../core/execution/utils/FarmGrowth";
import {
  foodShedPotential,
  isFallow,
  peekFoodShed,
} from "../../../../core/execution/utils/FoodShed";
import { supplyField } from "../../../../core/execution/utils/SupplyField";
import { tenureCurve } from "../../../../core/execution/utils/TileTenure";
import { urbanSuitability } from "../../../../core/execution/utils/UrbanGrowth";
import { FetchGameMapLoader } from "../../../../core/game/FetchGameMapLoader";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  LandUse,
  UnitType,
  type Game,
  type Player,
} from "../../../../core/game/Game";
import { createGameRunner } from "../../../../core/GameRunner";
import { PseudoRandom } from "../../../../core/PseudoRandom";
import type { GameStartInfo } from "../../../../core/Schemas";
import { compileFieldSystem } from "../../../webgpu/FieldDynamics";
import { FieldKernel } from "../../../webgpu/FieldKernel";
import {
  CUTOFF_RADII,
  economyFields,
  REGION_SLOTS,
  REGION_WORDS,
} from "./fields/system";
import {
  formatSeamDiff,
  mergeSeamDiffs,
  seamDiff,
  type SeamDiffResult,
} from "./SeamDiff";
import { EconomyFieldUploader } from "./upload";

const ctx = self as unknown as Worker;
const UNREACHED = 0xffffffff;

export interface LedgerProbeIn {
  mapType: GameMapType;
  bots: number;
  ticks: number;
  cdnBase: string;
  assetManifest: AssetManifest;
  seed: string;
}

export interface LedgerProbeOut {
  ok: boolean;
  error?: string;
  adapter?: string;
  tick?: number;
  districts?: number;
  /** Districts whose totals differ by more than one milliunit. */
  prodOff?: number;
  capOff?: number;
  worstProd?: number;
  worstCap?: number;
  /** Relative worst error, which is what "materially wrong" means. */
  worstProdRel?: number;
  worstCapRel?: number;
  totalProdCpu?: number;
  totalProdGpu?: number;
  /** The patch phase's credit-stream and acreage reductions. */
  driveOff?: number;
  acreOff?: number;
  worstDrive?: number;
  /** Sanity: how much crop there actually is. A comparison over an empty set
   *  passes trivially, so a probe has to say how much it compared. */
  maturityNonZero?: number;
  maturityMax?: number;
  /** The same two over the CPU's OWN map, before the dispatch — the input, so
   *  a vacuous comparison can be told apart from an empty board. */
  cpuMaturityMax?: number;
  cpuAtClaim?: number;
  acreTotalCpu?: number;
  /** The labour ledger's acreage (committedStaffing), per district. */
  acresOff?: number;
  acresTotalCpu?: number;
  acresTotalGpu?: number;
  /** Farm tenure aging: how many nuclei the CPU says should age, and how many
   *  tiles anywhere on the map disagree with the CPU's expectation. */
  tenureAgedCpu?: number;
  tenureAgedGpu?: number;
  tenureOff?: number;
  /** PRNG parity: draws compared, and the worst absolute difference between
   *  the GPU's stream and `PseudoRandom`'s. */
  randCompared?: number;
  randWorst?: number;
  randOverUlp?: number;
  /** The city draw's weight plane against the CPU's `suit` map. */
  cityCpu?: number;
  cityGpu?: number;
  cityMissing?: number;
  cityExtra?: number;
  cityWorstRel?: number;
  cityExtraSamples?: string[];
  /** Extras split by CAUSE: the GPU floods supply fresh every dispatch while
   *  the CPU's field is refreshed on a cadence, so a tile the GPU reaches and
   *  the CPU has not re-reached yet is a staleness artefact, not a predicate
   *  disagreement. Only `cityExtraReal` is a defect. */
  cityExtraStale?: number;
  cityExtraReal?: number;
  /** Tiles whose weight differs materially, and a sample of them. A single
   *  worst case says nothing about whether the pass is wrong or one tile sits
   *  on a shed tie-break. */
  cityValueOff?: number;
  cityValueSamples?: string[];
  /** The placement DRAWS, which were inert before the reset passes existed:
   *  how many districts and players the races actually named a winner for. */
  patchWinners?: number;
  pickWinners?: number;
  /** Patch APPLICATION: districts the GPU placed a plot for, and how its
   *  per-district credit ledger compares with the CPU's own rule. */
  patchPlaced?: number;
  creditOff?: number;
  creditWorst?: number;
  /** REPEATED dispatches: the only way to reach the patch cost (credit starts
   *  at zero, the cost is 50,000 and the drive caps at 3,000 per tick), and the
   *  only way to catch an accumulator that never gets reset. */
  loopDispatches?: number;
  loopPlaced?: number;
  loopProdFirst?: number;
  loopProdLast?: number;
  loopCreditMax?: number;
  /** Districts that CLEAR the labour gate, and that have a frontier tile to
   *  place on. Without these, "0 plots placed" cannot be told apart from a
   *  broken write. */
  gatePass?: number;
  gateHaveTile?: number;
  gateWorstShortfall?: number;
  residentsOff?: number;
  residentsCpuTotal?: number;
  residentsGpuTotal?: number;
  reasonHistogram?: number[];
  /** Placements whose plot did NOT land at the claim threshold in the maturity
   *  plane — i.e. the write went somewhere nothing reads. */
  loopWriteMissed?: number;
  /** Dispatch cost, which is the whole point of the port. `full` runs every
   *  pass; `consumers` skips the two floods and the potential field they feed. */
  msFull?: number;
  msConsumers?: number;
  msCadenced?: number;
  msUpload?: number;
  uploadBreakdown?: string;
  /** Task 2.3 — does the GPU's `farmTick` land where the CPU's does? The GPU
   *  advances the board one tick from the uploaded state, so the comparison is
   *  against the CPU ticked one step further, not against the state that was
   *  uploaded. */
  driftCompared?: number;
  driftExact?: number;
  driftWithin1?: number;
  driftMax?: number;
  driftPlacementOnly?: number;
  driftOwnerChanged?: number;
  driftSamples?: string[];
  /** What a PLANE readback costs, against the per-district readback the design
   *  assumed. The question is whether "never read a field back" is a rule or a
   *  budget. */
  msReadShedPlanes?: number;
  msReadDistrictSlots?: number;
  msPartitionByOwner?: number;
  shedTilesCovered?: number;
  /** A/B on the late-game board: the sim's own tick cost with the district
   *  ledger computed on the CPU, and with it served from the GPU (dispatch,
   *  readback and all). This is the number the port exists to move. */
  abTicks?: number;
  msTickCpu?: number;
  msTickGpu?: number;
  msTickGpuSim?: number;
  abFallbacks?: number;
  abServed?: number;
  /** HEALTH (task 0.1). A tick that gets faster while the board dies is a
   *  FAILURE, and twice now it has looked like a success — 17 ms with the
   *  districts collapsed from ~576 to ~121, and a 3% figure that was noise.
   *  So every timing carries a count of the entities the work is done over.
   *
   *  The arms INTERLEAVE on one board, so a collapse caused by either arm drags
   *  both: the assertion is therefore about the trend across the whole A/B, not
   *  a difference between the arms. Per-arm means are reported anyway, because
   *  an arm that serves far fewer districts than the other is doing less work
   *  and its timing is not comparable. */
  healthDistrictsBefore?: number;
  healthDistrictsAfter?: number;
  healthPlayersBefore?: number;
  healthPlayersAfter?: number;
  healthFarmsBefore?: number;
  healthFarmsAfter?: number;
  /** Mean districts the economy ran over per tick, per arm. */
  healthCpuArmDistricts?: number;
  healthGpuArmDistricts?: number;
  /** False when any of the three fell by more than `healthTolerance` across the
   *  A/B, or when the two arms ran over materially different district counts.
   *  The driver exits non-zero on it. */
  healthOk?: boolean;
  healthTolerance?: number;
  healthNotes?: string[];
  /** The shed PROVIDER's output against the CPU's own recompute — the check
   *  that should have existed before it was wired in. */
  shedPlayers?: number;
  shedCpuTiles?: number;
  shedGpuTiles?: number;
  shedOnlyCpu?: number;
  shedOnlyGpu?: number;
  shedCellDiff?: number;
  shedSamples?: string[];
  /** The same comparison through the reusable seam diff (task 0.3), which
   *  carries the size so a vacuous pass is visible on sight. */
  shedSeamLine?: string;
  shedSeamOk?: boolean;
  /** The DERIVATION, recomputed both ways from the same board: what the shed
   *  builds on top of the flood. If the flood agrees and this does not, the
   *  flood is carrying something the seam does not hand over. */
  derivCpuTilled?: number;
  derivGpuTilled?: number;
  derivCpuRanked?: number;
  derivGpuRanked?: number;
  derivCpuPeople?: number;
  derivGpuPeople?: number;
  derivCpuRegions?: number;
  derivGpuRegions?: number;
  /** COVERAGE SHAPE (task 1.2): can a maturity histogram reproduce the CPU's
   *  `(maturity DESC, tileRef ASC)` selection, or do ties decide the cut-off? */
  covDistricts?: number;
  covCutInTie?: number;
  covWorstTieAtCut?: number;
  covMaxTieAny?: number;
  covDistinctTotal?: number;
  covTilesTotal?: number;
  /** OCCUPANCY PRECISION (task 1.3): would an f32 occupancy change any
   *  district's labour pool? Simulated on the CPU before any shader exists. */
  /** THE DERIVATION SEAM (tasks 1.3/1.5): the four new passes against
   *  `FoodShed.recompute`, through the reusable diff. */
  derivPeopleLine?: string;
  derivClaimsLine?: string;
  derivIsoClaimsLine?: string;
  derivRankedLine?: string;
  derivTilledLine?: string;
  derivIsoRankedLine?: string;
  derivIsoTilledLine?: string;
  /** Tiles whose district is under-staffed but not empty — the branch where the
   *  maturity ranking actually selects, and the host must decide. Measured at
   *  zero on both boards; reported so it can never be zero by assumption. */
  coverEscalated?: number;
  derivRegionsLine?: string;
  derivIsoRegionsLine?: string;
  /** Districts beyond the adjacency matrix's cap — reported rather than
   *  silent, because the headroom there is 1.66x and not MAX_CELLS' 26x. */
  regionSaturated?: number;
  derivLaborLine?: string;
  derivSeamOk?: boolean;
  occPlayers?: number;
  occExactlyOne?: number;
  occDistricts?: number;
  occDistrictsOff?: number;
  occWorstDiff?: number;
  occTilesOff?: number;
  occTilesTotal?: number;
  covWithCut?: number;
  covFullyStaffed?: number;
  covNoSlots?: number;
  covFallowAtCut?: number;
}

ctx.onmessage = async (e: MessageEvent<LedgerProbeIn>) => {
  try {
    ctx.postMessage(await run(e.data));
  } catch (err) {
    ctx.postMessage({ ok: false, error: (err as Error).message });
  }
};

async function run(msg: LedgerProbeIn): Promise<LedgerProbeOut> {
  globalThis.__ASSET_MANIFEST__ = msg.assetManifest;
  globalThis.__CDN_BASE__ = msg.cdnBase;

  const loader = new FetchGameMapLoader((p) => assetUrl(`maps/${p}`));
  const gameStart: GameStartInfo = {
    gameID: msg.seed,
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
  const gr = await createGameRunner(gameStart, undefined, loader, () => {});
  const game: Game = gr.game;
  const { SpawnTimerExecution } =
    await import("../../../../core/execution/SpawnTimerExecution");
  game.addExecution(new SpawnTimerExecution());
  let turn = 0;
  const tick = (): void => {
    gr.addTurn({ turnNumber: turn++, intents: [] });
    gr.executeNextTick();
  };
  while (game.inSpawnPhase()) tick();
  for (let i = 0; i < msg.ticks; i++) tick();

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
  kernel.resize(game.width(), game.height());
  const adapter = kernel.adapterInfo;

  // Static map planes the passes read.
  const n = game.width() * game.height();
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

  const uploader = new EconomyFieldUploader(n);
  const alive = game.players().filter((p: Player) => p.isAlive());
  // TWO refreshes before the one dispatch, and the second is not optional.
  //
  // The uploader's mirrors start empty, so the FIRST refresh sees every owned
  // tile as an ownership delta and raises FLAG_OWNER_CHANGED across the whole
  // board. `farm_ripen` reads that flag as CONQUEST and destroys the previous
  // owner's crop — so a single-refresh probe dispatches against a map whose
  // maturity has just been wiped to the field-zone seed. Measured on verdantia
  // at tick 1002: the CPU's own maturity peaks at 788 milli with 1,016 tiles
  // at or above the claim threshold, while the plane the passes read peaked at
  // 62 with NONE at claim — every field tile reset to 50 and advanced one step.
  //
  // Every comparison here derives its reference from the planes the GPU read,
  // so it still agreed exactly — on a board no game ever occupies. A second
  // refresh clears the flags (owner is now unchanged) and re-sends the CPU's
  // real maturity, which is the state the passes have to be right about.
  uploader.refresh(game, alive, kernel);
  uploader.refresh(game, alive, kernel);
  const frame = kernel.beginFrame();
  compiled.runDerive(frame);
  await frame.finish();

  const driveGpu = new Int32Array(await kernel.readBuffer("driveAccum"));
  const acreGpu = new Int32Array(await kernel.readBuffer("acreAccum"));
  const acresGpu = new Int32Array(await kernel.readBuffer("acresAccum"));
  const tenureGpu = new Float32Array(await kernel.readBuffer("tenure"));
  const prodGpu = new Int32Array(await kernel.readBuffer("prodAccum"));
  const capGpu = new Int32Array(await kernel.readBuffer("capAccum"));
  // THE PLANES THE GPU READ — see the header.
  const maturity = new Float32Array(await kernel.readBuffer("maturity"));
  const shedCell = new Uint32Array(await kernel.readBuffer("shedCell"));
  const cells = uploader.cellTiles;
  const slotOf = new Map<number, number>();
  cells.forEach((t, slot) => slotOf.set(t, slot));

  // CPU reference over the same inputs.
  const prodCpu = new Int32Array(cells.length);
  const capCpu = new Int32Array(cells.length);
  const owner = uploader.ownerPlane;
  for (const p of alive) {
    const shed = peekFoodShed(p);
    if (shed === null) continue;
    const id = p.smallID();
    for (const tr of shed.tilled) {
      const t = Number(tr);
      if (owner[t] !== id) continue;
      const cell = shedCell[t];
      if (cell === UNREACHED) continue;
      const slot = slotOf.get(cell);
      if (slot === undefined) continue;
      capCpu[slot] += Math.round(
        f.fieldTileStorageMilli * tenureCurve(game, game.tileTenure(t)),
      );
      const m = maturity[t] / 1000;
      if (m <= 0) continue;
      const soilN = crop[t] / 255; // FAO fertility ceiling
      prodCpu[slot] += Math.round(m * soilN * f.fieldTileYieldMilli);
    }
  }

  // The patch phase's two reductions, same method: reference from the planes
  // the GPU read. `fieldTilesByCell` on the CPU is {has a maturity entry,
  // undamaged, field, not fallow}; its `tilled || !ranked` filter is exactly
  // "not fallow" again, so one predicate covers both.
  const driveCpu = new Int32Array(cells.length);
  const acreCpu = new Int32Array(cells.length);
  const claim = f.fieldClaimMilli;
  for (const p of alive) {
    const shed = peekFoodShed(p);
    if (shed === null) continue;
    const id = p.smallID();
    for (let t = 0; t < maturity.length; t++) {
      if (owner[t] !== id) continue;
      const m = maturity[t];
      if (m <= 0) continue;
      if (game.tileDamage(t) > 0) continue;
      if (isFallow(shed, t)) continue;
      const isField = m >= claim || p.landUse(t) === LandUse.Field;
      if (!isField) continue;
      const cell = shedCell[t] === UNREACHED ? t : shedCell[t];
      const slot = slotOf.get(cell);
      if (slot === undefined) continue;
      driveCpu[slot] += Math.round(m);
      acreCpu[slot] += 1;
    }
  }
  let driveOff = 0;
  let acreOff = 0;
  let worstDrive = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    const dd = Math.abs(driveCpu[s2] - driveGpu[s2]);
    if (dd > 1) driveOff += 1;
    if (dd > worstDrive) worstDrive = dd;
    if (acreCpu[s2] !== acreGpu[s2]) acreOff += 1;
  }

  // The LABOUR ledger's acreage — a different predicate over the same plane
  // (claimed maturity alone; damage and staffing are irrelevant to how many
  // hands an acre needs), so it gets its own reference rather than reusing the
  // credit stream's.
  let cpuMaturityMax = 0;
  let cpuAtClaim = 0;
  for (const p of alive) {
    for (const [, m] of p.farmMaturityEntries()) {
      if (m > cpuMaturityMax) cpuMaturityMax = m;
      if (m >= claim) cpuAtClaim += 1;
    }
  }
  let maturityNonZero = 0;
  let maturityMax = 0;
  let acreTotalCpu = 0;
  for (let s2 = 0; s2 < cells.length; s2++) acreTotalCpu += acreCpu[s2];
  const acresCpu = new Int32Array(cells.length);
  for (let t = 0; t < maturity.length; t++) {
    if (maturity[t] > 0) {
      maturityNonZero += 1;
      if (maturity[t] > maturityMax) maturityMax = maturity[t];
    }
    if (owner[t] === 0) continue;
    if (maturity[t] < claim) continue;
    const cell = shedCell[t] === UNREACHED ? t : shedCell[t];
    const slot = slotOf.get(cell);
    if (slot === undefined) continue;
    acresCpu[slot] += 1;
  }
  let acresOff = 0;
  let acresTotalCpu = 0;
  let acresTotalGpu = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    acresTotalCpu += acresCpu[s2];
    acresTotalGpu += acresGpu[s2];
    if (acresCpu[s2] !== acresGpu[s2]) acresOff += 1;
  }

  // FARM TENURE. The reference is the whole plane: every tile keeps the tenure
  // the uploader sent, except a settled, undamaged nucleus, which gains one
  // tick. Comparing the whole plane rather than just the nuclei is what catches
  // a pass that ages something it should not have touched.
  const tenureBefore = new Float32Array(maturity.length);
  for (const [tr, milli] of game.tileTenureEntries()) {
    tenureBefore[Number(tr)] = milli;
  }
  const tenureExpected = tenureBefore.slice();
  let tenureAgedCpu = 0;
  for (const p of alive) {
    const id = p.smallID();
    for (const farm of p.units(UnitType.Farmland)) {
      if (farm.isUnderConstruction()) continue;
      const t = Number(farm.tile());
      // The uploader flags a nucleus only on ground its owner still holds, so
      // the reference has to agree about that or it would diff the FLAG, not
      // the pass.
      if (map.ownerID(t) !== id) continue;
      if (game.tileDamage(t) > 0) continue;
      const m = maturity[t]; // the plane the pass read: post-ripen
      if (m <= 0) continue;
      const suitMilli = Math.round(climateSuitability(game, t) * 1000);
      if (suitMilli <= 0 || m < suitMilli) continue;
      tenureExpected[t] += 1000;
      tenureAgedCpu += 1;
    }
  }
  let tenureOff = 0;
  let tenureAgedGpu = 0;
  for (let t = 0; t < tenureGpu.length; t++) {
    if (tenureGpu[t] !== tenureExpected[t]) tenureOff += 1;
    if (tenureGpu[t] !== tenureBefore[t]) tenureAgedGpu += 1;
  }

  // PRNG PARITY. Everything the draws do rests on this, so it is checked on
  // its own: verifying it through a placement would conflate a generator bug
  // with a frontier bug, which is precisely the conflation that made the ledger
  // cutover look like an architecture problem when it was an ordering one.
  const randGpu = new Float32Array(await kernel.readBuffer("randOut"));
  const seeds = uploader.playerSeeds;
  const RAND_SEEDS = 64;
  const RAND_DRAWS = 8;
  let randCompared = 0;
  let randWorst = 0;
  let randOverUlp = 0;
  for (let s = 0; s < RAND_SEEDS; s++) {
    const rng = new PseudoRandom(seeds[s]);
    for (let k = 0; k < RAND_DRAWS; k++) {
      const cpu = rng.next();
      const gpu = randGpu[s * RAND_DRAWS + k];
      randCompared += 1;
      const d = Math.abs(cpu - gpu);
      if (d > randWorst) randWorst = d;
      // One f32 ulp at 1.0. Anything inside this is the f64/f32 division and
      // nothing else; anything outside it is a transcription error.
      if (d > 1.2e-7) randOverUlp += 1;
    }
  }

  // THE CITY DRAW'S WEIGHT, against the CPU's own `suit` map.
  //
  // This is the pool the draw samples from, so getting it right is prior to
  // getting the draw right — and it is where `urban_pick` was wrong all along:
  // it weighted by the ungated `suitability`, which is the base term, not the
  // shed-gated product the CPU actually uses.
  //
  // Rebuilt here by calling the real thing (`urbanSuitability`,
  // `foodShedPotential`) rather than by transcribing it a second time, so the
  // reference cannot drift from the implementation it is checking.
  const cityGpuPlane = new Float32Array(await kernel.readBuffer("cityWeight"));
  let cityCpu = 0;
  let cityGpu = 0;
  let cityMissing = 0;
  let cityExtra = 0;
  let cityWorstRel = 0;
  const cityEligible = new Set<number>();
  let cityValueOff = 0;
  const cityValueSamples: string[] = [];
  for (let t = 0; t < cityGpuPlane.length; t++) {
    if (cityGpuPlane[t] > 0) cityGpu += 1;
  }
  for (const p of alive) {
    const shed = peekFoodShed(p);
    if (shed === null) continue;
    const supply = supplyField(game, p);
    const smallID = p.smallID();
    const CITY = f.popPerDensity;
    const nbuf: number[] = [0, 0, 0, 0];
    for (const [tile] of supply.dist) {
      const t = Number(tile);
      if (map.ownerID(t) !== smallID) continue;
      if (!map.isLand(t) || map.isImpassable(t)) continue;
      if (p.density(t) >= CITY) continue;
      // `isFieldTile` reads the player's LIVE maturity map, which is one ripen
      // step behind the plane the pass read — the pipeline advances the crop CA
      // before this pass, exactly as `farmTick` runs before `addCityTiles`
      // inside the CPU's own tick. Testing the claim threshold against the live
      // map would diff the crop CA here and blame the weight.
      const isField =
        p.landUse(t) === LandUse.Field ||
        maturity[t] >= claim ||
        (game.plotAt(t)?.type() === UnitType.Farmland &&
          game.plotAt(t)?.owner() === p);
      if (isField) continue;
      if (game.tileDamage(t) > 0) continue;
      const k = map.neighbors4(t, nbuf);
      let sum = 0;
      for (let j = 0; j < k; j++) sum += p.density(nbuf[j]) / CITY;
      const local = k > 0 ? sum / k : 0;
      const base = urbanSuitability(game, p, supply, t, local);
      if (base <= 0) continue;
      const gate = Math.min(1, f.wFoodShed * foodShedPotential(game, shed, t));
      const sp = base * gate;
      if (sp <= 0) continue;
      cityCpu += 1;
      const g = cityGpuPlane[t];
      if (g <= 0) {
        cityMissing += 1;
        continue;
      }
      cityEligible.add(t);
      const rel = Math.abs(g - sp) / sp;
      cityWorstRel = Math.max(cityWorstRel, rel);
      if (rel > 1e-3) {
        cityValueOff += 1;
        if (cityValueSamples.length < 6) {
          const cellGpu = shedCell[t];
          const cellCpu = shed.hasCell(t) ? shed.cellAt(t) : -1;
          cityValueSamples.push(
            `t=${t} cpu=${sp.toFixed(6)} gpu=${g.toFixed(6)} rel=${(rel * 100).toFixed(2)}% ` +
              `cellCpu=${cellCpu} cellGpu=${cellGpu === UNREACHED ? -1 : cellGpu} ` +
              `sameCell=${cellCpu === cellGpu}`,
          );
        }
      }
    }
  }
  const cityExtraSamples: string[] = [];
  let cityExtraStale = 0;
  let cityExtraReal = 0;
  for (let t = 0; t < cityGpuPlane.length; t++) {
    if (cityGpuPlane[t] <= 0 || cityEligible.has(t)) continue;
    cityExtra += 1;
    {
      const o = owner[t];
      const p = alive.find((q: Player) => q.smallID() === o);
      if (p === undefined || !supplyField(game, p).dist.has(t)) {
        cityExtraStale += 1;
      } else {
        cityExtraReal += 1;
      }
    }
    if (cityExtraSamples.length < 8) {
      const o = owner[t];
      const p = alive.find((q: Player) => q.smallID() === o);
      cityExtraSamples.push(
        `t=${t} owner=${o} dens=${p?.density(t) ?? -1} dmg=${game.tileDamage(t)} ` +
          `land=${p?.landUse(t) ?? "-"} matGpu=${maturity[t]} matCpu=${p?.farmMaturity(t) ?? -1} ` +
          `plot=${game.plotAt(t)?.type() ?? "-"} built=${game.plotAt(t)?.isUnderConstruction() ?? "-"} ` +
          `inSupply=${p !== undefined && supplyField(game, p).dist.has(t)}`,
      );
    }
  }

  // THE DRAWS. Before `reset_cells`/`reset_players` existed these accumulators
  // started at zero, so `atomicMin` never moved and neither race ever named a
  // winner — a bug no single-dispatch value comparison could see, because the
  // values it produced were never read by anything.
  const patchTileGpu = new Uint32Array(await kernel.readBuffer("patchTile"));
  const pickTileGpu = new Uint32Array(await kernel.readBuffer("pickTile"));
  let patchWinners = 0;
  let pickWinners = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    if (patchTileGpu[s2] !== UNREACHED) patchWinners += 1;
  }
  for (let s2 = 0; s2 < 256; s2++) {
    if (pickTileGpu[s2] !== UNREACHED) pickWinners += 1;
  }

  // PATCH APPLICATION. The CPU's rule, re-evaluated per district against the
  // same reductions the GPU used, so this isolates the gate and the write from
  // the two sums that feed them (already exact, 1.6).
  const creditGpu = new Int32Array(await kernel.readBuffer("slotCredit"));
  const residents = uploader.slotResidentsArray;
  let patchPlaced = 0;
  let creditOff = 0;
  let creditWorst = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    const drive = Math.min(f.fieldPatchDriveCapMilli, driveGpu[s2]);
    let expect = 0; // credit starts at 0 on the first dispatch
    if (drive > 0) {
      const credit = drive;
      if (credit < f.fieldPatchCostMilli) {
        expect = credit;
      } else if (residents[s2] < (acreGpu[s2] + 1) * f.farmersPerFieldTile) {
        expect = f.fieldPatchCostMilli;
      } else if (patchTileGpu[s2] === UNREACHED) {
        expect = f.fieldPatchCostMilli;
      } else {
        expect = credit - f.fieldPatchCostMilli;
        patchPlaced += 1;
      }
    }
    const d = Math.abs(expect - creditGpu[s2]);
    if (d > 0) creditOff += 1;
    if (d > creditWorst) creditWorst = d;
  }

  let prodOff = 0;
  let capOff = 0;
  let worstProd = 0;
  let worstCap = 0;
  let worstProdRel = 0;
  let worstCapRel = 0;
  let totalProdCpu = 0;
  let totalProdGpu = 0;
  for (let s = 0; s < cells.length; s++) {
    totalProdCpu += prodCpu[s];
    totalProdGpu += prodGpu[s];
    const dp = Math.abs(prodCpu[s] - prodGpu[s]);
    const dc = Math.abs(capCpu[s] - capGpu[s]);
    if (dp > 1) prodOff += 1;
    if (dc > 1) capOff += 1;
    if (dp > worstProd) worstProd = dp;
    if (dc > worstCap) worstCap = dc;
    if (prodCpu[s] > 0) {
      worstProdRel = Math.max(worstProdRel, dp / prodCpu[s]);
    }
    if (capCpu[s] > 0) worstCapRel = Math.max(worstCapRel, dc / capCpu[s]);
  }

  // REPEATED DISPATCHES. Two things only this can show:
  //
  //   1. Patch PLACEMENT. A district banks at most `fieldPatchDriveCapMilli`
  //      (3,000) per dispatch against a cost of 50,000, so a single-dispatch
  //      probe can never reach the branch that actually writes a plot.
  //   2. That the reset passes work. Every reduction is an atomicAdd target; if
  //      it were not cleared, the production total would climb by roughly its
  //      own value every dispatch. Comparing the first against the last is the
  //      check — and it is one no single dispatch could ever make.
  //
  // The sim is NOT ticked in between, so this is not a game; it is the same
  // board dispatched repeatedly, which is exactly what isolates the ledger.
  const LOOP = 24;
  let loopPlaced = 0;
  let loopProdFirst = 0;
  let loopProdLast = 0;
  let loopCreditMax = 0;
  const reasonHistogram = [0, 0, 0, 0, 0, 0];
  let loopWriteMissed = 0;
  for (let iter = 0; iter < LOOP; iter++) {
    uploader.refresh(game, alive, kernel);
    const lf = kernel.beginFrame();
    compiled.runDerive(lf);
    await lf.finish();
    const credit = new Int32Array(await kernel.readBuffer("slotCredit"));
    const reason = new Uint32Array(await kernel.readBuffer("patchReason"));
    for (let s2 = 0; s2 < cells.length; s2++) {
      reasonHistogram[reason[s2]] = (reasonHistogram[reason[s2]] ?? 0) + 1;
    }
    const prod = new Int32Array(await kernel.readBuffer("prodAccum"));
    const mat = new Float32Array(await kernel.readBuffer("maturity"));
    let total = 0;
    for (let s2 = 0; s2 < cells.length; s2++) {
      total += prod[s2];
      if (credit[s2] > loopCreditMax) loopCreditMax = credit[s2];
    }
    if (iter === 0) loopProdFirst = total;
    loopProdLast = total;
    // A placement is the shader saying so. An earlier version of this counted
    // districts whose credit fell below the cost, which is wrong in the common
    // case: a district places when `credit + drive` clears the cost, so its
    // PREVIOUS credit is usually still under it and the transition never shows.
    const tiles = new Uint32Array(await kernel.readBuffer("patchTile"));
    for (let s2 = 0; s2 < cells.length; s2++) {
      if (reason[s2] !== 5) continue;
      loopPlaced += 1;
      // And the write itself: the plot must be sitting at the claim threshold
      // in the maturity plane the rest of the dispatch reads. This is also what
      // proves `maturity.read!` binds the CURRENT ping-pong facet rather than
      // the stale one — a wrong facet would place into a buffer nothing reads.
      if (Math.round(mat[tiles[s2]]) !== Math.round(f.fieldClaimMilli)) {
        loopWriteMissed += 1;
      }
    }
    uploader.absorbCredit(credit);
  }

  // Did the per-district inputs actually reach the shader? A gate that fails
  // for every district looks identical to a gate that never received its
  // numbers, and only reading them back tells the two apart.
  const residentsGpu = new Int32Array(await kernel.readBuffer("slotResidents"));
  let residentsOff = 0;
  let residentsCpuTotal = 0;
  let residentsGpuTotal = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    residentsCpuTotal += uploader.slotResidentsArray[s2];
    residentsGpuTotal += residentsGpu[s2];
    if (uploader.slotResidentsArray[s2] !== residentsGpu[s2]) residentsOff += 1;
  }

  // Is "0 placed" the RULE or a broken write? The labour gate is the only other
  // thing that can stop a district at full credit, so count how many clear it.
  let gatePass = 0;
  let gateHaveTile = 0;
  let gateWorstShortfall = 0;
  for (let s2 = 0; s2 < cells.length; s2++) {
    const need = (acreGpu[s2] + 1) * f.farmersPerFieldTile;
    if (residents[s2] >= need) {
      gatePass += 1;
      if (patchTileGpu[s2] !== UNREACHED) gateHaveTile += 1;
    } else {
      const short = need - residents[s2];
      if (short > gateWorstShortfall) gateWorstShortfall = short;
    }
  }

  // COST. The port exists for this number, so it is measured on the same
  // late-game board every correctness check just ran against, rather than on a
  // synthetic one.
  const timeDispatch = async (tier?: string): Promise<number> => {
    const t0 = performance.now();
    const fr = kernel.beginFrame();
    compiled.runDerive(fr, tier);
    await fr.finish();
    return performance.now() - t0;
  };
  const median = (xs: number[]): number => {
    const v = xs.slice().sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  for (let i = 0; i < 3; i++) await timeDispatch(); // warm the pipelines
  const fullMs: number[] = [];
  const consMs: number[] = [];
  for (let i = 0; i < 15; i++) fullMs.push(await timeDispatch());
  for (let i = 0; i < 15; i++) consMs.push(await timeDispatch("consumers"));
  const msFull = median(fullMs);
  const msConsumers = median(consMs);
  // What a 10-tick flood cadence would average out to.
  const msCadenced = (msFull + 9 * msConsumers) / 10;
  const upMs: number[] = [];
  let uploadBreakdown = "";
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const r = uploader.refresh(game, alive, kernel);
    upMs.push(performance.now() - t0);
    uploadBreakdown =
      `owner ${r.msOwner.toFixed(1)} | clear ${r.msClear.toFixed(1)} | ` +
      `players ${r.msPlayers.toFixed(1)} | game-wide ${r.msGameWide.toFixed(1)} | ` +
      `slots+seeds ${r.msSlots.toFixed(1)} | gpu write ${r.uploadMs.toFixed(1)}`;
  }
  const msUpload = median(upMs);

  // WHAT A PLANE READBACK COSTS. The design forbids it on the strength of the
  // Level A measurement (18.7 ms/tick of round trip), but that was planes in
  // BOTH directions on an older pipeline. The shed seam wants two planes out,
  // once per tick, serving every player — so it deserves its own number rather
  // than an inherited one.
  const timeRead = async (names: string[]): Promise<number> => {
    const t0 = performance.now();
    for (const nm of names) await kernel.readBuffer(nm);
    return performance.now() - t0;
  };
  await timeRead(["shedDist"]); // warm the staging path
  const planeRuns: number[] = [];
  for (let i = 0; i < 7; i++) {
    planeRuns.push(await timeRead(["shedDist", "shedCell"]));
  }
  const msReadShedPlanes = median(planeRuns);
  const slotRuns: number[] = [];
  for (let i = 0; i < 7; i++) {
    slotRuns.push(await timeRead(["prodAccum", "capAccum", "slotCredit"]));
  }
  const msReadDistrictSlots = median(slotRuns);

  // And the work that a plane readback IMPLIES: the seam is per-player, but the
  // planes are merged across players, so somebody has to partition them. That
  // is an O(grid) scan per tick however cheap the copy was.
  const partRuns: number[] = [];
  let shedTilesCovered = 0;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const counts = new Int32Array(256);
    let covered = 0;
    for (let t = 0; t < shedCell.length; t++) {
      if (shedCell[t] === UNREACHED) continue;
      counts[owner[t]] += 1;
      covered += 1;
    }
    shedTilesCovered = covered;
    partRuns.push(performance.now() - t0);
  }
  const msPartitionByOwner = median(partRuns);

  // TASK 2.3 — MATURITY DRIFT. The GPU ran `farmTick` on the state at tick N,
  // so the thing to compare it against is the CPU at tick N+1, not the CPU at
  // N. Tick once more and diff the crop CA tile for tile.
  //
  // Two offsets are inherent to the MIRRORED arrangement and are counted
  // separately rather than smuggled into the tolerance:
  //   - conquest. The GPU applies ownership changes from the upload diff, which
  //     describes tick N-1 -> N; the CPU applies the ones that happen during
  //     N -> N+1. A tile that changes hands in that window is one tick out of
  //     step by construction.
  //   - placement. The CPU's patch credits accumulated over the whole game; the
  //     uploader's mirror started empty this session, so the two ledgers are not
  //     at the same point and place plots on different ticks. Under D9 that is
  //     a different sample of the same law, not an error.
  // Both disappear at the cutover, when there is one copy of the state.
  const ownerBefore = uploader.ownerPlane.slice();
  tick();
  let driftCompared = 0;
  let driftExact = 0;
  let driftWithin1 = 0;
  let driftMax = 0;
  let driftPlacementOnly = 0;
  let driftOwnerChanged = 0;
  const driftSamples: string[] = [];
  const cpuNext = new Float32Array(maturity.length);
  for (const p of alive) {
    if (!p.isAlive()) continue;
    for (const [tr, m] of p.farmMaturityEntries()) cpuNext[Number(tr)] = m;
  }
  for (let t = 0; t < maturity.length; t++) {
    const g = maturity[t];
    const c = cpuNext[t];
    if (g === 0 && c === 0) continue;
    if (ownerBefore[t] !== map.ownerID(t)) {
      driftOwnerChanged += 1;
      continue;
    }
    // A plot appearing on exactly one side is the credit-ledger offset.
    if ((g === 0) !== (c === 0)) {
      driftPlacementOnly += 1;
      continue;
    }
    driftCompared += 1;
    const d = Math.abs(g - c);
    if (d === 0) driftExact += 1;
    if (d <= 1) driftWithin1 += 1;
    if (d > driftMax) {
      driftMax = d;
      if (driftSamples.length < 5) {
        driftSamples.push(`t=${t} gpu=${g} cpu=${c} d=${d.toFixed(2)}`);
      }
    }
  }

  // THE SHED PROVIDER'S OUTPUT, against the CPU's own shed. Task 1.2 verified
  // the raw FLOOD (100% cell agreement); this verifies what the provider
  // actually serves after compaction, readback and scatter — which is a
  // different artefact, and wiring it in without checking collapsed the game.
  // Expressed through `seamDiff` (task 0.3) rather than by hand, because this
  // was the ONE seam that had an output diff and every seam after it needs the
  // same one. Keys are tiles, values are the cell each tile is assigned to.
  const shedGpuTiles0 = new Set<number>();
  let shedPlayers = 0;
  let shedDiff: SeamDiffResult;
  {
    const shedCounts = new Uint32Array(await kernel.readBuffer("shedCount"));
    const nShed = Math.min(shedCounts[0], 2097152);
    const gTile = new Uint32Array(
      await kernel.readBuffer("shedTileList", nShed),
    );
    const gCell = new Uint32Array(
      await kernel.readBuffer("shedCellList", nShed),
    );
    const byOwner = new Map<number, Map<number, number>>();
    for (let i = 0; i < nShed; i++) {
      const t = gTile[i];
      const o = owner[t];
      let m = byOwner.get(o);
      if (m === undefined) {
        m = new Map();
        byOwner.set(o, m);
      }
      m.set(t, gCell[i]);
      shedGpuTiles0.add(t);
    }
    const parts: SeamDiffResult[] = [];
    for (const p of alive) {
      const cpuShed = peekFoodShed(p);
      if (cpuShed === null) continue;
      shedPlayers += 1;
      const cpuByTile = new Map<number, number>();
      for (const tr of cpuShed.tiles) {
        const t = Number(tr);
        cpuByTile.set(t, cpuShed.hasCell(t) ? Number(cpuShed.cellAt(t)) : -1);
      }
      parts.push(
        seamDiff(cpuByTile, byOwner.get(p.smallID()) ?? new Map(), {
          label: `shed p${p.smallID()}`,
          format: (t, a, b) => `t=${String(t)} cpuCell=${a} gpuCell=${b}`,
          // The staleness contract, stated rather than left for the reader to
          // infer from a number that looks wrong (design D4). The GPU floods
          // from the state uploaded before the tick and the CPU's shed is a
          // cached snapshot on its own cadence, so the two legitimately differ
          // about WHICH tiles are covered at the edges of a growing territory.
          // They may never differ about which CELL a covered tile belongs to —
          // that is the flood's answer, and `valuesOk` is not relaxed by this.
          // MEASURED: 0.62% on verdantia at tick 1000 (96 of 15,557) and 0.027%
          // on spqr at 9303 (150 of 555,525). 1% is above both and far below
          // anything a broken seam produces — the collapse was 79%.
          membershipAllowance: 0.01,
          allowanceReason:
            "one tick of ownership churn between the uploaded snapshot and " +
            "the CPU's cached shed; cell assignment is unaffected and is " +
            "checked strictly",
        }),
      );
    }
    shedDiff = mergeSeamDiffs(parts, "shed provider");
  }
  const shedCpuTiles = shedDiff.cpuSize;
  const shedGpuTiles = shedGpuTiles0.size;
  const shedOnlyCpu = shedDiff.onlyCpu;
  const shedOnlyGpu = shedDiff.onlyGpu;
  const shedCellDiff = shedDiff.valueDiff;
  const shedSamples = shedDiff.samples;

  // THE DERIVATION, both ways. Force a recompute with the CPU flood, total up
  // what it derived; then install the provider, force another, and total the
  // same things. Same board, same tick — the only variable is where the flood
  // came from.
  const { setShedFloodProvider, foodShedField } =
    await import("../../../../core/execution/utils/FoodShed");
  const totals = (): [number, number, number, number] => {
    let tilled = 0;
    let ranked = 0;
    let people = 0;
    const regions = new Set<number>();
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh === null) continue;
      tilled += sh.tilled.size;
      ranked += sh.ranked.size;
      for (const [, v] of sh.peopleByFarm) people += v;
      for (const [, r] of sh.regionOf) regions.add(Number(r));
    }
    return [tilled, ranked, people, regions.size];
  };
  const forceAll = (): void => {
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh !== null) sh.lastCalcTick = -1;
      foodShedField(game, p);
    }
  };
  setShedFloodProvider(null);
  forceAll();
  const [derivCpuTilled, derivCpuRanked, derivCpuPeople, derivCpuRegions] =
    totals();

  // THE DERIVATION SEAM (tasks 1.3/1.5). The four new passes produce what
  // `FoodShed.recompute` used to derive on the host, so they are diffed against
  // it through `seamDiff` — membership and values, with the size reported.
  //
  // The CPU side is FRESH: the block above just forced a recompute on every
  // player with the provider removed, so `peekFoodShed` is this tick's answer
  // rather than a cadence-stale one. The GPU side gets a matching refresh and
  // one dispatch immediately below, so both describe the same board.
  //
  // ONE SKEW IS INHERENT and is stated rather than hidden: a dispatch ADVANCES
  // maturity, so `claimAccum` is computed against crop one ripen ahead of the
  // CPU's. It moves tiles across the claim threshold at the margin, and
  // `needOf` carries that into the spillover. `slotPeople` is free of it —
  // pooling reads density, occupancy and the flood, none of which the ripen
  // touches — which is convenient, because 1.1 established that `peopleByFarm`
  // is the one of the two that actually crosses back.
  uploader.refresh(game, alive, kernel);
  {
    const fr2 = kernel.beginFrame();
    compiled.runDerive(fr2);
    await fr2.finish();
  }
  const slotsNow = uploader.cellTiles;
  const gPeople = new Int32Array(await kernel.readBuffer("slotPeople"));
  const gLabor = new Int32Array(await kernel.readBuffer("slotLabor"));
  const gClaims = new Int32Array(await kernel.readBuffer("claimAccum"));
  const cpuPeople = new Map<number, number>();
  const cpuLabor = new Map<number, number>();
  const cpuClaims = new Map<number, number>();
  for (const p of alive) {
    const sh = peekFoodShed(p);
    if (sh === null) continue;
    for (const [n, v] of sh.peopleByFarm) cpuPeople.set(Number(n), v);
    for (const [n, v] of sh.laborByFarm) cpuLabor.set(Number(n), v);
    // `cellClaims` is not kept on the shed, but `ranked` is exactly its union —
    // the coverage loop adds every claimed tile of every cell to it.
    for (const n of sh.farms) cpuClaims.set(Number(n), 0);
    for (const tr of sh.ranked) {
      const t = Number(tr);
      const cell = sh.hasCell(t) ? Number(sh.cellAt(t)) : t;
      cpuClaims.set(cell, (cpuClaims.get(cell) ?? 0) + 1);
    }
  }
  const gpuBy = (arr: Int32Array): Map<number, number> => {
    const m = new Map<number, number>();
    for (let s = 0; s < slotsNow.length; s++) m.set(slotsNow[s], arr[s]);
    return m;
  };
  const RIPEN_SKEW =
    "the dispatch advances maturity one tick before this pass reads it, so " +
    "tiles at the claim margin cross on one side and not the other";
  const derivPeople = seamDiff(cpuPeople, gpuBy(gPeople), {
    label: "peopleByFarm",
    format: (t, a, b) => `nucleus=${String(t)} cpu=${a} gpu=${b}`,
  });
  const derivClaims = seamDiff(cpuClaims, gpuBy(gClaims), {
    label: "claimAccum",
    format: (t, a, b) => `nucleus=${String(t)} cpu=${a} gpu=${b}`,
    membershipAllowance: 0.01,
    allowanceReason: RIPEN_SKEW,
  });

  // AND THE SAME COUNT, ISOLATED. The diff above compares against the CPU's
  // maturity; the pass read the GPU's, which is one ripen further on. That
  // makes any disagreement ambiguous — skew or defect — and "consistent with
  // the skew" is not the gate. So the reference is rebuilt from the planes the
  // shader ACTUALLY read: its own maturity, its own shed cells, and the flag
  // mirror it was handed. On identical inputs the count has nowhere to hide.
  let isoClaims: SeamDiffResult;
  let isoRanked: SeamDiffResult;
  let isoTilled: SeamDiffResult;
  {
    const matNow = new Float32Array(await kernel.readBuffer("maturity"));
    const cellNow = new Uint32Array(await kernel.readBuffer("shedCell"));
    const flags = uploader.farmFlagsPlane;
    const ownerNow = uploader.ownerPlane;
    const slotOfCell = new Map<number, number>();
    for (let s = 0; s < slotsNow.length; s++) slotOfCell.set(slotsNow[s], s);
    const expect = new Map<number, number>();
    for (let s = 0; s < slotsNow.length; s++) expect.set(slotsNow[s], 0);
    const FLAG_FIELD_ZONE = 2;
    const FLAG_NUCLEUS = 4;
    for (let t = 0; t < cellNow.length; t++) {
      if (ownerNow[t] === 0) continue;
      const fl = flags[t];
      if ((fl & FLAG_NUCLEUS) !== 0) continue;
      const claimed =
        matNow[t] >= f.fieldClaimMilli || (fl & FLAG_FIELD_ZONE) !== 0;
      if (!claimed) continue;
      const cell = cellNow[t];
      if (cell === UNREACHED) continue;
      const slot = slotOfCell.get(cell);
      if (slot === undefined) continue;
      expect.set(slotsNow[slot], (expect.get(slotsNow[slot]) ?? 0) + 1);
    }
    isoClaims = seamDiff(expect, gpuBy(gClaims), {
      label: "claimAccum ISOLATED (reference from the GPU's own planes)",
      format: (t, a, b) => `nucleus=${String(t)} expect=${a} gpu=${b}`,
    });

    // COVERAGE, isolated the same way and for the same reason. The
    // CPU-referenced diff below carries the ripen skew as membership drift; this
    // one holds the inputs equal, so a disagreement here is the pass being
    // wrong and nothing else.
    const cov2 = new Uint32Array(await kernel.readBuffer("coverFlags"));
    const labor2 = new Int32Array(await kernel.readBuffer("slotLabor"));
    const expRanked = new Map<number, number>();
    const expTilled = new Map<number, number>();
    const gotRanked = new Map<number, number>();
    const gotTilled = new Map<number, number>();
    for (let t = 0; t < cellNow.length; t++) {
      if (ownerNow[t] === 0) continue;
      const cell = cellNow[t];
      if (cell === UNREACHED) continue;
      const slot = slotOfCell.get(cell);
      if (slot === undefined) continue;
      const fl = flags[t];
      if ((fl & FLAG_NUCLEUS) !== 0) {
        expTilled.set(t, 1);
      } else {
        const claimed =
          matNow[t] >= f.fieldClaimMilli || (fl & FLAG_FIELD_ZONE) !== 0;
        if (claimed) {
          expRanked.set(t, 1);
          const staffed = Math.max(
            0,
            Math.floor(labor2[slot] / f.farmersPerFieldTile) - 1,
          );
          if (staffed >= gClaims[slot]) expTilled.set(t, 1);
        }
      }
      const c = cov2[t];
      if ((c & 1) !== 0) gotRanked.set(t, 1);
      if ((c & 2) !== 0) gotTilled.set(t, 1);
    }
    isoRanked = seamDiff(expRanked, gotRanked, {
      label: "shed.ranked ISOLATED",
      format: (t) => `tile=${String(t)}`,
    });
    isoTilled = seamDiff(expTilled, gotTilled, {
      label: "shed.tilled ISOLATED",
      format: (t) => `tile=${String(t)}`,
    });
  }
  const derivLabor = seamDiff(cpuLabor, gpuBy(gLabor), {
    label: "laborByFarm (post-spill)",
    format: (t, a, b) => `nucleus=${String(t)} cpu=${a} gpu=${b}`,
    membershipAllowance: 0.01,
    allowanceReason: RIPEN_SKEW,
  });

  // COVERAGE (task 1.2). Per TILE, not per district — `ranked` and `tilled` are
  // tile sets, so this is the one seam in the derivation whose diff is keyed by
  // tile. Both sides are restricted to tiles the CPU's shed COVERS: a tile the
  // GPU reaches and the CPU has not is the flood's own stated drift, already
  // measured by the shed seam diff, and re-counting it here would attribute the
  // flood's staleness to the coverage pass.
  let derivRanked: SeamDiffResult;
  let derivTilled: SeamDiffResult;
  let coverEscalated = 0;
  {
    const cov = new Uint32Array(await kernel.readBuffer("coverFlags"));
    const COVER_RANKED = 1;
    const COVER_TILLED = 2;
    const COVER_ESCALATE = 4;
    const cpuRanked = new Map<number, number>();
    const cpuTilled = new Map<number, number>();
    const covered = new Set<number>();
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh === null) continue;
      for (const tr of sh.tiles) covered.add(Number(tr));
      for (const tr of sh.ranked) cpuRanked.set(Number(tr), 1);
      for (const tr of sh.tilled) cpuTilled.set(Number(tr), 1);
    }
    const gpuRanked = new Map<number, number>();
    const gpuTilled = new Map<number, number>();
    for (let t = 0; t < cov.length; t++) {
      const c = cov[t];
      if (c === 0) continue;
      if ((c & COVER_ESCALATE) !== 0) coverEscalated += 1;
      if (!covered.has(t)) continue;
      if ((c & COVER_RANKED) !== 0) gpuRanked.set(t, 1);
      if ((c & COVER_TILLED) !== 0) gpuTilled.set(t, 1);
    }
    const COVER_SKEW =
      "the dispatch advances maturity before the coverage predicate reads it, " +
      "so tiles at the claim margin are claimed on one side and not the other";
    derivRanked = seamDiff(cpuRanked, gpuRanked, {
      label: "shed.ranked",
      format: (t) => `tile=${String(t)}`,
      membershipAllowance: 0.1,
      allowanceReason: COVER_SKEW,
    });
    derivTilled = seamDiff(cpuTilled, gpuTilled, {
      label: "shed.tilled",
      format: (t) => `tile=${String(t)}`,
      membershipAllowance: 0.1,
      allowanceReason: COVER_SKEW,
    });
  }

  // REGION ADJACENCY (task 1.4). The device reports which districts touch as a
  // bit matrix; the union-find runs HERE, over ~600 nodes, because 600 is not
  // territory. This is the host half of the seam, so the probe exercises the
  // exact code a consumer would run rather than a simplified stand-in.
  let derivRegions: SeamDiffResult;
  let isoRegions: SeamDiffResult;
  let regionSaturated = 0;
  {
    const adj = new Uint32Array(await kernel.readBuffer("regionAdj"));
    const parent = new Int32Array(REGION_SLOTS);
    for (let i = 0; i < REGION_SLOTS; i++) parent[i] = i;
    const find = (a: number): number => {
      let r = a;
      while (parent[r] !== r) r = parent[r];
      while (parent[a] !== r) {
        const nx = parent[a];
        parent[a] = r;
        a = nx;
      }
      return r;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      // Lowest slot wins, so the root is a function of the SET rather than of
      // the order the edges came out of the matrix.
      if (ra < rb) parent[rb] = ra;
      else if (rb < ra) parent[ra] = rb;
    };
    const live = Math.min(slotsNow.length, REGION_SLOTS);
    for (let a = 0; a < live; a++) {
      for (let w = 0; w < REGION_WORDS; w++) {
        let bits = adj[a * REGION_WORDS + w];
        while (bits !== 0) {
          const bit = 31 - Math.clz32(bits & -bits);
          bits &= bits - 1;
          union(a, w * 32 + bit);
        }
      }
    }
    if (slotsNow.length > REGION_SLOTS) {
      regionSaturated = slotsNow.length - REGION_SLOTS;
    }
    // Compare the PARTITION, not the root labels: the CPU roots by whatever
    // union-find settled on and this roots by lowest slot, so the two name
    // regions differently while meaning the same grouping. Canonicalising each
    // side to its region's lowest NUCLEUS TILE makes them comparable without
    // making either wrong.
    const gpuRoot = new Map<number, number>();
    for (let s = 0; s < live; s++) {
      const r = find(s);
      const t = slotsNow[s];
      const rt = slotsNow[r];
      gpuRoot.set(t, Math.min(rt, gpuRoot.get(t) ?? rt));
    }
    const cpuCanon = new Map<number, number>();
    const cpuLowest = new Map<number, number>();
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh === null) continue;
      for (const [farm, root] of sh.regionOf) {
        const r = Number(root);
        const cur = cpuLowest.get(r);
        const t = Number(farm);
        if (cur === undefined || t < cur) cpuLowest.set(r, t);
      }
      for (const [farm] of sh.regionOf) {
        const r = Number(sh.regionOf.get(farm));
        cpuCanon.set(Number(farm), cpuLowest.get(r) ?? r);
      }
    }
    derivRegions = seamDiff(cpuCanon, gpuRoot, {
      label: "regionOf (partition, canonicalised to lowest nucleus)",
      format: (t, a, b) => `nucleus=${String(t)} cpuRoot=${a} gpuRoot=${b}`,
      membershipAllowance: 0.01,
      allowanceReason: RIPEN_SKEW,
    });

    // AND ISOLATED, for the reason `claimAccum` needed it and more so. A
    // PARTITION is discontinuous in its input: the covered-tile set carries a
    // stated 0.027% drift, and a single tile bridging two blobs re-roots every
    // district in both at once. So a value disagreement here can be the seam's
    // staleness expressed through a step function rather than a defect — which
    // is exactly the ambiguity that "consistent with the skew" cannot resolve.
    //
    // Note what this means for the diff's own rule: an allowance deliberately
    // never excuses a VALUE disagreement, because staleness normally changes
    // which entries exist and not what a shared one says. A derived partition
    // is the case where that stops being true, and the answer is not to relax
    // the rule but to re-reference the check.
    const expectRoot = new Map<number, number>();
    {
      const p2 = new Int32Array(REGION_SLOTS);
      for (let i = 0; i < REGION_SLOTS; i++) p2[i] = i;
      const f2 = (a: number): number => {
        let r = a;
        while (p2[r] !== r) r = p2[r];
        return r;
      };
      const u2 = (a: number, b: number): void => {
        const ra = f2(a);
        const rb = f2(b);
        if (ra < rb) p2[rb] = ra;
        else if (rb < ra) p2[ra] = rb;
      };
      const cellNow2 = new Uint32Array(await kernel.readBuffer("shedCell"));
      const ownerNow2 = uploader.ownerPlane;
      const mw = game.width();
      const slotOf2 = new Map<number, number>();
      for (let s = 0; s < slotsNow.length; s++) slotOf2.set(slotsNow[s], s);
      for (let t = 0; t < cellNow2.length; t++) {
        const o = ownerNow2[t];
        if (o === 0) continue;
        const c = cellNow2[t];
        if (c === UNREACHED) continue;
        const a2 = slotOf2.get(c);
        if (a2 === undefined || a2 >= REGION_SLOTS) continue;
        const x = t % mw;
        const nb = [
          t - mw,
          x > 0 ? t - 1 : -1,
          x < mw - 1 ? t + 1 : -1,
          t + mw,
        ];
        for (const nt of nb) {
          if (nt < 0 || nt >= cellNow2.length) continue;
          if (ownerNow2[nt] !== o) continue;
          const nc = cellNow2[nt];
          if (nc === UNREACHED || nc === c) continue;
          const b2 = slotOf2.get(nc);
          if (b2 === undefined || b2 >= REGION_SLOTS) continue;
          u2(a2, b2);
        }
      }
      for (let s = 0; s < live; s++)
        expectRoot.set(slotsNow[s], slotsNow[f2(s)]);
    }
    isoRegions = seamDiff(expectRoot, gpuRoot, {
      label: "regionOf ISOLATED (reference from the GPU's own shed cells)",
      format: (t, a, b) => `nucleus=${String(t)} expect=${a} gpu=${b}`,
    });
  }

  // OCCUPANCY PRECISION (task 1.3), measured before the shader is written and
  // WITHOUT writing one. The labour pooling adds `floor(housed * occupancy)`
  // per covered tile, where `occupancy = min(idlePop, housing) / housing` is
  // per player. The CPU does that in f64; WGSL has no f64, and the integer
  // route is closed — `housed` reaches popPerDensity (10,000, up to 16,500 in
  // the presets) and `urbanCivilians` reaches ~3.5M per player, so the exact
  // product is ~5.8e10 and overflows u32 long before a division could happen.
  //
  // f32 carries ~6e-8 relative error, so `housed * occupancy` at 16,500 is
  // uncertain by ~1e-3 — which only matters when the product lands that close
  // to an integer, because `floor` is the only thing that can turn it into a
  // whole person. Whether it ever does is a question about real boards, and it
  // is answerable HERE: re-run the CPU's own arithmetic in f32 (`Math.fround`)
  // and diff the district totals. A shader written before this would be a
  // shader written against a guess.
  let occPlayers = 0;
  let occExactlyOne = 0;
  let occDistricts = 0;
  let occDistrictsOff = 0;
  let occWorstDiff = 0;
  let occTilesOff = 0;
  let occTilesTotal = 0;
  {
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh === null) continue;
      let housing = 0;
      for (const [, h] of p.densityEntries()) housing += h;
      const idlePop = p.troops();
      const urbanCivilians = Math.min(idlePop, housing);
      const occ64 = housing > 0 ? urbanCivilians / housing : 0;
      const occ32 = Math.fround(occ64);
      occPlayers += 1;
      if (occ64 === 1) occExactlyOne += 1;
      const a = new Map<number, number>();
      const b = new Map<number, number>();
      for (const tr of sh.tiles) {
        const t = Number(tr);
        const housed = p.density(t);
        if (housed <= 0) continue;
        const cell = sh.hasCell(t) ? Number(sh.cellAt(t)) : t;
        occTilesTotal += 1;
        const n64 = Math.floor(housed * occ64);
        const n32 = Math.floor(Math.fround(housed * occ32));
        if (n64 !== n32) occTilesOff += 1;
        a.set(cell, (a.get(cell) ?? 0) + n64);
        b.set(cell, (b.get(cell) ?? 0) + n32);
      }
      for (const [cell, v] of a) {
        occDistricts += 1;
        const d = Math.abs(v - (b.get(cell) ?? 0));
        if (d > 0) occDistrictsOff += 1;
        if (d > occWorstDiff) occWorstDiff = d;
      }
    }
  }

  // COVERAGE SHAPE (task 1.2), measured before the shader that replaces it is
  // written. The design proposes a 256-bin maturity histogram plus a prefix sum
  // for the cut-off, and asks in its open questions whether 256 bins are
  // enough. Bin count is the wrong axis: a histogram picks a maturity LEVEL,
  // and the CPU's selection is `(maturity DESC, tileRef ASC)` — so whenever the
  // cut-off lands inside a group of tiles sharing one maturity, the tie-break
  // decides who eats and no histogram over maturity alone can reproduce it.
  //
  // Farms settle AT their climate ceiling, which is what makes this worth
  // measuring rather than assuming either way: settled tiles pile up on a
  // handful of values, so ties may be the common case rather than the edge.
  let covDistricts = 0;
  let covCutInTie = 0;
  let covWorstTieAtCut = 0;
  let covMaxTieAny = 0;
  let covDistinctTotal = 0;
  let covTilesTotal = 0;
  /** Districts where a cut-off actually EXISTS — the denominator the tie
   *  question is answered against. The others staff every claimed tile (no
   *  cut-off) or none of them (`slots == 0`), and can say nothing either way. */
  let covWithCut = 0;
  let covFullyStaffed = 0;
  let covNoSlots = 0;
  let covFallowAtCut = 0;
  {
    const perField = f.farmersPerFieldTile;
    for (const p of alive) {
      const sh = peekFoodShed(p);
      if (sh === null) continue;
      // Rebuild each district's ranked list exactly as `recompute` does.
      const byCell = new Map<number, number[]>();
      for (const tr of sh.ranked) {
        const t = Number(tr);
        const cell = sh.hasCell(t) ? Number(sh.cellAt(t)) : t;
        let arr = byCell.get(cell);
        if (arr === undefined) {
          arr = [];
          byCell.set(cell, arr);
        }
        arr.push(t);
      }
      for (const [cell, tiles] of byCell) {
        const mat = new Map<number, number>();
        for (const t of tiles) mat.set(t, p.farmMaturity(t));
        tiles.sort((a, b) => mat.get(b)! - mat.get(a)! || a - b);
        covDistricts += 1;
        covTilesTotal += tiles.length;
        covDistinctTotal += new Set(tiles.map((t) => mat.get(t))).size;
        // Largest run of equal maturity anywhere in this district.
        let run = 1;
        for (let i = 1; i < tiles.length; i++) {
          run = mat.get(tiles[i]) === mat.get(tiles[i - 1]) ? run + 1 : 1;
          if (run > covMaxTieAny) covMaxTieAny = run;
        }
        // Does the cut-off fall INSIDE a tie? `slots` counts the staffed
        // non-nucleus tiles, so the boundary sits between index slots-1 and
        // slots; a tie across it is one a maturity histogram cannot resolve.
        const pool = sh.laborByFarm.get(cell as never) ?? 0;
        const slots = Math.max(0, Math.floor(pool / perField) - 1);
        // The denominator that matters. A district whose pool staffs every
        // claimed tile has no cut-off at all, so it can neither confirm nor
        // refute the tie question — counting it in the denominator would be
        // the vacuous comparison this change built `SeamDiff` to prevent.
        if (slots >= tiles.length) covFullyStaffed += 1;
        if (slots === 0) covNoSlots += 1;
        if (slots > 0 && slots < tiles.length) {
          covWithCut += 1;
          covFallowAtCut += tiles.length - slots;
          const at = mat.get(tiles[slots])!;
          if (mat.get(tiles[slots - 1]) === at) {
            covCutInTie += 1;
            let n = 0;
            for (const t of tiles) if (mat.get(t) === at) n += 1;
            if (n > covWorstTieAtCut) covWorstTieAtCut = n;
          }
        }
      }
    }
  }
  let derivGpu: ReturnType<typeof totals>;
  {
    const { GpuEconomy: GE } = await import("./GpuEconomy");
    const probe = await GE.create(game);
    if (probe !== null) {
      await probe.dispatch(
        game,
        game.players().filter((q: Player) => q.isAlive()),
      );
      probe.installShedOnly();
      forceAll();
    }
    derivGpu = totals();
    probe?.dispose();
  }
  const [derivGpuTilled, derivGpuRanked, derivGpuPeople, derivGpuRegions] =
    derivGpu;
  forceAll();

  // A/B THE ACTUAL TICK, INTERLEAVED — and this is the ONLY A/B (task 0.2).
  // A first attempt ran 30 ticks with the ledger on the CPU and then 30 with it
  // on the GPU, and reported a 3% difference — which was beneath its own noise
  // floor. This board has a mean tick of ~51 ms, a p95 of 101 and a max of 255,
  // so two consecutive blocks of 30 differ by more than the effect being
  // measured, and the block form cannot be fixed by running it longer: the
  // board itself evolves between the blocks, so the two arms are never
  // comparing the same thing. Alternating tick by tick puts both arms on one
  // evolving board, and 100 samples each can see a few per cent.
  //
  // 100 is a FLOOR, not a setting: below it the measurement is the board's own
  // variance, which is how the 3% figure happened. Raise it, never lower it.
  const AB = 100;
  const cpuTicks: number[] = [];
  const gpuTicks: number[] = [];
  const gpuSimOnly: number[] = [];
  let abFallbacks = -1;
  let abServed = -1;

  // HEALTH (task 0.1). The three counts the work is done over. `districts` is
  // the one that caught the collapse: it is the number of nuclei the economy
  // actually runs its ledger over, summed across living players, and it fell
  // from ~576 to ~121 while the tick got 5x faster.
  const health = (): { districts: number; players: number; farms: number } => {
    let districts = 0;
    let players = 0;
    let farms = 0;
    for (const p of game.players()) {
      if (!p.isAlive()) continue;
      players += 1;
      farms += p.units(UnitType.Farmland).length;
      const sh = peekFoodShed(p);
      if (sh !== null) districts += sh.farms.length;
    }
    return { districts, players, farms };
  };
  const h0 = health();
  const cpuArmDistricts: number[] = [];
  const gpuArmDistricts: number[] = [];

  const { GpuEconomy } = await import("./GpuEconomy");
  const econ = await GpuEconomy.create(game);
  for (let i = 0; i < AB * 2; i++) {
    const useGpu = econ !== null && i % 2 === 1;
    if (econ !== null) {
      // Dispatch every tick either way: the GPU's state must stay current, and
      // charging its cost only to the arm that uses it would flatter the other.
      await econ.dispatch(
        game,
        game.players().filter((q: Player) => q.isAlive()),
      );
      if (useGpu) econ.install();
      else econ.uninstallProviders();
    }
    const t0 = performance.now();
    tick();
    const ms = performance.now() - t0;
    // Sampled AFTER the tick, so it counts what this arm's economy actually ran
    // over rather than what the previous one left behind.
    const d = health().districts;
    if (useGpu) {
      gpuSimOnly.push(ms);
      gpuArmDistricts.push(d);
    } else {
      cpuTicks.push(ms);
      cpuArmDistricts.push(d);
    }
    gpuTicks.push(ms);
  }
  if (econ !== null) {
    abFallbacks = econ.fallbacks;
    abServed = econ.served;
    econ.dispose();
  }
  const msTickCpu = cpuTicks.length > 0 ? median(cpuTicks) : 0;
  const msTickGpuSim = gpuSimOnly.length > 0 ? median(gpuSimOnly) : 0;
  const msTickGpu = msTickGpuSim;

  // THE ASSERTION. 20% is chosen to sit well above a late-game board's own
  // attrition over 200 ticks and well below any collapse worth the name — the
  // one that happened was 79%. It is a tripwire, not a tolerance.
  const h1 = health();
  const mean = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
  const healthCpuArmDistricts = mean(cpuArmDistricts);
  const healthGpuArmDistricts = mean(gpuArmDistricts);
  const healthTolerance = 0.2;
  const healthNotes: string[] = [];
  const fell = (name: string, before: number, after: number): void => {
    if (before <= 0) return;
    const drop = (before - after) / before;
    if (drop > healthTolerance) {
      healthNotes.push(
        `${name} fell ${(drop * 100).toFixed(1)}% across the A/B ` +
          `(${before} -> ${after}) — a faster tick here is a dead board, not a win`,
      );
    }
  };
  // DISTRICTS and FARMS are asserted; LIVING PLAYERS is reported and not.
  // Measured, on verdantia at tick 1000: players fell 27.1% (48 -> 35) across
  // 200 ticks from ordinary bot elimination while districts fell 6.8% and the
  // economy was demonstrably intact. Elimination is the game working, it is
  // lumpy at small N, and a single bad war trips any threshold worth having.
  // The collapse this tripwire exists for was districts 576 -> 121, and
  // districts and farms are what the economy's work is actually done over — a
  // real collapse hits them first and harder, so they strictly dominate players
  // as a signal.
  fell("districts", h0.districts, h1.districts);
  fell("farms", h0.farms, h1.farms);
  // And the arms against each other: interleaved on one board they should run
  // over the same districts, so a gap means one arm is serving less, not faster.
  if (healthCpuArmDistricts > 0 && healthGpuArmDistricts > 0) {
    const gap =
      Math.abs(healthCpuArmDistricts - healthGpuArmDistricts) /
      healthCpuArmDistricts;
    if (gap > healthTolerance) {
      healthNotes.push(
        `the arms ran over different district counts (cpu ` +
          `${healthCpuArmDistricts.toFixed(0)} vs gpu ` +
          `${healthGpuArmDistricts.toFixed(0)}, ${(gap * 100).toFixed(1)}%) — ` +
          `their timings are not comparable`,
      );
    }
  }
  const healthOk = healthNotes.length === 0;

  return {
    ok: true,
    adapter,
    tick: game.ticks(),
    districts: cells.length,
    prodOff,
    capOff,
    worstProd,
    worstCap,
    worstProdRel,
    worstCapRel,
    totalProdCpu,
    totalProdGpu,
    driveOff,
    acreOff,
    worstDrive,
    maturityNonZero,
    maturityMax,
    cpuMaturityMax,
    cpuAtClaim,
    acreTotalCpu,
    acresOff,
    acresTotalCpu,
    acresTotalGpu,
    tenureAgedCpu,
    tenureAgedGpu,
    tenureOff,
    randCompared,
    randWorst,
    randOverUlp,
    cityCpu,
    cityGpu,
    cityMissing,
    cityExtra,
    cityWorstRel,
    cityExtraSamples,
    cityExtraStale,
    cityExtraReal,
    cityValueOff,
    cityValueSamples,
    patchWinners,
    pickWinners,
    patchPlaced,
    creditOff,
    creditWorst,
    loopDispatches: LOOP,
    loopPlaced,
    loopProdFirst,
    loopProdLast,
    loopCreditMax,
    gatePass,
    gateHaveTile,
    gateWorstShortfall,
    residentsOff,
    residentsCpuTotal,
    residentsGpuTotal,
    reasonHistogram,
    loopWriteMissed,
    msFull,
    msConsumers,
    msCadenced,
    msUpload,
    uploadBreakdown,
    driftCompared,
    driftExact,
    driftWithin1,
    driftMax,
    driftPlacementOnly,
    driftOwnerChanged,
    driftSamples,
    msReadShedPlanes,
    msReadDistrictSlots,
    msPartitionByOwner,
    shedTilesCovered,
    abTicks: AB,
    msTickCpu,
    msTickGpu,
    msTickGpuSim,
    abFallbacks,
    abServed,
    healthDistrictsBefore: h0.districts,
    healthDistrictsAfter: h1.districts,
    healthPlayersBefore: h0.players,
    healthPlayersAfter: h1.players,
    healthFarmsBefore: h0.farms,
    healthFarmsAfter: h1.farms,
    healthCpuArmDistricts,
    healthGpuArmDistricts,
    healthOk,
    healthTolerance,
    healthNotes,
    shedPlayers,
    shedCpuTiles,
    shedGpuTiles,
    shedOnlyCpu,
    shedOnlyGpu,
    shedCellDiff,
    shedSamples,
    shedSeamLine: formatSeamDiff(shedDiff),
    shedSeamOk: shedDiff.ok,
    derivCpuTilled,
    derivGpuTilled,
    derivCpuRanked,
    derivGpuRanked,
    derivCpuPeople,
    derivGpuPeople,
    derivCpuRegions,
    derivGpuRegions,
    covDistricts,
    covCutInTie,
    covWorstTieAtCut,
    covMaxTieAny,
    covDistinctTotal,
    covTilesTotal,
    derivPeopleLine: formatSeamDiff(derivPeople),
    derivClaimsLine: formatSeamDiff(derivClaims),
    derivIsoClaimsLine: formatSeamDiff(isoClaims),
    derivRankedLine: formatSeamDiff(derivRanked),
    derivTilledLine: formatSeamDiff(derivTilled),
    derivIsoRankedLine: formatSeamDiff(isoRanked),
    derivIsoTilledLine: formatSeamDiff(isoTilled),
    coverEscalated,
    derivRegionsLine: formatSeamDiff(derivRegions),
    derivIsoRegionsLine: formatSeamDiff(isoRegions),
    regionSaturated,
    derivLaborLine: formatSeamDiff(derivLabor),
    derivSeamOk:
      derivPeople.ok &&
      isoClaims.ok &&
      isoRegions.ok &&
      isoRanked.ok &&
      isoTilled.ok,
    occPlayers,
    occExactlyOne,
    occDistricts,
    occDistrictsOff,
    occWorstDiff,
    occTilesOff,
    occTilesTotal,
    covWithCut,
    covFullyStaffed,
    covNoSlots,
    covFallowAtCut,
  };
}
