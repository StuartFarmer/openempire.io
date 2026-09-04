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

// Mount openfront and wait for the sim; the dev server may full-reload (external
// edits) and reset to terrain, so ensure it's mounted before each action.
async function ensureOpenfront() {
  const ok = await page.evaluate(
    () => document.querySelector("game-shell-page")?.systemId === "openfront",
  );
  if (ok) return;
  await page.waitForTimeout(2500);
  await page.selectOption("game-shell-page select >> nth=0", "openfront");
  await page.waitForFunction(
    () => !!document.querySelector("game-shell-page")?.gameRunner,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1500);
}

async function clickTile(pick) {
  const pt = await page.evaluate((pick) => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner?.game;
    if (!g) return null;
    const p = g.playerByClientID(el.myClientID);
    const w = g.width(),
      h = g.height(),
      cam = el.camera;
    let target = null;
    if (pick === "landCenter") {
      const cx = Math.floor(cam.cx),
        cy = Math.floor(cam.cy);
      for (let r = 0; r < 80 && !target; r++)
        for (let dy = -r; dy <= r && !target; dy++)
          for (let dx = -r; dx <= r && !target; dx++) {
            const x = cx + dx,
              y = cy + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
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
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (p.canAttack(g.ref(x, y))) target = { x, y };
          if (target) break;
        }
        if (target) break;
      }
    } else if (pick === "buildSettlement" && p) {
      for (const t of p.tiles())
        if (p.canBuild("Settlement", t) !== false) {
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
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr, tile: target };
  }, pick);
  if (!pt) return null;
  await page.mouse.click(pt.x, pt.y);
  return pt.tile;
}

const state = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner?.game;
    if (!g) return { reset: true };
    const p = g.playerByClientID(el.myClientID);
    return {
      inSpawn: g.inSpawnPhase(),
      tiles: p ? p.numTilesOwned() : null,
      settlementSeeds: p ? p.settlementSeeds() : null,
      settlements: p ? p.units("Settlement").length : null,
      foodShare: p ? p.foodPopulationShare() : null,
      buildType: el.buildType,
    };
  });

// Run the whole flow; retry if an external reload reset the page mid-run.
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    await ensureOpenfront();
    if ((await state()).inSpawn) {
      await clickTile("landCenter");
      await page.waitForTimeout(1200);
    }
    for (let i = 0; i < 6; i++) {
      await clickTile("attack");
      await page.waitForTimeout(250);
    }
    // Grant seeds to exercise the client build path deterministically.
    await page.evaluate(() => {
      const el = document.querySelector("game-shell-page");
      el.gameRunner.game.playerByClientID(el.myClientID)._settlementSeeds = 3;
    });
    await page.waitForTimeout(500);
    const before = await state();
    await page.click('game-shell-page button:has-text("Settlement")');
    const buildSel = await page.evaluate(
      () => document.querySelector("game-shell-page").buildType,
    );
    const t = await clickTile("buildSettlement");
    await page.waitForTimeout(2000);
    const after = await state();
    // Food allocation via the UI method.
    await page.evaluate(() =>
      document.querySelector("game-shell-page").setFoodShare(0.5),
    );
    await page.waitForTimeout(1200);
    const foodShare = (await state()).foodShare;

    console.log("attempt", attempt, "OK");
    console.log("before build:", before);
    console.log("build selected:", buildSel, "placed at:", t);
    console.log("after build:", after);
    console.log("food share after set 0.5:", foodShare);
    await page.screenshot({ path: "/tmp/openfront-run/build-food.png" });
    console.log("errors:", errors.length ? errors : "none");
    break;
  } catch (e) {
    console.log("attempt", attempt, "reset/err:", e.message.split("\n")[0]);
    if (attempt === 4) throw e;
    await page.waitForTimeout(1500);
  }
}
await browser.close();
