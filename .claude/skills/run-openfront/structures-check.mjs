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
  () => !!document.querySelector("game-shell-page")?.gameRunner,
  { timeout: 30000 },
);
await page.waitForTimeout(4000);

async function clickTile(pick) {
  const pt = await page.evaluate((pick) => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner?.game;
    if (!g) return null;
    const p = g.playerByClientID(el.myClientID);
    const cam = el.camera;
    let target = null;
    if (pick === "landCenter") {
      const cx = Math.floor(cam.cx),
        cy = Math.floor(cam.cy);
      for (let r = 0; r < 80 && !target; r++)
        for (let dy = -r; dy <= r && !target; dy++)
          for (let dx = -r; dx <= r && !target; dx++) {
            const x = cx + dx,
              y = cy + dy;
            if (x < 0 || y < 0 || x >= g.width() || y >= g.height()) continue;
            if (g.isLand(g.ref(x, y))) target = { x, y };
          }
    } else if (pick === "attack" && p) {
      for (const b of p.borderTiles()) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = g.x(b) + dx,
            y = g.y(b) + dy;
          if (x < 0 || y < 0 || x >= g.width() || y >= g.height()) continue;
          if (p.canAttack(g.ref(x, y))) target = { x, y };
          if (target) break;
        }
        if (target) break;
      }
    } else if (pick.startsWith("build:") && p) {
      const type = pick.slice(6);
      for (const t of p.tiles())
        if (p.canBuild(type, t) !== false) {
          target = { x: g.x(t), y: g.y(t) };
          break;
        }
    }
    if (!target) return null;
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fbx = (target.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (target.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
  }, pick);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

// Spawn + expand.
await clickTile("landCenter");
await page.waitForTimeout(1500);
for (let i = 0; i < 8; i++) {
  await clickTile("attack");
  await page.waitForTimeout(300);
}

// Grant seeds and build a settlement + several farmland plots.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const p = el.gameRunner.game.playerByClientID(el.myClientID);
  p._settlementSeeds = 4;
  p._farmSeeds = 8;
});
await page.click('game-shell-page button:has-text("Settlement")');
await clickTile("build:Settlement");
await page.waitForTimeout(800);
await page.click('game-shell-page button:has-text("Farmland")');
for (let i = 0; i < 6; i++) {
  await clickTile("build:Farmland");
  await page.waitForTimeout(500);
}

// Grow the economy (turbo) so the urban density field spreads.
await page.evaluate(
  () => (document.querySelector("game-shell-page").turbo = true),
);
await page.waitForTimeout(9000);
await page.evaluate(
  () => (document.querySelector("game-shell-page").turbo = false),
);

const stats = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const g = el.gameRunner.game;
  const p = g.playerByClientID(el.myClientID);
  const count = (a, pred) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (pred(a[i])) n++;
    return n;
  };
  const plot = el.plotU32,
    dens = el.densityU32;
  let maxDensity = 0;
  for (let i = 0; i < dens.length; i++)
    if (dens[i] > maxDensity) maxDensity = dens[i];
  return {
    settlements: p.units("Settlement").length,
    farmlands: p.units("Farmland").length,
    plotSettlementTiles: count(plot, (v) => v === 1),
    plotFarmlandTiles: count(plot, (v) => v === 2),
    densityTiles: count(dens, (v) => v > 0),
    maxDensity,
  };
});

// Zoom in on the human's core to see the fills.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const p = el.gameRunner.game.playerByClientID(el.myClientID);
  const g = el.gameRunner.game;
  const anchor = p.core() ?? [...p.tiles()][0];
  el.camera = { cx: g.x(anchor) + 0.5, cy: g.y(anchor) + 0.5, scale: 20 };
});
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/openfront-run/structures.png" });
console.log("structures:", stats);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
