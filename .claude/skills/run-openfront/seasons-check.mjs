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

// --- Lab: fast year on the World system ---
await page.goto("http://localhost:9000/#lab", { waitUntil: "load" });
await page.waitForFunction(
  () =>
    (document.querySelector("field-lab-page")?.textContent ?? "").includes(
      "tick ",
    ),
  { timeout: 60000 },
);
await page.waitForTimeout(800);
// World is the default (first) system; speed the clock and shrink the year.
const ranges = page.locator("field-lab-page input[type=range]");
await ranges.nth(0).fill("60"); // game clock 60 tps
await ranges.nth(2).fill("240"); // yearTicks = 240 → 4s per year
await page.click('field-lab-page button:has-text("Play")');

const tickOf = async () =>
  Number(
    await page.evaluate(
      () =>
        (document.querySelector("field-lab-page")?.textContent ?? "").match(
          /tick (\d+)/,
        )?.[1] ?? "0",
    ),
  );
const waitTick = async (t) => {
  await page.waitForFunction(
    (target) =>
      Number(
        (document.querySelector("field-lab-page")?.textContent ?? "").match(
          /tick (\d+)/,
        )?.[1] ?? "0",
      ) >= target,
    t,
    { timeout: 60000 },
  );
};

await waitTick(55); // ~quarter year: northern summer
await page
  .locator("#lab-canvas")
  .screenshot({ path: "/tmp/openfront-run/season-summer.png" });
console.log("summer at tick", await tickOf());
await waitTick(175); // ~three-quarter year: northern winter
await page
  .locator("#lab-canvas")
  .screenshot({ path: "/tmp/openfront-run/season-winter.png" });
console.log("winter at tick", await tickOf());
await page.click('field-lab-page button:has-text("Pause")');

// --- Shell: live view on EarthXL ---
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const t = document.querySelector("game-shell-page")?.textContent ?? "";
    return t.includes("zoom") && !t.includes("Loading") && !/zoom 1×/.test(t);
  },
  { timeout: 120000 },
);
await page.waitForTimeout(3000);
const shellText = await page.evaluate(
  () =>
    (document.querySelector("game-shell-page")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .match(/week \d+.*?zoom [\d.]+×/)?.[0],
);
console.log("shell:", shellText);
await page.screenshot({ path: "/tmp/openfront-run/shell-live.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
