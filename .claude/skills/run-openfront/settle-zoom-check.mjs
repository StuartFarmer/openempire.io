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
await page.waitForTimeout(2500);

// 1. Nation landing sites visible during spawn selection?
const spawnPhase = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const c = document.querySelector("#shell-labels");
  return {
    inSpawn: el.inSpawn,
    nationSpawnsReceived: el.nationSpawns?.length ?? 0,
    markersOnScreen: c ? c.children.length : -1,
    sample: c ? [...c.children].slice(0, 4).map(e => e.textContent) : [],
    camera: { scale: Number(el.camera.scale.toFixed(2)) },
  };
});
console.log("SPAWN PHASE:", JSON.stringify(spawnPhase));
await page.screenshot({ path: "/tmp/openfront-run/spawn-markers.png" });

// 2. Settle → camera should fly to 20x centred on the spawn.
const spawnAt = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth, H = el.mapHeight;
  const cx = Math.floor(el.camera.cx), cy = Math.floor(el.camera.cy);
  for (let r = 0; r < 120; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (el.fertilityPlane?.[y * W + x] > 0) { el.onTileGesture(x, y, {}); return { x, y }; }
      }
  return null;
});
const zoomTrack = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(150);
  zoomTrack.push(await page.evaluate(() => Number(document.querySelector("game-shell-page").camera.scale.toFixed(2))));
}
console.log("zoom during fly-in:", zoomTrack.join(" → "));
await page.waitForTimeout(2500);
const after = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const c = document.querySelector("#shell-labels");
  return {
    inSpawn: el.inSpawn,
    scale: Number(el.camera.scale.toFixed(2)),
    cam: { cx: Math.round(el.camera.cx), cy: Math.round(el.camera.cy) },
    tweenDone: el.cameraTween === null,
    markersCleared: c ? c.children.length : -1,
  };
});
console.log("clicked spawn tile:", JSON.stringify(spawnAt));
console.log("AFTER settle:", JSON.stringify(after));
await page.screenshot({ path: "/tmp/openfront-run/settled-20x.png" });
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
