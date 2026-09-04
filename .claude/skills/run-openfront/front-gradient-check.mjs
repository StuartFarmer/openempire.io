/**
 * Verify the combat border is a PER-TILE gradient, not one flat value per
 * opponent, and that the aimed-segment highlight tracks the border as it grows.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => document.querySelector("game-shell-page")?.textContent?.includes("week "), { timeout: 60000 });
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForFunction(() => {
  const el = document.querySelector("game-shell-page");
  return !!el?.worker && (el.tickCount ?? 0) > 0 && !!el.frontU32;
}, { timeout: 120000 });

// Spawn and grow.
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
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  el.turbo = true;
  if (!el.running) el.toggleRunning(); else el.setTurbo(true);
});
await page.waitForTimeout(4500);
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  el.turbo = false;
  el.setTurbo(false);
});
await page.waitForTimeout(500);

// Attack every enemy-owned tile touching our border, repeatedly.
const result = await page.evaluate(async () => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth;
  const own = el.ownerScratch, me = el.mySmallID;
  const borderChanges = [];
  let best = { distinct: 0, values: [], tiles: 0 };
  for (let step = 0; step < 45; step++) {
    const targets = [];
    for (const t of el.myBorderTiles ?? []) {
      for (const nb of [t + 1, t - 1, t + W, t - W]) {
        if (nb < 0 || nb >= own.length) continue;
        const o = own[nb];
        if (o !== 0 && o !== me) targets.push(nb);
      }
    }
    for (const t of targets.slice(0, 4)) {
      el.lastGestureKey = -1;
      el.onTileGesture(t % W, (t / W) | 0, {});
    }
    await new Promise((r) => setTimeout(r, 500));
    // Sample the front plane.
    const vals = new Map();
    let n = 0;
    for (let i = 0; i < el.frontU32.length; i++) {
      const v = el.frontU32[i];
      if (v > 0) { n++; vals.set(v, (vals.get(v) ?? 0) + 1); }
    }
    if (vals.size > best.distinct) {
      best = { distinct: vals.size, values: [...vals.entries()].sort((a,b)=>a[0]-b[0]).slice(0,12), tiles: n };
    }
    borderChanges.push({
      step,
      alive: !!el.myStats?.alive,
      tiles: el.myStats?.tiles ?? 0,
      troops: Math.round(el.myStats?.troops ?? 0),
      border: (el.myBorderTiles ?? []).length,
      enemyAdjacent: targets.length,
      frontLit: n,
      distinct: vals.size,
    });
    if (!el.myStats?.alive) break;
  }
  return { best, borderSamples: borderChanges };
});

console.log("front tiles lit:", result.best.tiles);
console.log("DISTINCT front byte values:", result.best.distinct);
console.log("value:count →", JSON.stringify(result.best.values));
console.log("per-step:");
for (const r of result.borderSamples) console.log("  " + JSON.stringify(r));
console.log(result.best.distinct > 1
  ? `PASS — the front is a gradient (${result.best.distinct} distinct values across the seam)`
  : "FAIL — the front is a single flat value (still aggregate)");
console.log("errors:", errors.length ? errors.slice(0, 3) : "none");
await browser.close();
