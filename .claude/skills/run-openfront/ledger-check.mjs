// Diff the GPU district ledger against the CPU's, cell by cell.
//
//   node .claude/skills/run-openfront/ledger-check.mjs [--map Verdantia] [--ticks 800]
import { chromium } from "playwright";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "Verdantia");
const TICKS = Number(arg("ticks", "800"));
const BOTS = Number(arg("bots", "30"));
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text());
});
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const out = await page.evaluate(
  async ({ map, ticks, bots }) => {
    const { getCdnBase, getAssetManifest } =
      await import("/src/core/AssetUrls.ts");
    const { GameMapType } = await import("/src/core/game/Game.ts");
    const W = (
      await import("/src/client/economy/LedgerProbe.worker.ts?worker&inline")
    ).default;
    const worker = new W();
    const r = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timed out")), 900000);
      worker.onmessage = (e) => {
        clearTimeout(t);
        res(e.data);
      };
      worker.onerror = (e) => {
        clearTimeout(t);
        rej(new Error(e.message ?? "worker error"));
      };
      worker.postMessage({
        mapType: GameMapType[map],
        bots,
        ticks,
        seed: `ledger-${ticks}`,
        cdnBase: getCdnBase(),
        assetManifest: getAssetManifest(),
      });
    });
    worker.terminate();
    return r;
  },
  { map: MAP, ticks: TICKS, bots: BOTS },
);
await browser.close();
if (!out.ok) {
  console.log("FAILED:", out.error);
  process.exit(1);
}
const pct = (a, b) => (b === 0 ? "n/a" : `${((a / b) * 100).toFixed(2)}%`);
console.log(
  `adapter ${out.adapter}   tick ${out.tick}   districts ${out.districts}`,
);
console.log(
  `production: ${out.prodOff} districts off by >1 milli (${pct(out.prodOff, out.districts)}), worst ${out.worstProd} milli, worst relative ${(out.worstProdRel * 100).toFixed(4)}%`,
);
console.log(
  `capacity:   ${out.capOff} districts off by >1 milli (${pct(out.capOff, out.districts)}), worst ${out.worstCap} milli, worst relative ${(out.worstCapRel * 100).toFixed(4)}%`,
);
console.log(
  `patch drive:  ${out.driveOff} districts off by >1 milli (${pct(out.driveOff, out.districts)}), worst ${out.worstDrive} milli`,
);
console.log(
  `patch acreage: ${out.acreOff} districts with a different tile count (${pct(out.acreOff, out.districts)})`,
);
console.log(
  `crop present: ${out.maturityNonZero} tiles with maturity, max ${out.maturityMax} milli (cpu input max ${out.cpuMaturityMax}, ${out.cpuAtClaim} at/above claim); credit-stream acreage ${out.acreTotalCpu} tiles`,
);
console.log(
  `labour acreage: ${out.acresOff} districts off (${pct(out.acresOff, out.districts)}), total cpu ${out.acresTotalCpu} gpu ${out.acresTotalGpu}`,
);
console.log(
  `farm tenure: ${out.tenureOff} tiles disagree with the CPU expectation; aged cpu ${out.tenureAgedCpu} gpu ${out.tenureAgedGpu}`,
);
console.log(
  `total production  cpu ${out.totalProdCpu}  gpu ${out.totalProdGpu}  delta ${out.totalProdGpu - out.totalProdCpu} (${pct(Math.abs(out.totalProdGpu - out.totalProdCpu), out.totalProdCpu)})`,
);
console.log(
  `prng parity: ${out.randCompared} draws compared, worst |cpu-gpu| ${out.randWorst?.toExponential(2)}, ${out.randOverUlp} beyond one f32 ulp`,
);
console.log(
  `city weight: cpu ${out.cityCpu} tiles, gpu ${out.cityGpu}; missing ${out.cityMissing}, extra ${out.cityExtra}, worst relative ${(out.cityWorstRel * 100).toFixed(4)}%`,
);
console.log(
  `  extras by cause: ${out.cityExtraStale} supply-cadence staleness, ${out.cityExtraReal} genuine predicate disagreement`,
);
console.log(`  values off by >0.1%: ${out.cityValueOff}`);
for (const s of out.cityValueSamples ?? []) console.log(`    ${s}`);
console.log(
  `draws: ${out.patchWinners} districts and ${out.pickWinners} players got a winner`,
);
console.log(
  `patch apply: ${out.patchPlaced} districts placed a plot; credit ledger ${out.creditOff} off (worst ${out.creditWorst} milli)`,
);
console.log(
  `repeat x${out.loopDispatches}: ${out.loopPlaced} plots placed (${out.loopWriteMissed} failed to land at the claim threshold); production total ${out.loopProdFirst} -> ${out.loopProdLast} (stable means the accumulators reset); max credit ${out.loopCreditMax}`,
);
console.log(
  `labour gate: ${out.gatePass} of ${out.districts} districts clear it (${out.gateHaveTile} of those also have a frontier tile); worst shortfall ${out.gateWorstShortfall} farmers`,
);
console.log(
  `residents upload: ${out.residentsOff} slots differ; cpu total ${out.residentsCpuTotal}, gpu total ${out.residentsGpuTotal}`,
);
const R = [
  "no drive",
  "drive",
  "saving",
  "labour-blocked",
  "no tile",
  "PLACED",
];
console.log(
  `patch branches over the loop: ${(out.reasonHistogram ?? []).map((n, i) => `${R[i]} ${n}`).join(", ")}`,
);
console.log(
  `dispatch cost: full ${out.msFull?.toFixed(2)} ms, consumers-only ${out.msConsumers?.toFixed(2)} ms, ` +
    `10-tick flood cadence averages ${out.msCadenced?.toFixed(2)} ms; uploader refresh ${out.msUpload?.toFixed(2)} ms`,
);
console.log(`  uploader breakdown (ms): ${out.uploadBreakdown}`);
console.log(
  `maturity drift (2.3): ${out.driftCompared} tiles compared, ${out.driftExact} exact ` +
    `(${((out.driftExact / Math.max(1, out.driftCompared)) * 100).toFixed(3)}%), ` +
    `${out.driftWithin1} within 1 milli, worst ${out.driftMax?.toFixed(2)}; ` +
    `excluded ${out.driftOwnerChanged} conquest, ${out.driftPlacementOnly} placement-offset`,
);
for (const s of out.driftSamples ?? []) console.log(`    ${s}`);
console.log(
  `readback: two shed PLANES ${out.msReadShedPlanes?.toFixed(2)} ms vs three district SLOT arrays ${out.msReadDistrictSlots?.toFixed(2)} ms; ` +
    `partitioning the planes by owner costs a further ${out.msPartitionByOwner?.toFixed(2)} ms (${out.shedTilesCovered} tiles covered)`,
);
console.log(
  `TICK A/B interleaved, ${out.abTicks} samples per arm: cpu ledger ${out.msTickCpu?.toFixed(1)} ms/tick vs gpu ledger ${out.msTickGpuSim?.toFixed(1)} ms/tick (sim only, both arms pay the dispatch); ${out.abServed} districts served, ${out.abFallbacks} fallbacks`,
);
console.log(
  `shed provider vs CPU shed (${out.shedPlayers} players): cpu ${out.shedCpuTiles} tiles, gpu ${out.shedGpuTiles}; ` +
    `only-cpu ${out.shedOnlyCpu}, only-gpu ${out.shedOnlyGpu}, different cell ${out.shedCellDiff}`,
);
console.log(`  SEAM DIFF — ${out.shedSeamLine}`);
for (const s of out.shedSamples ?? []) console.log(`    ${s}`);
console.log(
  `shed DERIVATION cpu vs gpu flood: tilled ${out.derivCpuTilled}/${out.derivGpuTilled}, ` +
    `ranked ${out.derivCpuRanked}/${out.derivGpuRanked}, ` +
    `people ${out.derivCpuPeople}/${out.derivGpuPeople}, ` +
    `regions ${out.derivCpuRegions}/${out.derivGpuRegions}`,
);

