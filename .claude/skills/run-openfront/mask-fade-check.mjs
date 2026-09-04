import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 300)); });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector("game-shell-page")?.textContent?.includes("week "), { timeout: 60000 });
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForFunction(() => {
  const el = document.querySelector("game-shell-page");
  return !!el?.worker && (el.tickCount ?? 0) > 0 && !!el.ownerScratch;
}, { timeout: 120000 });
await page.waitForTimeout(1500);

const pre = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  return { inSpawn: el.inSpawn, maskFade: el.paramValues.maskFade ?? 0, alive: el.myStats?.alive };
});
console.log("BEFORE settling:", JSON.stringify(pre));
await page.screenshot({ path: "/tmp/openfront-run/fade-0-before.png" });

// Settle.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth, H = el.mapHeight;
  const cx = Math.floor(el.camera.cx), cy = Math.floor(el.camera.cy);
  for (let r = 0; r < 120; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (el.fertilityPlane?.[y * W + x] > 0) { el.onTileGesture(x, y, {}); return; }
      }
});
// Sample the fade ramping.
const ramp = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(120);
  ramp.push(await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return Number((el.paramValues.maskFade ?? 0).toFixed(3));
  }));
}
console.log("maskFade ramp after settling:", ramp.join(" → "));
await page.waitForTimeout(2500);
console.log("AFTER settle:", JSON.stringify(await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  return { inSpawn: el.inSpawn, maskFade: Number((el.paramValues.maskFade ?? 0).toFixed(3)), alive: el.myStats?.alive };
})));

// Grow, then frame a foreign region so the borders under the mask are visible.
await page.evaluate(() => { const el = document.querySelector("game-shell-page"); el.turbo = true; if (!el.running) el.toggleRunning(); else el.setTurbo(true); });
await page.waitForTimeout(7000);
await page.evaluate(() => { const el = document.querySelector("game-shell-page"); el.turbo = false; el.setTurbo(false); });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth, own = el.ownerScratch, me = el.mySmallID;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < own.length; i++) if (own[i] === me) { sx += i % W; sy += (i / W) | 0; n++; }
  if (n) el.camera = { cx: sx / n, cy: sy / n, scale: 4 };
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/openfront-run/fade-1-after.png" });

// Sanity: hidden param must not appear as a slider.
const sliders = await page.evaluate(() =>
  [...document.querySelectorAll("game-shell-page label span[title]")].map(e => e.getAttribute("title")));
console.log("visible param sliders:", JSON.stringify(sliders));
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
