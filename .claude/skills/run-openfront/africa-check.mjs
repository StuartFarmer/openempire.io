import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const t = document.querySelector("game-shell-page")?.textContent ?? "";
    return (
      t.includes("zoom") &&
      !t.includes("Loading") &&
      !t.includes("Deriving") &&
      !/zoom 1×/.test(t)
    );
  },
  { timeout: 180000 },
);
await page.waitForTimeout(600);
await page.evaluate(() => {
  document.querySelector("game-shell-page").camera = {
    cx: 2253,
    cy: 850,
    scale: 0.9,
  };
});
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/openfront-run/africa.png" });
console.log("done");
await browser.close();
