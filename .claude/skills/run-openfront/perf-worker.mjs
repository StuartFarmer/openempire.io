import { chromium } from "playwright";
const MAP = process.env.MAP || "EarthXL";
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
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForTimeout(2000);
if (MAP !== "Verdantia") {
  await page.selectOption("game-shell-page select >> nth=1", MAP);
  await page.waitForFunction(
    () => !!document.querySelector("game-shell-page")?.worker,
    { timeout: 90000 },
  );
  await page.waitForTimeout(6000);
}
// Wait for the worker's first frame.
await page
  .waitForFunction(
    () =>
      (document.querySelector("game-shell-page")?.playerStat?.size ?? 0) > 0,
    { timeout: 40000 },
  )
  .catch(() => {});
await page.waitForTimeout(2000);

// Instrument main-thread work + fps. The sim now runs in the worker; the main
// thread should stay smooth regardless of the sim tick cost.
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const S = (window.__perf = {
    frames: 0,
    t0: performance.now(),
    acc: {},
    gpu: { ms: 0, n: 0 },
  });
  const wrap = (name) => {
    const orig = el[name].bind(el);
    S.acc[name] = { ms: 0, n: 0 };
    el[name] = (...a) => {
      const t = performance.now();
      const r = orig(...a);
      S.acc[name].ms += performance.now() - t;
      S.acc[name].n++;
      return r;
    };
  };
  ["onWorkerFrame", "renderOpenfront", "present", "updateLabels"].forEach(wrap);
  const kb = el.kernel.beginFrame.bind(el.kernel);
  el.kernel.beginFrame = (...a) => {
    const f = kb(...a);
    const of = f.finish.bind(f);
    f.finish = () =>
      of().then((r) => {
        if (r && typeof r.gpuMs === "number") {
          S.gpu.ms += r.gpuMs;
          S.gpu.n++;
        }
        return r;
      });
    return f;
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
  const out = { map: null, fps: +(S.frames / secs).toFixed(1) };
  for (const [k, v] of Object.entries(S.acc))
    out[k] = {
      perSec: +(v.n / secs).toFixed(1),
      avgMs: +(v.ms / Math.max(1, v.n)).toFixed(2),
      msPerSec: +(v.ms / secs).toFixed(1),
    };
  const el = document.querySelector("game-shell-page");
  out.map = `${el.mapWidth}x${el.mapHeight}`;
  out.players = el.playerStat.size;
  out.tick = el.tickReadout;
  out.gpuFrameMs = +(S.gpu.ms / Math.max(1, S.gpu.n)).toFixed(2);
  return out;
});
console.log(JSON.stringify(rep, null, 2));
await browser.close();
