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
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("tick ") && !t.includes("Loading…");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(800);

// System = settlement, map = Earth (real ingest soil/climate).
await page.selectOption("field-lab-page select >> nth=0", "settlement");
await page.selectOption("field-lab-page select >> nth=1", "Earth");
await page.waitForFunction(
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("totalPop") && !t.includes("Loading…");
  },
  { timeout: 90000 },
);
await page.waitForTimeout(800);

const scalars = () =>
  page.evaluate(() => {
    const t = (
      document.querySelector("field-lab-page")?.textContent ?? ""
    ).replace(/\s+/g, " ");
    return (
      t
        .match(
          /tick \d+.*?(peakPop|totalPop)[^A-Za-z]*[\d.]+.*?crops[^A-Za-z]*[\d.]+/i,
        )?.[0]
        ?.slice(0, 160) ?? t.match(/tick \d+[^]{0,140}/)?.[0]
    );
  });
const canvas = page.locator("#lab-canvas");

await page.selectOption("field-lab-page select >> nth=2", "life");
await page.waitForTimeout(400);
await canvas.screenshot({ path: "/tmp/openfront-run/settle-1-init.png" });
console.log("init:", await scalars());

// Turbo run — many years so seasons cycle and settlement establishes.
await page.check("field-lab-page input[type=checkbox]");
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(12000);
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForTimeout(500);
console.log("after run:", await scalars());

for (const view of [
  "life",
  "crops",
  "population",
  "food",
  "growingDegreeDays",
]) {
  await page.selectOption("field-lab-page select >> nth=2", view);
  await page.waitForTimeout(400);
  await canvas.screenshot({ path: `/tmp/openfront-run/settle-${view}.png` });
}
console.log(
  errors.length ? "ERRORS:\n" + errors.slice(0, 8).join("\n") : "no errors",
);
await browser.close();
