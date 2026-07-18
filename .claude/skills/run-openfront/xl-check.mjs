import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto("http://localhost:9000/#lab", { waitUntil: "load" });
await page.waitForFunction(
  () =>
    (document.querySelector("field-lab-page")?.textContent ?? "").includes(
      "tick ",
    ),
  { timeout: 60000 },
);
await page.selectOption("field-lab-page select >> nth=0", "territory");
await page.waitForFunction(
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("tilesOwned") && !t.includes("Loading…");
  },
  { timeout: 60000 },
);
await page.selectOption("field-lab-page select >> nth=1", "EarthXL");
await page.waitForFunction(
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("tilesOwned") && !t.includes("Loading…");
  },
  { timeout: 120000 },
);
await page.waitForTimeout(1000);

const status = () =>
  page.evaluate(() =>
    (document.querySelector("field-lab-page")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .match(/tick \d+.*?(?=System)/)?.[0]
      ?.slice(0, 160),
  );

// Paint a few spawns.
const canvas = page.locator("#lab-canvas");
const box = await canvas.boundingBox();
for (const [brush, fx, fy] of [
  ["spawnP1", 0.25, 0.4],
  ["spawnP2", 0.55, 0.35],
  ["spawnP3", 0.75, 0.55],
]) {
  await page.selectOption("field-lab-page select >> nth=3", brush);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(150);
}

// --- Fixed game clock (default 10 tps) ---
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(5000);
console.log("fixed clock 5s:", await status());
let t0 = Date.now();
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForFunction(() =>
  (document.querySelector("field-lab-page")?.textContent ?? "").includes(
    "Play",
  ),
);
console.log("pause latency (fixed):", Date.now() - t0, "ms");

// --- Turbo (adaptive batch) ---
await page.check("field-lab-page input[type=checkbox]");
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(8000);
console.log("turbo 8s:", await status());
t0 = Date.now();
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForFunction(() =>
  (document.querySelector("field-lab-page")?.textContent ?? "").includes(
    "Play",
  ),
);
console.log("pause latency (turbo):", Date.now() - t0, "ms");
await page.waitForTimeout(500);
console.log("final:", await status());
await canvas.screenshot({ path: "/tmp/openfront-run/xl-territory.png" });
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
