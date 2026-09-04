// Drive src/client/economy/FieldProbe.worker.ts: can a Web Worker — where the
// simulation actually runs — own a WebGPU device, upload live game state,
// dispatch the economy floods, and read back a result that matches the CPU
// field the sim just computed for itself?
//
//   node .claude/skills/run-openfront/economy-worker-probe.mjs [--map Verdantia] [--ticks 1200]
import { chromium } from "playwright";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "Verdantia");
const TICKS = Number(arg("ticks", "1200"));

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
  async ({ map, ticks }) => {
    const { getCdnBase, getAssetManifest } =
      await import("/src/core/AssetUrls.ts");
    const { GameMapType } = await import("/src/core/game/Game.ts");
    const Worker = (
      await import("/src/client/economy/FieldProbe.worker.ts?worker&inline")
    ).default;
    const worker = new Worker();
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("probe timed out")),
        600000,
      );
      worker.onmessage = (e) => {
        clearTimeout(timer);
        resolve(e.data);
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message ?? "worker error"));
      };
      worker.postMessage({
        mapType: GameMapType[map],
        bots: 40,
        ticks,
        cdnBase: getCdnBase(),
        assetManifest: getAssetManifest(),
      });
    });
    worker.terminate();
    return result;
  },
  { map: MAP, ticks: TICKS },
);

await browser.close();

if (!out.ok) {
  console.log("FAILED:", out.error);
  process.exit(1);
}
const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(2)}%`;
console.log(`adapter (inside the worker): ${out.adapter}`);
console.log(
  `map ${out.width}x${out.height}  tick=${out.tick}  players=${out.players}`,
);
console.log(
  `timing: CPU recompute ${out.cpuMs.toFixed(1)} ms` +
    `   GPU flood ${out.gpuMs.toFixed(2)} ms + upload ${out.uploadMs.toFixed(2)} ms` +
    ` = ${(out.gpuMs + out.uploadMs).toFixed(2)} ms` +
    `   (flood alone ${(out.cpuMs / out.gpuMs).toFixed(1)}×, with upload ${(out.cpuMs / (out.gpuMs + out.uploadMs)).toFixed(1)}×)`,
);
console.log(
  `delta refresh (planes resident, one cadence later): ` +
    `${out.deltaChangedTiles} tiles changed in ${out.deltaRuns} runs (${out.deltaElements} elements)\n` +
    `        medians of 5: rebuild ${out.deltaRebuildMs.toFixed(2)} ms + upload ${out.deltaUploadMs.toFixed(2)} ms + flood ${out.deltaFloodMs.toFixed(2)} ms` +
    ` = ${(out.deltaRebuildMs + out.deltaUploadMs + out.deltaFloodMs).toFixed(2)} ms   vs CPU ${out.cpuMs.toFixed(1)} ms` +
    `   (${(out.cpuMs / (out.deltaRebuildMs + out.deltaUploadMs + out.deltaFloodMs)).toFixed(1)}×)`,
);
console.log(
  `\nSTAGE 1 — a CONSUMER on the GPU (urbanSuitability, reading the flood in place):\n` +
    `  compared ${out.suitCompared} owned tiles (supply distance agreeing)\n` +
    `  max |cpu - gpu| = ${out.suitMaxAbsDiff.toExponential(2)}   tiles over 1e-4: ${out.suitOver1e4}`,
);
console.log(
  `\nSTAGE 3 — an ITERATION consumer re-expressed as a reduction (assessUrbanRoom):\n` +
    `  all players:   ${out.roomExact}/${out.roomPlayers} exact   worst |cpu-gpu| = ${out.roomWorstDiff}\n` +
    `  FRESH field:   ${out.roomFreshExact}/${out.roomFreshPlayers} exact   worst |cpu-gpu| = ${out.roomFreshWorstDiff}\n` +
    `  readback of the whole 256-slot accumulator: ${out.roomReadbackMs.toFixed(2)} ms`,
);
console.log(
  `\nPLACEMENT DRAW — exponential race vs the CPU's weighted scan (same LAW,\n` +
    `different randomness, so the tile differs but the distribution must not):\n` +
    `  ${out.drawTrials} draws   mean suitability of winner = ${out.drawMeanSuit.toFixed(5)}\n` +
    `  weighted mean the CPU samples from (sum w^2 / sum w) = ${out.drawExpected.toFixed(5)}   ` +
    `ratio ${(out.drawMeanSuit / Math.max(out.drawExpected, 1e-9)).toFixed(4)}\n` +
    `  shader output: ${out.picksValid}/${out.picksChecked} players picked an eligible tile`,
);
console.log(
  `\nDISTRICT LEDGER — per-cell harvest and granary capacity on the GPU:\n` +
    `  ${out.cellsExact}/${out.cellsCompared} districts exact` +
    `   worst |cpu-gpu| production=${out.cellWorstProd} capacity=${out.cellWorstCap}` +
    `\n  (${out.cellsStaleSkipped} districts skipped: owner's cached shed is stale)` +
    `\n  isolated (reference driven from the GPU's own planes): ` +
    `${out.isoExact}/${out.isoCells} exact, worst ${out.isoWorst}`,
);
console.log(
  `\nFARM RIPEN — the crop CA on the GPU vs the CPU's own advance:\n` +
    `  ${out.ripenExact}/${out.ripenCompared} tiles bit-identical   max |cpu-gpu| = ${out.ripenMaxDiff}` +
    (out.ripenSamples?.length ? `\n  ` + out.ripenSamples.join("\n  ") : ""),
);
const gpuCycle = out.readbackMs + out.materialiseMs;
console.log(
  `\nTHE INTEGRATION COST — supply field, one full refresh cadence:\n` +
    `  CPU: recompute every player's BFS         ${out.cpuSupplyCycleMs.toFixed(2)} ms\n` +
    `  GPU: readback ${out.readbackMs.toFixed(2)} ms + materialise ${out.materialiseMs.toFixed(2)} ms` +
    ` (${out.mapEntries} Map entries) = ${gpuCycle.toFixed(2)} ms  [flood not counted]\n` +
    `  → readback+materialise alone is ${(gpuCycle / out.cpuSupplyCycleMs).toFixed(2)}× the ENTIRE CPU cost`,
);
console.log(
  `supply: both=${out.supply.both}  exact=${out.supply.same} (${pct(out.supply.same, out.supply.both)})` +
    `  only-cpu=${out.supply.onlyCpu}  only-gpu=${out.supply.onlyGpu}`,
);
console.log(
  `shed:   both=${out.shed.both}  same-cell=${out.shed.sameCell} (${pct(out.shed.sameCell, out.shed.both)})` +
    `  only-cpu=${out.shed.onlyCpu}  only-gpu=${out.shed.onlyGpu}`,
);

