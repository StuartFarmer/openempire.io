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
await page.waitForFunction(
  () =>
    (document.querySelector("field-lab-page")?.textContent ?? "").includes(
      "tick ",
    ),
  { timeout: 60000 },
);

// Switch to the territory system and wait for its compile.
await page.selectOption("field-lab-page select >> nth=0", "territory");
await page.waitForFunction(
  () => {
    const text = document.querySelector("field-lab-page")?.textContent ?? "";
    return text.includes("tilesOwned") && !text.includes("Loading…");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(800);

const text = () =>
  page.evaluate(() =>
    (document.querySelector("field-lab-page")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .match(/tick \d+.*?(?=System)/)?.[0]
      ?.slice(0, 220),
  );

// Paint the four spawns at spread-out land locations.
const canvas = page.locator("#lab-canvas");
const box = await canvas.boundingBox();
const spawns = [
  ["spawnP1", 0.25, 0.35],
  ["spawnP2", 0.7, 0.25],
  ["spawnP3", 0.5, 0.6],
  ["spawnP4", 0.25, 0.8],
];
for (const [brush, fx, fy] of spawns) {
  await page.selectOption("field-lab-page select >> nth=3", brush);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}
await canvas.screenshot({ path: "/tmp/openfront-run/territory-1-spawns.png" });
console.log("after spawns:", await text());

await page.check("field-lab-page input[type=checkbox]");
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(4000);
await canvas.screenshot({ path: "/tmp/openfront-run/territory-2-mid.png" });
console.log("mid:", await text());
await page.waitForTimeout(6000);
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForTimeout(700);
await canvas.screenshot({ path: "/tmp/openfront-run/territory-3-late.png" });
console.log("late:", await text());

// Battle heat view.
await page.selectOption("field-lab-page select >> nth=2", "battles");
await page.waitForTimeout(400);
await canvas.screenshot({ path: "/tmp/openfront-run/territory-4-battles.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