// THE DERIVATION SEAM (tasks 1.3/1.5): the moved passes vs FoodShed.recompute.
console.log(
  `\nshed derivation seam (GPU passes vs FoodShed.recompute):\n` +
    `  ${out.derivPeopleLine}\n  ${out.derivClaimsLine}\n  ${out.derivIsoClaimsLine}\n` +
    `  ${out.derivLaborLine}\n  ${out.derivRankedLine}\n  ${out.derivIsoRankedLine}\n` +
    `  ${out.derivTilledLine}\n  ${out.derivIsoTilledLine}\n` +
    `  escalated to the host: ${out.coverEscalated} tiles\n` +
    `  ${out.derivRegionsLine}\n  ${out.derivIsoRegionsLine}` +
    (out.regionSaturated > 0
      ? `\n  WARNING: ${out.regionSaturated} districts beyond the adjacency cap`
      : ""),
);

// OCCUPANCY PRECISION (task 1.3): can the pooling run in f32?
console.log(
  `\nocc precision (f64 vs f32 labour pooling): ${out.occPlayers} players, ` +
    `${out.occExactlyOne} with occupancy exactly 1.0\n` +
    `  tiles differing: ${out.occTilesOff} of ${out.occTilesTotal}; ` +
    `districts differing: ${out.occDistrictsOff} of ${out.occDistricts}, worst ${out.occWorstDiff} people`,
);

