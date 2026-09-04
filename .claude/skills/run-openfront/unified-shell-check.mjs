import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
// Wait for terrain derivation (zoom fits → not 1×).
await page.waitForFunction(
  () => {
    const el = document.querySelector("game-shell-page");
    return el && (el.textContent ?? "").includes("week ");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(4000);
const st = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return {
      status: el?.status,
      note: el?.derivedNote,
      ok: el?.derivedOk,
      zoom: el?.zoomReadout,
      sys: el?.systemId,
    };
  });
console.log("terrain:", JSON.stringify(await st()));
await page.screenshot({ path: "/tmp/openfront-run/unified-1-terrain.png" });

// Switch to a sim system (grazing) via the first select (system picker).
await page.selectOption("game-shell-page select >> nth=0", "grazing");
await page.waitForTimeout(3000);
console.log("grazing:", JSON.stringify(await st()));
// Paint with a brush if available: choose brush select (last select) and click.
const box = await page.locator("#shell-canvas").boundingBox();
// Play a bit
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/openfront-run/unified-2-grazing.png" });
console.log("grazing after run:", JSON.stringify(await st()));

// Back to terrain.
await page.selectOption("game-shell-page select >> nth=0", "terrain");
await page.waitForTimeout(3500);
console.log("back to terrain:", JSON.stringify(await st()));
await page.screenshot({
  path: "/tmp/openfront-run/unified-3-terrain-again.png",
});

console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
await browser.close();
