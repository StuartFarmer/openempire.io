import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector("game-shell-page")?.textContent?.includes("week "), { timeout: 60000 });
await page.waitForTimeout(3500);
await page.selectOption("game-shell-page select >> nth=0", "conquest");
await page.waitForTimeout(3500);
const st = () => page.evaluate(() => { const e=document.querySelector("game-shell-page"); return { ok:e?.derivedOk, sys:e?.systemId, tool:e?.tool }; });
console.log("conquest:", JSON.stringify(await st()));
// brush tool + paint spawns on land (mid-map).
await page.click('game-shell-page button:has-text("brush")');
const box = await page.locator("#shell-canvas").boundingBox();
const owned = () => page.evaluate(() => { const s=document.querySelector("game-shell-page")?.scalarReadout?.tilesOwned; return Array.isArray(s)?s.map(v=>Math.round(v)):s; });
// spawnP1 default brush at a few land spots
for (const [fx,fy] of [[0.32,0.42],[0.55,0.4],[0.5,0.6],[0.68,0.5]]) {
  await page.mouse.click(box.x+box.width*fx, box.y+box.height*fy);
  await page.waitForTimeout(120);
}
console.log("owned after paint:", await owned());
// switch to conquest overlay view + play
await page.selectOption("game-shell-page select >> nth=2", "game:conquest");
await page.waitForTimeout(300);
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(8000);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(500);
console.log("owned after run:", await owned());
await page.screenshot({ path: "/tmp/openfront-run/conquest.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
