import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () =>
    document.querySelector("game-shell-page")?.textContent?.includes("week "),
  { timeout: 60000 },
);
const MAP = process.env.MAP || "Verdantia";
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForFunction(
  () => !!document.querySelector("game-shell-page")?.gameRunner,
  { timeout: 30000 },
);
await page.waitForTimeout(3000);
if (MAP !== "Verdantia") {
  console.log("switching map to", MAP);
  await page.selectOption("game-shell-page select >> nth=1", MAP);
  await page.waitForFunction(
    () => !!document.querySelector("game-shell-page")?.gameRunner,
    { timeout: 90000 },
  );
  await page.waitForTimeout(5000);
}

// Spawn so the game is fully live.
await page.evaluate(() => {
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
        if (g.isLand(g.ref(x, y))) f = g.ref(x, y);
      }
  el.gameRunner.addTurn({
    turnNumber: el.simTurn++,
    intents: [{ type: "spawn", tile: f, clientID: el.myClientID }],
  });
});
await page.waitForTimeout(2000);

// Fast-forward the sim to a MATURE state (bots grown + fighting) — that's where
// the tick cost balloons. Drive turns in-process (no rendering).
console.log("fast-forwarding sim to a mature state…");
const ffChunks = MAP === "Verdantia" ? 16 : 3;
for (let chunk = 0; chunk < ffChunks; chunk++) {
  await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const gr = el.gameRunner;
    const p = gr.game.playerByClientID(el.myClientID);
    if (p && p.isAlive()) p.setTroops(200000);
    for (let k = 0; k < 120; k++) {
      gr.addTurn({ turnNumber: el.simTurn++, intents: [] });
      gr.executeNextTick();
    }
  });
}
const mature = await page.evaluate(() => ({
  ticks: document.querySelector("game-shell-page").gameRunner.game.ticks(),
}));
console.log("mature at tick", mature.ticks);
await page.waitForTimeout(1000);

// Instrument: wrap key methods, accumulate timing, count rAF frames.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const S = (window.__perf = { frames: 0, t0: performance.now(), acc: {} });
  const wrap = (obj, name, key) => {
    const orig = obj[name].bind(obj);
    S.acc[key] = { ms: 0, n: 0 };
    obj[name] = (...a) => {
      const t = performance.now();
      const r = orig(...a);
      S.acc[key].ms += performance.now() - t;
      S.acc[key].n++;
      return r;
    };
  };
  wrap(el.gameRunner, "executeNextTick", "executeNextTick");
  wrap(el, "onSimUpdate", "onSimUpdate");
  wrap(el, "uploadConduits", "uploadConduits");
  wrap(el, "computeFront", "computeFront");
  wrap(el, "stepSim", "stepSim");
  wrap(el, "updateLabels", "updateLabels");
  wrap(el, "updateFrontLabels", "updateFrontLabels");
  wrap(el, "advance", "advance");
  wrap(el, "present", "present");
  // GPU frame time (via the kernel frame's gpuMs) + main-thread inFlight span.
  S.gpu = { ms: 0, n: 0 };
  S.inflight = { ms: 0, n: 0 };
  const kb = el.kernel.beginFrame.bind(el.kernel);
  el.kernel.beginFrame = (...a) => {
    const frame = kb(...a);
    const t = performance.now();
    const of = frame.finish.bind(frame);
    frame.finish = () =>
      of().then((r) => {
        S.inflight.ms += performance.now() - t;
        S.inflight.n++;
        if (r && typeof r.gpuMs === "number") {
          S.gpu.ms += r.gpuMs;
          S.gpu.n++;
        }
        return r;
      });
    return frame;
  };
  const raf = () => {
    S.frames++;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
});

await page.waitForTimeout(6000);

const rep = await page.evaluate(() => {
  const S = window.__perf;
  const secs = (performance.now() - S.t0) / 1000;
  const out = { fps: +(S.frames / secs).toFixed(1), seconds: +secs.toFixed(1) };
  for (const [k, v] of Object.entries(S.acc)) {
    out[k] = {
      callsPerSec: +(v.n / secs).toFixed(1),
      avgMs: +(v.ms / Math.max(1, v.n)).toFixed(2),
      msPerSec: +(v.ms / secs).toFixed(1),
    };
  }
  const el = document.querySelector("game-shell-page");
  out.mapTiles = el.mapWidth * el.mapHeight;
  out.players = el.gameRunner.game.players().length;
  out.ticks = el.gameRunner.game.ticks();
  out.gpuFrameMs = +(S.gpu.ms / Math.max(1, S.gpu.n)).toFixed(2);
  out.inFlightMs = +(S.inflight.ms / Math.max(1, S.inflight.n)).toFixed(2);
  return out;
});
console.log(JSON.stringify(rep, null, 2));
await browser.close();
