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
import { assetUrl, type AssetManifest } from "../../core/AssetUrls";
import { isFallow, peekFoodShed } from "../../core/execution/utils/FoodShed";
import { tenureCurve } from "../../core/execution/utils/TileTenure";
import { FetchGameMapLoader } from "../../core/game/FetchGameMapLoader";
import {
  Difficulty,
  GameMapType,
  GameMode,
  GameType,
  LandUse,
  type Game,
  type Player,
} from "../../core/game/Game";
import { createGameRunner } from "../../core/GameRunner";
import type { GameStartInfo } from "../../core/Schemas";
import { compileFieldSystem } from "../webgpu/FieldDynamics";
import { FieldKernel } from "../webgpu/FieldKernel";
import { CUTOFF_RADII, economyFields } from "./fields/system";
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
    await import("../../core/execution/SpawnTimerExecution");
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
  uploader.refresh(game, alive, kernel);
  const frame = kernel.beginFrame();
  compiled.runDerive(frame);
  await frame.finish();

  const driveGpu = new Int32Array(await kernel.readBuffer("driveAccum"));
  const acreGpu = new Int32Array(await kernel.readBuffer("acreAccum"));
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
  };
}
