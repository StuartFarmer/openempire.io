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
  () =>
    document.querySelector("game-shell-page")?.textContent?.includes("week "),
  { timeout: 60000 },
);
await page.waitForTimeout(3500);
await page.selectOption("game-shell-page select >> nth=0", "grazing");
await page.waitForTimeout(2500);
const cam = () =>
  page.evaluate(() => document.querySelector("game-shell-page")?.camera);
const tool = () =>
  page.evaluate(() => document.querySelector("game-shell-page")?.tool);
const herd = () =>
  page.evaluate(() => {
    const s =
      document.querySelector("game-shell-page")?.scalarReadout?.totalHerd;
    return typeof s === "number" ? Math.round(s) : s;
  });
const box = await page.locator("#shell-canvas").boundingBox();
const drag = async (fx0, fy0, fx1, fy1) => {
  await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, {
    steps: 8,
  });
  await page.mouse.up();
};
console.log("default tool:", await tool());
// Pan tool: drag should pan.
let c0 = await cam();
await drag(0.5, 0.5, 0.35, 0.4);
let c1 = await cam();
console.log("PAN tool drag panned:", JSON.stringify(c0) !== JSON.stringify(c1));
// Switch to brush tool.
await page.click('game-shell-page button:has-text("brush")');
console.log("tool after click brush:", await tool());
console.log("herd before brush-drag:", await herd());
c0 = await cam();
await drag(0.45, 0.45, 0.55, 0.55);
c1 = await cam();
// run to grow the painted herds
await page.click('game-shell-page button:has-text("Play")');
await page.waitForTimeout(2500);
await page.click('game-shell-page button:has-text("Pause")');
await page.waitForTimeout(400);
console.log(
  "BRUSH tool drag: camera moved?",
  JSON.stringify(c0) !== JSON.stringify(c1),
  "herd after:",
  await herd(),
);
// back to pan
await page.click('game-shell-page button:has-text("pan")');
c0 = await cam();
await drag(0.5, 0.5, 0.4, 0.45);
c1 = await cam();
console.log(
  "PAN again drag panned:",
  JSON.stringify(c0) !== JSON.stringify(c1),
);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
