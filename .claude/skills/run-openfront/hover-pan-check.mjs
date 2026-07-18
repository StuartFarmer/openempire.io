import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

async function hoverTile(el) {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel);
    return e?.hoverTile ?? null;
  }, el);
}

// --- #lab: hover + drag-to-pan ---
await page.goto("http://localhost:9000/#lab", { waitUntil: "load" });
await page.waitForFunction(() => {
  const e = document.querySelector("field-lab-page");
  return e && (e.textContent ?? "").includes("tick ") && !(e.textContent ?? "").includes("Loading…");
}, { timeout: 60000 });
await page.waitForTimeout(1500);
const labBox = await page.locator("#lab-canvas").boundingBox();
await page.mouse.move(labBox.x + labBox.width*0.5, labBox.y + labBox.height*0.5);
await page.waitForTimeout(200);
console.log("lab hoverTile:", JSON.stringify(await hoverTile("field-lab-page")));
// drag to pan (shift held = always pan)
const camBefore = await page.evaluate(() => document.querySelector("field-lab-page")?.camera);
await page.keyboard.down("Shift");
await page.mouse.move(labBox.x + labBox.width*0.5, labBox.y + labBox.height*0.5);
await page.mouse.down();
await page.mouse.move(labBox.x + labBox.width*0.3, labBox.y + labBox.height*0.4, { steps: 5 });
await page.mouse.up();
await page.keyboard.up("Shift");
const camAfter = await page.evaluate(() => document.querySelector("field-lab-page")?.camera);
console.log("lab camera moved:", JSON.stringify(camBefore) !== JSON.stringify(camAfter), camBefore, "→", camAfter);
await page.locator("#lab-canvas").screenshot({ path: "/tmp/openfront-run/hover-lab.png" });

// --- #shell: hover ---
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => {
  const e = document.querySelector("game-shell-page");
  return e && (e.textContent ?? "").includes("week ");
}, { timeout: 60000 });
await page.waitForTimeout(3500);
const shBox = await page.locator("#shell-canvas").boundingBox();
await page.mouse.move(shBox.x + shBox.width*0.5, shBox.y + shBox.height*0.45);
await page.waitForTimeout(200);
console.log("shell hoverTile:", JSON.stringify(await hoverTile("game-shell-page")));
await page.screenshot({ path: "/tmp/openfront-run/hover-shell.png" });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
