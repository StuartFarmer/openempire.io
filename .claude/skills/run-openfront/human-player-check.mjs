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
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
// Let the sim build + bots place spawns.
await page.waitForTimeout(6000);

const me = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el?.gameRunner?.game;
    if (!g) return { hasRunner: false };
    const p = g.playerByClientID(el.myClientID);
    return {
      inSpawnPhase: g.inSpawnPhase(),
      ticks: g.ticks(),
      tool: el.tool,
      myTiles: p ? p.numTilesOwned() : null,
      myTroops: p ? Math.round(p.troops()) : null,
      myStats: el.myStats,
    };
  });

// Project a chosen land tile near the camera center to client px, then click it.
async function clickLandNearCenter() {
  const pt = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner.game;
    const w = g.width(),
      h = g.height();
    const cam = el.camera;
    // Search outward from the camera center for a land tile.
    const cx = Math.floor(cam.cx),
      cy = Math.floor(cam.cy);
    let found = null;
    for (let r = 0; r < 80 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (g.isLand(g.ref(x, y))) found = { x, y };
        }
      }
    }
    if (!found) return null;
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = found.x + 0.5,
      my = found.y + 0.5;
    const fbx = (mx - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (my - cam.cy) * cam.scale + canvas.height / 2;
    return {
      x: rect.left + fbx / dpr,
      y: rect.top + fby / dpr,
      tile: found,
    };
  });
  if (!pt) throw new Error("no land tile found near center");
  await page.mouse.click(pt.x, pt.y);
  return pt.tile;
}

// Click a tile the human can actually attack (unowned/enemy on our border).
async function clickAttackableTile() {
  const pt = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner.game;
    const p = g.playerByClientID(el.myClientID);
    if (!p) return null;
    let target = null;
    for (const b of p.borderTiles()) {
      const bx = g.x(b),
        by = g.y(b);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = bx + dx,
          y = by + dy;
        if (x < 0 || y < 0 || x >= g.width() || y >= g.height()) continue;
        const t = g.ref(x, y);
        if (p.canAttack(t)) {
          target = { x, y };
          break;
        }
      }
      if (target) break;
    }
    if (!target) return null;
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cam = el.camera;
    const mx = target.x + 0.5,
      my = target.y + 0.5;
    const fbx = (mx - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (my - cam.cy) * cam.scale + canvas.height / 2;
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr, tile: target };
  });
  if (!pt) return null;
  await page.mouse.click(pt.x, pt.y);
  return pt.tile;
}

console.log("before spawn:", await me());
const spawnTile = await clickLandNearCenter();
console.log("clicked spawn tile:", spawnTile);
await page.waitForTimeout(2500);
console.log("after spawn:", await me());
await page.screenshot({ path: "/tmp/openfront-run/human-spawned.png" });

// Expand: attack an attackable border tile a few times.
for (let i = 0; i < 8; i++) {
  const t = await clickAttackableTile();
  if (i === 0) console.log("first attack target:", t);
  await page.waitForTimeout(1200);
}
console.log("after expand clicks:", await me());
await page.waitForTimeout(3000);
console.log("later:", await me());
const labelInfo = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("#shell-labels > div")];
  const el = document.querySelector("game-shell-page");
  return {
    count: labels.length,
    sample: labels.slice(0, 4).map((l) => l.textContent),
    mine:
      labels.find((l) => l.style.color.includes("253"))?.textContent ?? null,
    hover: el.hoverRows ? null : "n/a",
  };
});
console.log("labels:", labelInfo);
await page.screenshot({ path: "/tmp/openfront-run/human-expanded.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
