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
await page.waitForTimeout(2500);
await page.evaluate(() => { const el = document.querySelector("game-shell-page"); el.turbo = true; if (!el.running) el.toggleRunning(); else el.setTurbo(true); });
await page.waitForTimeout(6000);
await page.evaluate(() => { const el = document.querySelector("game-shell-page"); el.turbo = false; el.setTurbo(false); });
await page.waitForTimeout(1000);

// 1. Name labels gone?
const labels = await page.evaluate(() => {
  const c = document.querySelector("#shell-labels");
  return { children: c ? c.children.length : -1,
           texts: c ? [...c.children].map(e => e.textContent).slice(0, 6) : [] };
});
console.log("shell-labels children (before hover):", labels.children, JSON.stringify(labels.texts));

// 2. Center the camera on our own land, screenshot the mask.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth, own = el.ownerScratch, me = el.mySmallID;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < own.length; i++) if (own[i] === me) { sx += i % W; sy += (i / W) | 0; n++; }
  if (n) el.camera = { cx: sx / n, cy: sy / n, scale: 6 };
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/openfront-run/mask.png" });

// 3. Hover a foreign nation's tile → chip should appear with name · number.
const hover = await page.evaluate(async () => {
  const el = document.querySelector("game-shell-page");
  const W = el.mapWidth, own = el.ownerScratch, me = el.mySmallID;
  const canvas = document.querySelector("#shell-canvas");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cam = el.camera;
  // Find a foreign-owned tile currently on screen.
  for (let i = 0; i < own.length; i++) {
    const o = own[i];
    if (o === 0 || o === me) continue;
    const x = i % W, y = (i / W) | 0;
    const fx = (x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
    const fy = (y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
    const cxp = rect.left + fx / dpr, cyp = rect.top + fy / dpr;
    const mx = rect.left + rect.width / 2, my = rect.top + rect.height / 2;
    if (Math.abs(cxp - mx) < rect.width * 0.25 && Math.abs(cyp - my) < rect.height * 0.25) {
      const hit = document.elementFromPoint(cxp, cyp);
      if (hit && (hit.id === "game-input-overlay" || hit.id === "shell-canvas" || hit.tagName === "CANVAS")) {
        return { ok: true, clientX: cxp, clientY: cyp, owner: o, name: el.playerName.get(o), hit: hit.id || hit.tagName };
      }
    }
  }
  return { ok: false };
});
console.log("foreign tile on screen:", JSON.stringify(hover));
if (hover.ok) {
  await page.mouse.move(hover.clientX, hover.clientY);
  await page.waitForTimeout(600);
  const chip = await page.evaluate(() => {
    const c = document.querySelector("#shell-labels");
    const els = c ? [...c.children] : [];
    return els.map(e => ({ text: e.textContent, cls: e.className, left: e.style.left, top: e.style.top }));
  });
  console.log("after hovering a foreign nation:", JSON.stringify(chip, null, 1));
  console.log("hover state:", JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return { hoverTile: el.hoverTile, hoverClient: el.hoverClient, mySmallID: el.mySmallID,
             ownerAtHover: el.hoverTile ? el.ownerScratch[el.hoverTile.y*el.mapWidth+el.hoverTile.x] : null,
             inSpawn: el.inSpawn, isOpenfront: el.systemId };
  })));
  await page.screenshot({ path: "/tmp/openfront-run/hover-chip.png" });
  // And hovering our OWN land should show nothing.
  const mine = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const W = el.mapWidth, own = el.ownerScratch, me = el.mySmallID;
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; const cam = el.camera;
    for (let i = 0; i < own.length; i++) {
      if (own[i] !== me) continue;
      const x = i % W, y = (i / W) | 0;
      const cxp = rect.left + ((x + 0.5 - cam.cx) * cam.scale + canvas.width / 2) / dpr;
      const cyp = rect.top + ((y + 0.5 - cam.cy) * cam.scale + canvas.height / 2) / dpr;
      if (cxp > rect.left + 20 && cxp < rect.right - 20 && cyp > rect.top + 20 && cyp < rect.bottom - 20)
        return { ok: true, clientX: cxp, clientY: cyp };
    }
    return { ok: false };
  });
  if (mine.ok) {
    await page.mouse.move(mine.clientX, mine.clientY);
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => (document.querySelector("#shell-labels")?.children.length ?? -1));
    console.log("chips while hovering OUR OWN land (want 0):", n);
  }
}
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
