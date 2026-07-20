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
await page.waitForTimeout(3500);
// Switch to grazing (system picker = first select).
await page.selectOption("game-shell-page select >> nth=0", "grazing");
await page.waitForTimeout(2500);
const herd = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return el?.scalarReadout?.totalHerd ?? -1;
  });
console.log("herd before paint:", await herd());
// Paint several dabs across the canvas (camera-transformed brush).
const box = await page.locator("#shell-canvas").boundingBox();
for (const [fx, fy] of [
  [0.4, 0.4],
  [0.5, 0.45],
  [0.6, 0.5],
  [0.45, 0.55],
  [0.55, 0.6],
]) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(3500);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(800);
console.log("herd after paint+run:", await herd());
await page.screenshot({ path: "/tmp/openfront-run/shell-brush.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
