import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/tmp/openfront-run", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const text = document.querySelector("game-shell-page")?.textContent ?? "";
    // Loaded = status cleared AND camera fitted (zoom left its 1× default).
    return (
      text.includes("zoom") &&
      !text.includes("Loading") &&
      !/zoom 1×/.test(text)
    );
  },
  { timeout: 120000 },
);
await page.waitForTimeout(800);

const canvas = page.locator("#shell-canvas");
await page.screenshot({ path: "/tmp/openfront-run/shell-1-earthxl-fit.png" });

// Zoom in on Europe-ish (upper middle) with several wheel steps.
const box = await canvas.boundingBox();
const zx = box.x + box.width * 0.55;
const zy = box.y + box.height * 0.32;
await page.mouse.move(zx, zy);
for (let i = 0; i < 14; i += 1) {
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/openfront-run/shell-2-earthxl-zoom.png" });

// Drag-pan.
await page.mouse.move(zx, zy);
await page.mouse.down();
await page.mouse.move(zx - 500, zy + 250, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/openfront-run/shell-3-earthxl-pan.png" });

const zoomText = await page.evaluate(
  () =>
    (document.querySelector("game-shell-page")?.textContent ?? "").match(
      /zoom [\d.]+×/,
    )?.[0],
);
console.log("after zoom+pan:", zoomText);

// Switch to SPQR.
await page.selectOption("game-shell-page select", "SPQR");
await page.waitForFunction(
  () =>
    !(document.querySelector("game-shell-page")?.textContent ?? "").includes(
      "Loading",
    ),
  { timeout: 120000 },
);
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/openfront-run/shell-4-spqr.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
