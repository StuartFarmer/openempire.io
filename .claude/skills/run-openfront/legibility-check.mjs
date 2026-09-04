// Verify the 64-knob economy + legibility conduits in the WebGPU shell:
// spawn + expand a human game, then assert the supply conduit populates from
// the human's Core/Settlements, toggle the supplyOverlay param, and screenshot.
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
      starved: el.myStats?.starved,
      farmSeeds: el.myStats?.farmSeeds,
      settlementSeeds: el.myStats?.settlementSeeds,
      supplyTiles: cnt(el.supplyU32, (v) => v > 0),
      damageTiles: cnt(el.damageU32, (v) => v > 0),
      farmland: cnt(el.plotU32, (v) => v === 2),
      hasSupplyParam: (el.compiled?.paramList ?? []).some(
        (p) => p.name === "supplyOverlay",
      ),
    };
  });

await click("land");
await page.waitForTimeout(2000);
console.log("after spawn:", await snap());

for (let i = 0; i < 20; i++) {
  await click("border");
  await page.waitForTimeout(350);
}
await page.waitForTimeout(4000);
console.log("after expand:", await snap());

// Toggle the supply overlay param and screenshot the heatmap.
await page.evaluate(() =>
  document.querySelector("game-shell-page").updateParam("supplyOverlay", 1),
);
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/openfront-run/legibility-supply.png" });
console.log("supply overlay screenshot written");
console.log("errors:", errors.slice(0, 5));
await browser.close();
