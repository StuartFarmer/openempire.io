// Verify the rework-persistent-tiles-and-burn renderer changes load and run:
// the WESL (openfront.wesl empty-lot + scorch) and density.frag.glsl compile,
// and a running openfront game (bots conquering each other → burns) renders
// without shader/page errors. Screenshots a mid-battle frame.
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
const console_errs = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") console_errs.push(m.text());
});

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const el = document.querySelector("game-shell-page");
    return el && (el.textContent ?? "").includes("week ");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(3000);

// Select the real food-economy game (openfront system).
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForTimeout(3000);

// Start the game; bots spawn and fight → tiles get conquered and burn.
await page.click('game-shell-page button:has-text("Play")');
// Let the battle run so conquests (and their 5s fires) accumulate.
await page.waitForTimeout(20000);
await page.screenshot({ path: "/tmp/openfront-run/burn-persist-mid.png" });
await page.waitForTimeout(8000);
await page.screenshot({ path: "/tmp/openfront-run/burn-persist-late.png" });

const canvasOk = await page.evaluate(() => {
  const c = document.querySelector("#shell-canvas");
  return !!c && c.width > 0 && c.height > 0;
});
console.log("canvas ok:", canvasOk);
console.log("page errors:", errors.length ? errors : "none");
console.log(
  "console errors:",
  console_errs.length ? console_errs.slice(0, 10) : "none",
);
await browser.close();
