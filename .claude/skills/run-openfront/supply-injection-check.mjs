// Level A proof. Spawns TWO workers on the same seed — one running the
// simulation as it ships, one with the GPU field pipeline's supply plane
// injected through `setSupplyProvider` — and compares their hash streams.
//
// Two workers, not two games in one: the map loader caches GameMapImpl and its
// `state` array is mutable game state, so a second game in the same module
// context inherits the first one's board.
//
//   node .claude/skills/run-openfront/supply-injection-check.mjs [--map Verdantia]
//        [--ticks 300] [--control]   (--control runs cpu vs a declining hook)
import { chromium } from "playwright";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "Verdantia");
const TICKS = Number(arg("ticks", "300"));
const MODE_B = process.argv.includes("--control") ? "decline" : "gpu";
const ORDER_AS_BFS = process.argv.includes("--bfs-order");
const LEDGER = process.argv.includes("--ledger");

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

const runOne = (mode, seed) =>
  page.evaluate(
    async ({ map, ticks, mode, seed, orderAsBfs, ledger }) => {
      const { getCdnBase, getAssetManifest } =
        await import("/src/core/AssetUrls.ts");
      const { GameMapType } = await import("/src/core/game/Game.ts");
      const Worker = (
        await import("/src/client/economy/SupplyInjection.worker.ts?worker&inline")
      ).default;
      const worker = new Worker();
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 900000);
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
          bots: 30,
          ticks,
          seed,
          mode,
          orderAsBfs,
          ledger,
          cdnBase: getCdnBase(),
          assetManifest: getAssetManifest(),
        });
      });
      worker.terminate();
      return result;
    },
    { map, ticks: TICKS, mode, seed, orderAsBfs: ORDER_AS_BFS, ledger: LEDGER },
  );

const map = MAP;
const seed = `inject-${TICKS}`;
const a = await runOne("cpu", seed);
const b = await runOne(MODE_B, seed);
await browser.close();

if (!a.ok || !b.ok) {
  console.log("FAILED:", a.error ?? b.error);
  process.exit(1);
}
const len = Math.min(a.hashes.length, b.hashes.length);
let matched = 0;
let firstDivergence = null;
for (let i = 0; i < len; i++) {
  if (a.hashes[i] === b.hashes[i]) matched += 1;
  else if (firstDivergence === null) firstDivergence = i;
}
console.log(`mode B: ${MODE_B}   adapter: ${b.adapter}`);
console.log(
  `hashes compared: ${len}   matched: ${matched}   first divergence: ${firstDivergence ?? "none"}`,
);
if (b.firstStaleTick !== undefined && b.firstStaleTick >= 0) {
  const divTick =
    firstDivergence === null ? null : (b.hashTicks?.[firstDivergence] ?? null);
  console.log(
    `territory first moved between the plane and the fill at tick ${b.firstStaleTick}` +
      `   (${b.staleCalls} such calls)   first hash divergence at tick ${divTick ?? "none"}`,
  );
} else if (b.firstStaleTick === -1) {
  console.log(
    `territory NEVER moved between the plane and the fill — timing cannot be the cause here`,
  );
}
const divTick2 =
  firstDivergence === null ? null : (b.hashTicks?.[firstDivergence] ?? null);
console.log(
  `supply SOURCES missing from the plane: first at tick ${b.firstSeedStaleTick ?? "n/a"}` +
    `   (${b.seedStaleCalls ?? 0} such calls)   first hash divergence at tick ${divTick2 ?? "none"}`,
);
console.log(
  `VALUE diff vs the sim's own BFS: first at tick ${b.firstValueDiffTick ?? "n/a"}` +
    `   (${b.valueDiffCalls ?? 0} calls, worst ${b.worstValueDiff ?? 0} tiles)`,
);
console.log(
  `SHED seeds missing from the flood: first at tick ${b.firstShedSeedStale ?? "n/a"}` +
    `   (${b.shedSeedStaleCalls ?? 0} calls)   first hash divergence at tick ${divTick2 ?? "none"}`,
);
console.log(
  `MATURITY drift (gpu CA vs cpu field): first at tick ${b.firstMatDrift ?? "n/a"}` +
    `   (${b.matDriftCalls ?? 0} refreshes, worst ${b.worstMatTiles ?? 0} tiles, worst delta ${(b.worstMatDelta ?? 0).toFixed(1)} milli;  gpu BEHIND on ${b.behindTiles ?? 0}, AHEAD on ${b.aheadTiles ?? 0})`,
);
console.log(
  `LEDGER diff vs the CPU loop: first at tick ${b.firstLedgerDiff ?? "n/a"}` +
    `   (${b.ledgerDiffCalls ?? 0} calls, worst ${b.worstLedgerDiff ?? 0} milli over ${b.worstLedgerCells ?? 0} cells)`,
);
console.log(
  `wall: A ${a.wallMs.toFixed(0)} ms   B ${b.wallMs.toFixed(0)} ms`,
);
if (b.cost && b.cost.refreshes > 0) {
  const c = b.cost;
  const n = c.refreshes;
  const per = (v) => (v / n).toFixed(2).padStart(7);
  const overhead = (b.wallMs - a.wallMs) / n;
  console.log(
    `per refresh (${n} refreshes):  upload ${per(c.upload)} ms   ` +
      `dispatch ${per(c.dispatch)} ms   readback ${per(c.readback)} ms   ` +
      `convert ${per(c.convert)} ms`,
  );
  console.log(
    `                              accounted ${(
      (c.upload + c.dispatch + c.readback + c.convert) /
      n
    ).toFixed(2)} ms   vs measured overhead ${overhead.toFixed(2)} ms/tick`,
  );
}
const clean = len > 0 && matched === len && firstDivergence === null;
console.log(
  clean
    ? "\nPASS — the simulation is identical with the field injected."
    : "\nFAIL — the injected field changed the simulation.",
);
process.exit(clean ? 0 : 1);
