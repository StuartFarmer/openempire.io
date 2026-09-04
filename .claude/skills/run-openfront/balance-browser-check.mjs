// Does the BROWSER host of the balance harness reproduce the NODE host's
// numbers exactly? It must, before any GPU divergence is introduced — otherwise
// a later mismatch is unattributable: host or GPU?
//
//   node .claude/skills/run-openfront/balance-browser-check.mjs [--map Verdantia]
//        [--ticks 1500] [--seed base-0]
import { chromium } from "playwright";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "Verdantia");
const TICKS = Number(arg("ticks", "1500"));
const SEED = arg("seed", "base-0");

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
  async ({ map, ticks, seed }) => {
    const { getCdnBase, getAssetManifest } = await import("/src/core/AssetUrls.ts");
    const { GameMapType, Difficulty } = await import("/src/core/game/Game.ts");
    const Worker = (
      await import("/src/client/economy/BalanceGame.worker.ts?worker&inline")
    ).default;
    const worker = new Worker();
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out")), 900000);
      worker.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message ?? "worker error")); };
      worker.postMessage({
        spec: {
          map: GameMapType[map],
          seed,
          ticks,
          bots: 40,
          nations: 20,
          sampleEvery: 50,
          difficulty: Difficulty.Medium,
          overrides: {},
        },
        cdnBase: getCdnBase(),
        assetManifest: getAssetManifest(),
      });
    });
    worker.terminate();
    return result;
  },
  { map: MAP, ticks: TICKS, seed: SEED },
);
await browser.close();

if (!out.ok) {
  console.log("FAILED:", out.error);
  process.exit(1);
}
const r = out.result;
console.log(`adapter: ${out.adapter}`);
console.log(
  `browser: alive ${r.finalAlive}, leader ${(r.finalLeaderShare * 100).toFixed(1)}%, hash ${r.stateHash}`,
);
console.log(`(compare with: npx tsx tests/perf/balance/BalanceRun.ts --map ${MAP.toLowerCase()} --runs 1 --nations 20 --bots 40 --ticks ${TICKS} --seed-prefix ${SEED.replace(/-\d+$/, "")})`);
