// Confirm snow fully covers at/below 0°C: probe a near-freezing tile.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => {
  const t = document.querySelector("game-shell-page")?.textContent ?? "";
  return t.includes("zoom") && !t.includes("Loading") && !t.includes("Deriving") && !/zoom 1×/.test(t);
}, { timeout: 180000 });
await page.waitForTimeout(600);
// Sample a strip across Canada/US at July (tick 260) to find the 0°C snow line.
const probe = async (cx, cy) => {
  await page.evaluate(([cx, cy]) => {
    const el = document.querySelector("game-shell-page");
    el.camera = { cx, cy, scale: 8 }; el.tickCount = 0; // January
  }, [cx, cy]);
  await page.waitForTimeout(200);
  await page.mouse.move(800, 500);
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll("game-shell-page .font-mono")].pop();
    const out = {};
    for (const d of panel.querySelectorAll("div")) {
      const sp = d.querySelectorAll("span");
      if (sp.length === 2) out[sp[0].textContent.trim()] = sp[1].textContent.trim();
    }
    return out;
  });
};
// Walk latitudes down a cold-ish meridian (interior N America ~ x=1050) in January.
for (const cy of [560, 620, 680, 740]) {
  const r = await probe(1050, cy);
  console.log(`y=${cy} ${r["lat / lon"]}  temp ${r.temp}  snow ${r.snow ?? "0%"}  biome ${r.biome}`);
}
await page.screenshot({ path: "/tmp/openfront-run/snow.png" });
await browser.close();
