import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const e = document.querySelector("game-shell-page");
    return e && (e.textContent ?? "").includes("week ");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(3000);
const cam = () =>
  page.evaluate(() => document.querySelector("game-shell-page")?.camera);
const herd = () =>
  page.evaluate(() => {
    const s =
      document.querySelector("game-shell-page")?.scalarReadout?.totalHerd;
    return typeof s === "number" ? Math.round(s) : s;
  });

// Select a SIM system (grazing).
await page.selectOption("game-shell-page select >> nth=0", "grazing");
await page.waitForTimeout(2500);
const box = await page.locator("#shell-canvas").boundingBox();

// DRAG → should PAN (camera moves).
const c0 = await cam();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35, {
  steps: 8,
});
await page.mouse.up();
const c1 = await cam();
console.log(
  "grazing DRAG panned:",
  JSON.stringify(c0) !== JSON.stringify(c1),
  c0,
  "→",
  c1,
);

// CLICK (no drag) → should STAMP the brush (herd grows after a run).
console.log("herd before click:", await herd());
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(3000);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(500);
console.log("herd after click+run:", await herd());

// terrain still pans.
await page.selectOption("game-shell-page select >> nth=0", "terrain");
await page.waitForTimeout(3000);
const t0 = await cam();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45, {
  steps: 6,
});
await page.mouse.up();
const t1 = await cam();
console.log("terrain DRAG panned:", JSON.stringify(t0) !== JSON.stringify(t1));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
