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
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
  }, pick);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

const snap = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const p = el.gameRunner.game.playerByClientID(el.myClientID);
    return { buildType: el.buildType, seeds: p ? p.settlementSeeds() : null };
  });

await clickTile("landCenter");
await page.waitForTimeout(1500);

// Grant exactly ONE settlement seed.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  el.gameRunner.game.playerByClientID(el.myClientID)._settlementSeeds = 1;
});
await page.waitForTimeout(500);

// Select Settlement (build mode on).
await page.click('game-shell-page button:has-text("Settlement")');
console.log(
  "after select:",
  await snap(),
  "(expect buildType=Settlement, seeds=1)",
);

// Place the one settlement → seed goes to 0 → tool should auto-clear.
await clickTile("buildSettlement");
await page.waitForTimeout(2000);
console.log(
  "after last placement:",
  await snap(),
  "(expect buildType=null, seeds=0)",
);

const s = await snap();
console.log("RESULT:", {
  autoSwitchedBack: s.buildType === null && s.seeds === 0,
});
console.log("errors:", errors.length ? errors : "none");
await browser.close();
