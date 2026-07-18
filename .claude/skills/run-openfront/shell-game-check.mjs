import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => {
  const el = document.querySelector("game-shell-page");
  return el && (el.textContent ?? "").includes("week ");
}, { timeout: 60000 });
await page.waitForTimeout(3000);
// Select empire (system picker = first select).
await page.selectOption("game-shell-page select >> nth=0", "empire");
await page.waitForTimeout(3000);
const owned = () => page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const s = el?.scalarReadout?.tilesOwned;
  return Array.isArray(s) ? s.map(v => Math.round(v)) : s;
});
// Paint 4 capitals by clicking (default brush stamp under the camera).
const box = await page.locator("#shell-canvas").boundingBox();
for (const [fx, fy] of [[0.35,0.45],[0.55,0.4],[0.5,0.6],[0.62,0.55]]) {
  await page.mouse.click(box.x + box.width*fx, box.y + box.height*fy);
  await page.waitForTimeout(150);
}
console.log("owned after paint:", await owned());
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(6000);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(600);
console.log("owned after run:", await owned());
await page.screenshot({ path: "/tmp/openfront-run/shell-empire.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
