// What does a GPU-resident economy cost at the scale that breaks the CPU sim?
// Runs the `empire` field system (the existing WESL 4X economy: potential /
// pop / troops / food / supply / owner / incursion) on a 2048x1024 map and
// reads the viewer's own GPU timing + tick rate — the number that decides
// whether moving the economy to compute shaders is worth a rewrite.
//
//   node .claude/skills/run-openfront/gpu-economy-cost.mjs [--map SPQR]
import { chromium } from "playwright";

const SHELL = "game-shell-page:not([ambient])";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "SPQR");

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  (s) => /week \d+/.test(document.querySelector(s)?.textContent ?? ""),
  SHELL,
  { timeout: 120000 },
);
await page.selectOption(`${SHELL} select >> nth=0`, "empire");
await page.waitForTimeout(6000);
await page.selectOption(`${SHELL} select >> nth=1`, MAP);
await page.waitForTimeout(30000);

const dims = await page.evaluate((s) => {
  const el = document.querySelector(s);
  return { w: el?.mapWidth, h: el?.mapHeight, system: el?.systemId };
}, SHELL);
console.log(`system=${dims.system} map=${MAP} ${dims.w}x${dims.h}`);

// Paint starting territories so the economy has owners, then run.
const box = await page.locator(`${SHELL} #shell-canvas`).boundingBox();
for (const [brush, dx, dy] of [
  ["spawnP1", -260, -80],
  ["spawnP2", 200, 40],
  ["spawnP3", -60, 160],
]) {
  await page.selectOption(`${SHELL} select`, { label: brush }).catch(() => {});
  await page.mouse.click(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
  );
}
await page.click(`${SHELL} button:has-text("Play")`).catch(() => {});

const sample = async (label) => {
  await page.waitForTimeout(8000);
  const s = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      gpuMs: el?.gpuMs,
      ticksPerSec: el?.ticksPerSec,
      tick: el?.tickReadout,
      running: el?.running,
      turbo: el?.turbo,
    };
  }, SHELL);
  console.log(
    `${label.padEnd(12)} tick=${s.tick} ticks/s=${Number(s.ticksPerSec).toFixed(1)} gpuMs=${Number(s.gpuMs).toFixed(3)} running=${s.running} turbo=${s.turbo}`,
  );
};

await sample("normal");
await sample("normal");
// Turbo batches many ticks per command buffer — the ceiling of the GPU economy.
await page
  .locator(`${SHELL} input[type=checkbox]`)
  .first()
  .check()
  .catch(() => {});
await sample("turbo");
await sample("turbo");
await page.screenshot({ path: "/tmp/openfront-run/gpu-economy.png" });
await browser.close();
