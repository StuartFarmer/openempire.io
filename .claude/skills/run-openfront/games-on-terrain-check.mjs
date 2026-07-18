import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => {
  const e = document.querySelector("game-shell-page");
  return e && (e.textContent ?? "").includes("week ");
}, { timeout: 60000 });
await page.waitForTimeout(3500);
const st = () => page.evaluate(() => {
  const e = document.querySelector("game-shell-page");
  return { ok: e?.derivedOk, sys: e?.systemId, showingGame: e?.showingGame, zoom: e?.zoomReadout };
});
console.log("terrain:", JSON.stringify(await st()));
await page.screenshot({ path: "/tmp/openfront-run/got-1-terrain.png" });

// Select empire (a game composed on terrain).
await page.selectOption("game-shell-page select >> nth=0", "empire");
await page.waitForTimeout(3500);
console.log("empire (terrain view):", JSON.stringify(await st()));
await page.screenshot({ path: "/tmp/openfront-run/got-2-empire-terrain.png" });

// Paint capitals (click), switch to the empire game view, play.
const box = await page.locator("#shell-canvas").boundingBox();
for (const [fx,fy] of [[0.4,0.45],[0.55,0.4],[0.5,0.6]]) {
  await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy);
  await page.waitForTimeout(120);
}
await page.selectOption("game-shell-page select >> nth=2", "game:empire");
await page.waitForTimeout(500);
console.log("empire (game view):", JSON.stringify(await st()));
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(5000);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(500);
const owned = await page.evaluate(() => {
  const s = document.querySelector("game-shell-page")?.scalarReadout?.tilesOwned;
  return Array.isArray(s) ? s.map(v=>Math.round(v)) : s;
});
console.log("empire tilesOwned:", owned);
await page.screenshot({ path: "/tmp/openfront-run/got-3-empire-game.png" });

// grazing
await page.selectOption("game-shell-page select >> nth=0", "grazing");
await page.waitForTimeout(3500);
console.log("grazing:", JSON.stringify(await st()));
await page.screenshot({ path: "/tmp/openfront-run/got-4-grazing.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
