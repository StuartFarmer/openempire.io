// Zoom onto the Great Lakes + Great Salt Lake + a winter snow-line frame.
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
const goTo = async (cx, cy, scale) => {
  await page.evaluate(
    ([cx, cy, scale]) => {
      document.querySelector("game-shell-page").camera = { cx, cy, scale };
    },
    [cx, cy, scale],
  );
  await page.waitForTimeout(500);
};
// Great Lakes: lon -84 lat 45 → x=1092 y=512 on 4096x2048.
await goTo(1092, 512, 3.0);
await page.screenshot({ path: "/tmp/openfront-run/lakes-great.png" });
// Great Salt Lake + west US: lon -112.5 lat 41 → x=768 y=557.
await goTo(768, 557, 3.5);
await page.screenshot({ path: "/tmp/openfront-run/lakes-saltlake.png" });
// Northern Europe/Russia snow gradient band: lon 40 lat 62 → x=2503 y=318.
await goTo(2503, 318, 2.0);
await page.screenshot({ path: "/tmp/openfront-run/lakes-snowline.png" });
console.log("done");
await browser.close();
