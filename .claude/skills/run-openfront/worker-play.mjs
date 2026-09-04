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
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForFunction(
  () => (document.querySelector("game-shell-page")?.playerStat?.size ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(3000);

// Click a tile chosen from the main-thread buffers, projected to screen.
async function click(pick) {
  const pt = await page.evaluate((pick) => {
    const el = document.querySelector("game-shell-page");
    const W = el.mapWidth,
      H = el.mapHeight,
      cam = el.camera;
    const wm = el.hoverFields?.waterMask,
      own = el.ownerScratch,
      me = el.mySmallID;
    let f = null;
    if (pick === "land") {
      const cx = Math.floor(cam.cx),
        cy = Math.floor(cam.cy);
      for (let r = 0; r < 90 && !f; r++)
        for (let dy = -r; dy <= r && !f; dy++)
          for (let dx = -r; dx <= r && !f; dx++) {
            const x = cx + dx,
              y = cy + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            if (!wm || wm[y * W + x] !== 1) f = { x, y };
          }
    } else if (pick === "border") {
      // a non-mine tile adjacent to my territory (worker resolves attack/boat)
      for (let i = 0; i < own.length && !f; i++) {
        if (own[i] !== me) continue;
        const x = i % W,
          y = (i / W) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (own[ni] !== me && (!wm || wm[ni] !== 1)) {
            f = { x: nx, y: ny };
            break;
          }
        }
      }
    }
    if (!f) return null;
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fbx = (f.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (f.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
  }, pick);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

const snap = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const cnt = (a, p) => {
      if (!a) return 0;
      let n = 0;
      for (let i = 0; i < a.length; i++) if (p(a[i])) n++;
      return n;
    };
    return {
      tiles: el.myStats?.tiles,
      alive: el.myStats?.alive,
      foodShare: el.myStats?.foodShare,
      damageTiles: cnt(el.damageU32, (v) => v > 0),
      frontTiles: cnt(el.frontU32, (v) => v > 0),
      frontLabels: el.frontLabelsData?.length ?? 0,
      plotFarmland: cnt(el.plotU32, (v) => v === 2),
    };
  });

await click("land");
await page.waitForTimeout(2000);
console.log("after spawn:", await snap());

for (let i = 0; i < 14; i++) {
  await click("border");
  await page.waitForTimeout(400);
}
await page.waitForTimeout(3000);
console.log("after expand:", await snap());

// Food slider through the worker.
await page.evaluate(() =>
  document.querySelector("game-shell-page").setFoodShare(0.4),
);
await page.waitForTimeout(1500);
console.log("food share after set 0.4:", (await snap()).foodShare);

await page.screenshot({ path: "/tmp/openfront-run/worker-play.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
