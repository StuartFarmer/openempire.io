import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const el = document.querySelector("game-shell-page");
    return el && (el.textContent ?? "").includes("week ");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(3000);

// Select OpenFront-live (system picker = first select). Its onchange applies
// the system's defaultMap (Verdantia), so wait for the sim to build.
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForTimeout(6000);

// Ground truth from the in-process sim (TS `private` fields are plain JS props).
const simState = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const gr = el?.gameRunner;
    if (!gr) return { hasRunner: false };
    const g = gr.game;
    const buf = g.map().tileStateBuffer();
    let owned = 0;
    const ids = new Set();
    for (let i = 0; i < buf.length; i++) {
      const o = buf[i] & 0xfff;
      if (o !== 0) {
        owned++;
        ids.add(o);
      }
    }
    return {
      hasRunner: true,
      ticks: g.ticks(),
      inSpawnPhase: g.inSpawnPhase(),
      numPlayers: g.players().length,
      ownedTiles: owned,
      distinctOwners: ids.size,
      tickReadout: el.tickReadout,
    };
  });

console.log("before Play:", await simState());
await page.screenshot({ path: "/tmp/openfront-run/openfront-live-start.png" });

await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(10000);
console.log("mid run:", await simState());
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(600);
const end = await simState();
console.log("after run:", end);
await page.screenshot({ path: "/tmp/openfront-run/openfront-live-run.png" });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
