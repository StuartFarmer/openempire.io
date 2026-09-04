// Late-game shell perf probe: run the live OpenFront sim in #shell on a big
// map, spawn, turn on turbo, and sample rAF frame rate + a CPU profile as the
// tick count climbs — to separate "the sim got slow" (worker thread) from "the
// page got slow" (main-thread delta apply / Lit / GPU submits).
//
//   node .claude/skills/run-openfront/shell-perf-check.mjs [--map SPQR] [--minutes 8]
import { chromium } from "playwright";

const SHELL = "game-shell-page:not([ambient])";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const MAP = arg("map", "SPQR");
const MINUTES = Number(arg("minutes", "8"));

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

// rAF counter — the page's own presentation cadence, i.e. what the player sees.
await page.addInitScript(() => {
  window.__frames = 0;
  const tick = () => {
    window.__frames += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  (s) => /week \d+/.test(document.querySelector(s)?.textContent ?? ""),
  SHELL,
  { timeout: 120000 },
);
await page.selectOption(`${SHELL} select >> nth=1`, MAP);
await page.waitForTimeout(25000);

// Spawn: click land near the middle of the canvas, retrying outward until the
// HUD reports owned tiles (the shell only engages the full HUD once you exist).
const box = await page.locator(`${SHELL} #shell-canvas`).boundingBox();
const tilesOwned = () =>
  page.evaluate((s) => {
    const t = document.querySelector(s)?.textContent.replace(/\s+/g, " ") ?? "";
    const m = t.match(/TILES\s*([\d,.km]+)/i);
    return m ? m[1] : "0";
  }, SHELL);
for (let i = 0; i < 24 && (await tilesOwned()) === "0"; i += 1) {
  const a = (i / 24) * Math.PI * 2;
  await page.mouse.click(
    box.x + box.width / 2 + Math.cos(a) * 60 * (1 + i / 6),
    box.y + box.height / 2 + Math.sin(a) * 60 * (1 + i / 6),
  );
  await page.waitForTimeout(1200);
}
console.log("spawned, tiles:", await tilesOwned());

// Turbo on — the sim ticks flat out instead of at 10/s.
await page
  .locator(`${SHELL} input[type=checkbox]`)
  .first()
  .check()
  .catch(() => {});

const client = await page.context().newCDPSession(page);
const sample = async () => {
  const before = await page.evaluate(() => window.__frames);
  const t0 = Date.now();
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => window.__frames);
  const state = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const t = el?.textContent.replace(/\s+/g, " ") ?? "";
    // Fire/ash liveness: how many burns are alive, the cap, and the OLDEST
    // one's age. Ash only draws from 5s to 9s, so if maxAge never passes 5s
    // the ash phase is being evicted before it is ever reached.
    const burns = el?.renderer?.activeBurns;
    const now = performance.now();
    let maxAge = 0;
    if (burns)
      for (const b of burns.values()) {
        maxAge = Math.max(maxAge, (now - b.startMs) / 1000);
      }
    return {
      tick: t.match(/tick (\d+)/)?.[1],
      pop: t.match(/POP ([\d.,km]+)/i)?.[1],
      tiles: t.match(/TILES ([\d.,km]+)/i)?.[1],
      burns: burns ? burns.size : -1,
      burnMaxAge: maxAge.toFixed(1),
    };
  }, SHELL);
  const fps = ((after - before) / (Date.now() - t0)) * 1000;
  return { ...state, fps: fps.toFixed(1) };
};

const profileTop = async (ms) => {
  await client.send("Profiler.enable");
  await client.send("Profiler.start");
  await page.waitForTimeout(ms);
  const { profile } = await client.send("Profiler.stop");
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const total = profile.samples.length || 1;
  for (const id of profile.samples) {
    const n = byId.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k, v]) => `${((v / total) * 100).toFixed(1)}% ${k}`);
};

// Keep the human EXPANDING. A passive player is conquered in a few minutes and
// then every per-human path (supply field, front deltas, border shipping,
// segment highlight) goes quiet — which is exactly the work a real late-game
// player pays for. Clicking outward keeps a real empire on the board.
const expand = async () => {
  const r = 80 + Math.random() * 320;
  const a = Math.random() * Math.PI * 2;
  await page.mouse
    .click(
      box.x + box.width / 2 + Math.cos(a) * r,
      box.y + box.height / 2 + Math.sin(a) * r,
    )
    .catch(() => {});
};

const deadline = Date.now() + MINUTES * 60000;
let profiled = 0;
while (Date.now() < deadline) {
  for (let i = 0; i < 4; i += 1) await expand();
  const s = await sample();
  console.log(
    `tick=${s.tick} pop=${s.pop} tiles=${s.tiles} fps=${s.fps} burns=${s.burns}/128 oldest=${s.burnMaxAge}s`,
  );
  if (Number(s.tick) > 2500 * (profiled + 1) && profiled < 3) {
    profiled += 1;
    console.log(`--- CPU profile @ tick ${s.tick} (main thread, 6s) ---`);
    for (const line of await profileTop(6000)) console.log("   ", line);
  }
  await page.waitForTimeout(8000);
}
await page.screenshot({ path: "/tmp/openfront-run/shell-perf.png" });
await browser.close();
