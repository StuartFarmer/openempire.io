import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/tmp/openfront-run", { recursive: true });

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
// Wait until loading status clears (kernel built, map uploaded, init ran).
await page.waitForFunction(
  () => {
    const el = document.querySelector("field-lab-page");
    if (!el) return false;
    const text = el.textContent ?? "";
    return text.includes("tick ") && !text.includes("Loading…");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(1000);

const labText = () =>
  page.evaluate(() =>
    (document.querySelector("field-lab-page")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .match(/tick \d+[^F]*/)?.[0]
      ?.slice(0, 140),
  );

// Initial state: grass view seeded from the crop plane.
await page.selectOption("field-lab-page select >> nth=2", "grass");
await page.waitForTimeout(400);
await page
  .locator("#lab-canvas")
  .screenshot({ path: "/tmp/openfront-run/lab-1-grass-init.png" });

// Paint herd seeds at several points on the map.
const canvas = page.locator("#lab-canvas");
const box = await canvas.boundingBox();
await page.selectOption("field-lab-page select >> nth=2", "herds");
for (const [fx, fy] of [
  [0.3, 0.35],
  [0.55, 0.3],
  [0.45, 0.6],
  [0.68, 0.55],
  [0.35, 0.75],
]) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(100);
}
await page.waitForTimeout(300);
await canvas.screenshot({ path: "/tmp/openfront-run/lab-2-herds-painted.png" });
console.log("after paint:", await labText());

// Crank tick rate and run.
await page.locator("field-lab-page input[type=range]").first().fill("240");
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(6000);
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForTimeout(600);
console.log("after run:", await labText());
await canvas.screenshot({ path: "/tmp/openfront-run/lab-3-herds-spread.png" });

await page.selectOption("field-lab-page select >> nth=2", "grass");
await page.waitForTimeout(400);
await canvas.screenshot({ path: "/tmp/openfront-run/lab-4-grass-grazed.png" });

await page.screenshot({ path: "/tmp/openfront-run/lab-page.png" });
console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
