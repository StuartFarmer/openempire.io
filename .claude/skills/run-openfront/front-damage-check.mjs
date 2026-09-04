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
await page.waitForTimeout(5000);

async function clickLandCenter() {
  const pt = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner.game,
      cam = el.camera;
    const cx = Math.floor(cam.cx),
      cy = Math.floor(cam.cy);
    let f = null;
    for (let r = 0; r < 80 && !f; r++)
      for (let dy = -r; dy <= r && !f; dy++)
        for (let dx = -r; dx <= r && !f; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || y < 0 || x >= g.width() || y >= g.height()) continue;
          if (g.isLand(g.ref(x, y))) f = { x, y };
        }
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fbx = (f.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (f.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
  });
  await page.mouse.click(pt.x, pt.y);
}

// Spawn, expand a base, boost to survive, then turbo so bots grow and border us.
await clickLandCenter();
await page.waitForTimeout(1500);
for (let i = 0; i < 20; i++) {
  await clickLandCenter();
  await page.waitForTimeout(180);
}
// Drive the sim fast in-process (turbo is a no-op for a derive system) so bots
// grow and border us; keep the human alive by re-boosting each chunk.
for (let chunk = 0; chunk < 8; chunk++) {
  await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const gr = el.gameRunner;
    gr.game.playerByClientID(el.myClientID).setTroops(150000);
    for (let k = 0; k < 120; k++) {
      gr.addTurn({ turnNumber: el.simTurn++, intents: [] });
      gr.executeNextTick();
    }
  });
}
await page.waitForTimeout(400);

// Deterministically stage a human front: find a bot adjacent to our border and
// register a real outgoing attack seeded with the contested border tiles.
const setup = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const g = el.gameRunner.game;
  const me = g.playerByClientID(el.myClientID);
  if (!me || !me.isAlive()) return { alive: false };
  const W = g.width();
  const border = new Set();
  let botId = null,
    src = null;
  for (const b of me.borderTiles()) {
    for (const nb of [b + 1, b - 1, b + W, b - W]) {
      if (nb < 0 || nb >= W * g.height()) continue;
      const o = g.ownerID(nb);
      if (o !== 0 && o !== me.smallID()) {
        if (botId === null) {
          botId = o;
          src = b;
        }
        if (o === botId) border.add(nb);
      }
    }
  }
  if (botId === null) return { alive: true, adjacentBot: false };
  const bot = g.playerBySmallID(botId);
  bot.setTroops(40000);
  me.setTroops(60000);
  me.createAttack(bot, 20000, src, border);
  return {
    alive: true,
    adjacentBot: true,
    bot: bot.displayName(),
    borderSize: border.size,
  };
});
console.log("front setup:", setup);
await page.waitForTimeout(700);

const s = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const p = el.gameRunner.game.playerByClientID(el.myClientID);
  const cnt = (a, pred) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (pred(a[i])) n++;
    return n;
  };
  const front = el.frontU32,
    dmg = el.damageU32;
  const labels = [...document.querySelectorAll("#shell-labels > div")];
  return {
    outgoing: p.outgoingAttacks().length,
    frontTiles: cnt(front, (v) => v > 0),
    frontGreen: cnt(front, (v) => v > 128),
    frontRed: cnt(front, (v) => v > 0 && v < 128),
    damageTiles: cnt(dmg, (v) => v > 0),
    frontLabels: labels
      .filter((l) => /^[+-]/.test(l.textContent))
      .map((l) => l.textContent),
  };
});
console.log("sample:", s);

// Screenshot 1: the front (green ring + label).
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const g = el.gameRunner.game;
  const p = g.playerByClientID(el.myClientID);
  const a = p.outgoingAttacks()[0];
  const anchor =
    (a && a.clusteredPositions()[0]) ?? p.core() ?? [...p.tiles()][0];
  el.camera = { cx: g.x(anchor) + 0.5, cy: g.y(anchor) + 0.5, scale: 16 };
});
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/openfront-run/front-damage.png" });

// Screenshot 2: a heavily-damaged region (the brown battle-worn wash).
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const g = el.gameRunner.game;
  const dmg = el.damageU32;
  let bx = 0,
    by = 0,
    best = 0;
  const W = g.width();
  for (let i = 0; i < dmg.length; i++)
    if (dmg[i] > best) {
      best = dmg[i];
      bx = i % W;
      by = (i / W) | 0;
    }
  el.camera = { cx: bx + 0.5, cy: by + 0.5, scale: 14 };
});
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/openfront-run/damage-wash.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