// The invariant: on any player whose cached field is CURRENT, the two floods
// must agree exactly — same coverage, same distances. Differences on stale
// players are the cache being old, not the flood being wrong.
const supplyExact =
  out.supply.diffFresh === 0 &&
  out.supply.onlyCpuFresh === 0 &&
  out.supply.onlyGpuFresh === 0;
console.log(
  `  coverage differences, all attributable to the cached field's staleness:\n` +
    `    only-gpu ${out.supply.onlyGpu}: ${out.supply.onlyGpu - out.supply.onlyGpuFresh} stale-owner (expected), ${out.supply.onlyGpuFresh} fresh-owner (bug)\n` +
    `    only-cpu ${out.supply.onlyCpu}: ${out.supply.onlyCpu - out.supply.onlyCpuFresh} stale-or-changed-hands (expected), ${out.supply.onlyCpuFresh} fresh-and-same-owner (bug)\n` +
    `    differing distance ${out.supply.both - out.supply.same}: ${out.supply.both - out.supply.same - out.supply.diffFresh} stale-owner (expected), ${out.supply.diffFresh} fresh-owner (bug)`,
);
console.log(
  supplyExact
    ? "\nPASS — on every player whose cached field is current, the GPU flood and the\n" +
        "       CPU flood agree exactly. All differences trace to cache staleness."
    : "\nFAIL — the floods genuinely disagree on a freshly-refreshed player.",
);
process.exit(supplyExact ? 0 : 1);
