import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";

const { chromium } = createRequire(process.cwd() + "/package.json")(
  "playwright",
);
const baseUrl = process.env.SIMPLEFRONT_URL ?? "http://127.0.0.1:9017";
const output = new URL("./spqr-turbo-browser.json", import.meta.url);
const sourcePaths = [
  "docs/performance/spqr-turbo-browser.mjs",
  "src/client/GameShellPage.ts",
  "src/client/shell/CameraRenderer.ts",
  "src/client/webgpu/ShellSim.worker.ts",
  "src/client/webgpu/CityDevelopmentUpdates.ts",
  "src/core/development/CityDevelopmentState.ts",
];
const report = {
  generatedAt: new Date().toISOString(),
  url: baseUrl,
  hardware: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
  },
  sourceHashes: Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(new URL("../../" + path, import.meta.url)))
          .digest("hex"),
      ]),
    ),
  ),
  protocol: {
    map: "SPQR",
    viewport: { width: 1920, height: 1080 },
    bots: 50,
    targetTick: 7000,
    deadlineMinutes: 15,
    mode: "After-only real GameShellPage and simulation worker, SimpleFront live defaults, valid human land spawn, actual setTurbo(true) API; automatic cities; no further human actions.",
    measurements:
      "Per approximately 500 ticks: received tick progress / real elapsed time, rAF interval p50/p95, synchronous onWorkerFrame CPU wall duration, actual full/partial runView calls. Windows end at the first received frame at or beyond each 500-tick boundary.",
    limitations: [
      "One unseeded match; no old-checkout browser baseline or before/after FPS claim.",
      "Headless Chrome WebGPU via Vite development server; rAF intervals are presentation opportunities, not GPU completion time or displayed FPS.",
      "Fixed viewport and camera after the normal spawn transition; no scripted battles, synthetic deltas, or city painting.",
      "Worker-frame duration measures the main thread only; instrumentation adds small timing overhead.",
      "OS, browser, and GPU activity are uncontrolled; root's separate Node benchmark completes before this browser run starts.",
    ],
  },
  errors: [],
  windows: [],
};
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--disable-features=LocalNetworkAccessChecks",
  ],
});
report.browserVersion = browser.version();
try {
  const page = await browser.newPage({ viewport: report.protocol.viewport });
  // Evidence writes must not trigger Vite's development-page hot reload.
  await page.routeWebSocket("**/*", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const type = JSON.parse(String(message)).type;
      if (type !== "full-reload" && type !== "update") socket.send(message);
    });
  });
  page.on("pageerror", (error) => report.errors.push("page: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      report.errors.push("console: " + message.text().slice(0, 1000));
  });
  await page.route("**/__spqr_turbo_probe__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}game-shell-page{position:fixed;inset:0}canvas{width:100%;height:100%}</style><script>window.BOOTSTRAP_CONFIG={gitCommit:"DEV",assetManifest:{},cdnBase:"",gameEnv:"dev",numWorkers:2,instanceId:"DEV_ID"}</script>`,
    }),
  );
  await page.goto(baseUrl + "/__spqr_turbo_probe__");
  await page.evaluate(async () => {
    await import("/src/client/styles.css");
    const { GameShellPage } = await import("/src/client/GameShellPage.ts");
    const game = new GameShellPage();
    game.firstUpdated = () => {};
    document.body.append(game);
    await game.updateComplete;
    game.mapKey = "SPQR";
    game.systemId = "simplefront";
    game.simBots = 50;
    game.running = false;
    window.__probe = { game, windows: [], errors: [] };
    const receiveMessage = game.onWorkerMessage.bind(game);
    game.onWorkerMessage = (message) => {
      if (message.type === "error")
        __probe.errors.push("worker: " + message.message);
      return receiveMessage(message);
    };
    await game.loadWorld();
    game.renderer.device.addEventListener("uncapturederror", (event) =>
      __probe.errors.push("gpu: " + event.error.message),
    );
  });
  await page.waitForFunction(
    () => __probe.game.workerReady && __probe.game.bakedTintOn,
    {},
    { timeout: 120_000 },
  );
  report.match = await page.evaluate(async () => {
    const { game } = __probe;
    const water = game.hoverFields?.waterMask;
    if (!water) throw new Error("Missing land mask");
    let tile = -1;
    const center =
      Math.floor(game.mapHeight / 2) * game.mapWidth +
      Math.floor(game.mapWidth / 2);
    for (let offset = 0; offset < water.length; offset++) {
      const candidate = (center + offset) % water.length;
      if (water[candidate] === 0 && game.ownerScratch[candidate] === 0) {
        tile = candidate;
        break;
      }
    }
    if (tile < 0) throw new Error("No valid spawn tile");
    game.queueIntent({ type: "spawn", tile });
    if (!game.running) game.toggleRunning();
    const adapter = await navigator.gpu.requestAdapter();
    return {
      selectedMap: game.mapKey,
      systemId: game.systemId,
      bots: game.simBots,
      dimensions: [game.mapWidth, game.mapHeight],
      spawnTile: tile,
      cityDevelopment: game.cityDevelopmentConfig,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
      userAgent: navigator.userAgent,
      devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  });
  assert.equal(report.match.selectedMap, "SPQR");
  assert.equal(report.match.bots, 50);
  assert.ok(
    report.match.cityDevelopment,
    "Default city development must be active",
  );
  await page.waitForFunction(
    () => !__probe.game.inSpawn,
    {},
    { timeout: 30_000 },
  );
  report.start = await page.evaluate(() => {
    const p = __probe;
    const { game } = p;
    const quantiles = (values) => {
      values.sort((a, b) => a - b);
      return {
        count: values.length,
        p50: values[Math.floor(values.length * 0.5)] ?? null,
        p95: values[Math.floor(values.length * 0.95)] ?? null,
        max: values.at(-1) ?? null,
      };
    };
    p.startTick = game.tickCount;
    p.startTime = performance.now();
    let tick = p.startTick,
      started = p.startTime,
      boundary = Math.ceil((tick + 1) / 500) * 500;
    let raf = [],
      cpu = [],
      fullViews = 0,
      partialViews = 0,
      lastRaf = null;
    const sample = (now) => {
      if (p.done) return;
      if (lastRaf !== null) raf.push(now - lastRaf);
      lastRaf = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const runView = game.compiled.runView.bind(game.compiled);
    game.compiled.runView = (...args) => {
      if (args[2] === undefined) fullViews++;
      else partialViews++;
      return runView(...args);
    };
    const receive = game.onWorkerFrame.bind(game);
    game.onWorkerFrame = (frame) => {
      const before = performance.now();
      receive(frame);
      const now = performance.now();
      cpu.push(now - before);
      if (game.tickCount < boundary) return;
      p.windows.push({
        fromTick: tick,
        toTick: game.tickCount,
        elapsedMs: now - started,
        ticksPerSecond: ((game.tickCount - tick) * 1000) / (now - started),
        rafIntervalMs: quantiles(raf),
        workerFrameCpuMs: {
          ...quantiles(cpu),
          total: cpu.reduce((a, b) => a + b, 0),
        },
        fullViews,
        partialViews,
        playerCount: game.playerStat.size,
        simplePlotCount: game.simplePlots.size,
        matchResult: game.matchResult ?? null,
      });
      tick = game.tickCount;
      started = now;
      boundary += 500;
      raf = [];
      cpu = [];
      fullViews = 0;
      partialViews = 0;
      lastRaf = null;
      if (tick >= 7000) {
        p.done = true;
        p.endTime = now;
        if (game.running) game.toggleRunning();
      }
    };
    game.setTurbo(true);
    return {
      tick: p.startTick,
      spawned: !game.inSpawn,
      turbo: game.turbo,
      running: game.running,
    };
  });
  console.log(JSON.stringify({ started: report.start, match: report.match }));
  const deadline = Date.now() + 15 * 60_000;
  let previousWindows = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({
      tick: __probe.game.tickCount,
      done: !!__probe.done,
      windows: __probe.windows,
      errors: __probe.errors,
      running: __probe.game.running,
      matchResult: __probe.game.matchResult ?? null,
    }));
    report.windows = state.windows;
    report.workerAndGpuErrors = state.errors;
    report.end = state;
    delete report.end.windows;
    if (report.windows.length !== previousWindows) {
      console.log(JSON.stringify(report.windows.slice(previousWindows)));
      previousWindows = report.windows.length;
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    }
    if (state.done) break;
    if (!state.running)
      throw new Error("Match stopped before target: " + JSON.stringify(state));
  }
  assert.ok(
    report.end.done && report.end.tick >= 7000,
    "Match must reach 7000 ticks",
  );
  report.end.elapsedMs = await page.evaluate(
    () => __probe.endTime - __probe.startTime,
  );
  report.end.developedTiles = await page.evaluate(() =>
    __probe.game.plotU32.reduce(
      (count, plot) => count + Number(plot >>> 16 > 0),
      0,
    ),
  );
  assert.ok(report.end.developedTiles > 0, "Automatic cities must be present");
  const screenshot = await page.screenshot({
    path: "/tmp/spqr-turbo-browser.png",
  });
  report.screenshotSha256 = createHash("sha256")
    .update(screenshot)
    .digest("hex");
  report.completed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(output.pathname);
}
