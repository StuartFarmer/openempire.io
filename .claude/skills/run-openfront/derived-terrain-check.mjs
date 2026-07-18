// Verify export-primary-fields task 4/5: runtime terrain derivation in #shell.
// - EarthXL loads, derivation succeeds (no "baked terrain" fallback status)
// - derived terrain renders; latitudeEffect slider recolors live
// - temperature view sweeps with the season
// - Verdantia derived terrain for the parity check vs its baked colors
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

const waitLoaded = () =>
  page.waitForFunction(
    () => {
      const text = document.querySelector("game-shell-page")?.textContent ?? "";
      return (
        text.includes("zoom") &&
        !text.includes("Loading") &&
        !text.includes("Deriving") &&
        !/zoom 1×/.test(text)
      );
    },
    { timeout: 180000 },
  );

const shellText = () =>
  page.evaluate(
    () => document.querySelector("game-shell-page")?.textContent ?? "",
  );

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await waitLoaded();
await page.waitForTimeout(800);

let text = await shellText();
const earthxlDerived = !text.includes("baked terrain");
console.log(`EarthXL derived: ${earthxlDerived}`);
if (!earthxlDerived) console.log(`  status: ${text.slice(0, 300)}`);
await page.screenshot({
  path: "/tmp/openfront-run/derived-1-earthxl-terrain.png",
});

// Climate panel: slam latitudeEffect and confirm a live recolor.
await page.click("game-shell-page button:has-text('climate')");
await page.waitForTimeout(300);
const latSlider = page.locator(
  "game-shell-page label:has-text('latitudeEffect') input",
);
await latSlider.evaluate((el) => {
  el.value = "1.5";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(800);
await page.screenshot({
  path: "/tmp/openfront-run/derived-2-earthxl-latitude-max.png",
});
await latSlider.evaluate((el) => {
  el.value = "0.72";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(500);

// Temperature view: seasonal sweep — capture two moments half a year apart
// (yearTicks 520 at 10tps = 52s/year; crank tilt instead and compare frames).
await page.locator("game-shell-page select").nth(1).selectOption("temperature");
await page.waitForTimeout(1000);
await page.screenshot({ path: "/tmp/openfront-run/derived-3-temp-a.png" });
await page.waitForTimeout(6000);
await page.screenshot({ path: "/tmp/openfront-run/derived-4-temp-b.png" });

// Back to terrain; switch to Verdantia for the parity check.
await page.locator("game-shell-page select").nth(1).selectOption("terrain");
await page.locator("game-shell-page select").nth(0).selectOption("Verdantia");
await waitLoaded();
await page.waitForTimeout(800);
text = await shellText();
console.log(`Verdantia derived: ${!text.includes("baked terrain")}`);
await page.screenshot({
  path: "/tmp/openfront-run/derived-5-verdantia-terrain.png",
});

// Zoom into a coast to inspect for halos/quantization artifacts.
const canvas = page.locator("#shell-canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
for (let i = 0; i < 10; i += 1) {
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(500);
await page.screenshot({
  path: "/tmp/openfront-run/derived-6-verdantia-coast.png",
});

// Retrofit map: MajorMenor derived terrain (reconstructed elevation path).
for (let i = 0; i < 10; i += 1) {
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(40);
}
await page.locator("game-shell-page select").nth(0).selectOption("MajorMenor");
await waitLoaded();
await page.waitForTimeout(800);
text = await shellText();
console.log(`MajorMenor derived: ${!text.includes("baked terrain")}`);
await page.screenshot({
  path: "/tmp/openfront-run/derived-8-majormenor-terrain.png",
});

const relevant = errors.filter((e) => !e.includes("inSpawnPhase"));
console.log(
  relevant.length ? `ERRORS:\n${relevant.join("\n")}` : "no page errors",
);
await browser.close();