// COVERAGE SHAPE (task 1.2): does the cut-off land inside a maturity tie?
console.log(
  `\ncoverage shape: ${out.covDistricts} districts, ${out.covTilesTotal} ranked tiles, ` +
    `${(out.covDistinctTotal / Math.max(1, out.covDistricts)).toFixed(1)} distinct maturities per district\n` +
    `  districts with a LIVE cut-off: ${out.covWithCut} (${out.covFullyStaffed} staff every tile, ` +
    `${out.covNoSlots} staff none — neither can answer the tie question)\n` +
    `  cut-off falls INSIDE a maturity tie: ${out.covCutInTie} of ${out.covWithCut} ` +
    `(${((out.covCutInTie / Math.max(1, out.covWithCut)) * 100).toFixed(1)}%)\n` +
    `  worst tie AT a cut-off: ${out.covWorstTieAtCut} tiles; largest tie anywhere: ${out.covMaxTieAny}; ` +
    `fallow tiles decided by a cut-off: ${out.covFallowAtCut}`,
);

// HEALTH (task 0.1). The timing above means nothing without this: twice now a
// tick got faster because the board had died, and both times it read as a win.
console.log(
  `\nHEALTH across the A/B (tolerance ${((out.healthTolerance ?? 0.2) * 100).toFixed(0)}% fall):\n` +
    `  districts      ${out.healthDistrictsBefore} -> ${out.healthDistrictsAfter}   [asserted]\n` +
    `  farms          ${out.healthFarmsBefore} -> ${out.healthFarmsAfter}   [asserted]\n` +
    `  living players ${out.healthPlayersBefore} -> ${out.healthPlayersAfter}   [context — elimination is the game working]\n` +
    `  districts run over per tick: cpu arm ${out.healthCpuArmDistricts?.toFixed(0)}, ` +
    `gpu arm ${out.healthGpuArmDistricts?.toFixed(0)}`,
);
for (const n of out.healthNotes ?? []) console.log(`  FAIL: ${n}`);
console.log(
  out.healthOk
    ? "  PASS — the board is intact, so the timings above are comparable."
    : "  FAIL — the timings above are not a measurement of this change.",
);
process.exit(out.healthOk ? 0 : 1);
