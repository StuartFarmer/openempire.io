// Diff the GPU district ledger against the CPU's, cell by cell.
//
//   node .claude/skills/run-openfront/ledger-check.mjs [--map Verdantia] [--ticks 800]
import { chromium } from "playwright";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const MAP = arg("map", "Verdantia");
const TICKS = Number(arg("ticks", "800"));
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });
await page.goto("http://localhost:9000/", { waitUntil: "load" });
await page.waitForTimeout(3000);
const out = await page.evaluate(async ({ map, ticks }) => {
  const { getCdnBase, getAssetManifest } = await import("/src/core/AssetUrls.ts");
  const { GameMapType } = await import("/src/core/game/Game.ts");
  const W = (await import("/src/client/economy/LedgerProbe.worker.ts?worker&inline")).default;
  const worker = new W();
  const r = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timed out")), 900000);
    worker.onmessage = (e) => { clearTimeout(t); res(e.data); };
    worker.onerror = (e) => { clearTimeout(t); rej(new Error(e.message ?? "worker error")); };
    worker.postMessage({ mapType: GameMapType[map], bots: 30, ticks, seed: `ledger-${ticks}`,
      cdnBase: getCdnBase(), assetManifest: getAssetManifest() });
  });
  worker.terminate();
  return r;
}, { map: MAP, ticks: TICKS });
await browser.close();
if (!out.ok) { console.log("FAILED:", out.error); process.exit(1); }
const pct = (a, b) => (b === 0 ? "n/a" : `${((a / b) * 100).toFixed(2)}%`);
console.log(`adapter ${out.adapter}   tick ${out.tick}   districts ${out.districts}`);
console.log(`production: ${out.prodOff} districts off by >1 milli (${pct(out.prodOff, out.districts)}), worst ${out.worstProd} milli, worst relative ${(out.worstProdRel * 100).toFixed(4)}%`);
console.log(`capacity:   ${out.capOff} districts off by >1 milli (${pct(out.capOff, out.districts)}), worst ${out.worstCap} milli, worst relative ${(out.worstCapRel * 100).toFixed(4)}%`);
console.log(`patch drive:  ${out.driveOff} districts off by >1 milli (${pct(out.driveOff, out.districts)}), worst ${out.worstDrive} milli`);
console.log(`patch acreage: ${out.acreOff} districts with a different tile count (${pct(out.acreOff, out.districts)})`);
console.log(`total production  cpu ${out.totalProdCpu}  gpu ${out.totalProdGpu}  delta ${out.totalProdGpu - out.totalProdCpu} (${pct(Math.abs(out.totalProdGpu - out.totalProdCpu), out.totalProdCpu)})`);
