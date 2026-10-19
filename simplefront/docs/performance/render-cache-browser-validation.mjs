import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(process.cwd() + "/package.json")(
  "playwright",
);
const baseUrl = process.env.SIMPLEFRONT_URL ?? "http://127.0.0.1:9017";
const smokeOnly = process.argv.includes("--smoke-only");
const output = new URL(
  "./render-cache-browser-validation.json",
  import.meta.url,
);
const cases = smokeOnly
  ? [{ map: "Verdantia", width: 1920, height: 1080 }]
  : [
      { map: "Verdantia", width: 1920, height: 1080 },
      { map: "EarthXL", width: 3840, height: 2160 },
    ];

const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const sourceFiles = {
  harness: new URL(import.meta.url),
  gameShellPage: new URL("../../src/client/GameShellPage.ts", import.meta.url),
  cameraRenderer: new URL(
    "../../src/client/shell/CameraRenderer.ts",
    import.meta.url,
  ),
};
const sourceHashes = Object.fromEntries(
  await Promise.all(
    Object.entries(sourceFiles).map(async ([name, url]) => [
      name,
      createHash("sha256")
        .update(await readFile(url))
        .digest("hex"),
    ]),
  ),
);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--disable-features=LocalNetworkAccessChecks",
  ],
});

async function mount(page, map) {
  await page.route("**/__render_cache_probe__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}game-shell-page{position:fixed;inset:0}canvas{width:100%;height:100%}</style><script>window.BOOTSTRAP_CONFIG={gitCommit:"DEV",assetManifest:{},cdnBase:"",gameEnv:"dev",numWorkers:2,instanceId:"DEV_ID"}</script>`,
    }),
  );
  await page.goto(baseUrl + "/__render_cache_probe__");
  await page.evaluate(
    async ({ map }) => {
      await import("/src/client/styles.css");
      const { GameShellPage } = await import("/src/client/GameShellPage.ts");
      const game = new GameShellPage();
      game.firstUpdated = () => {};
      const frames = [];
      const receive = game.onWorkerFrame.bind(game);
      game.onWorkerFrame = (frame) => {
        frames.push(structuredClone(frame));
        if (frames.length > 64) frames.shift();
        receive(frame);
      };
      document.body.append(game);
      await game.updateComplete;
      // connectedCallback applies page defaults, so select after mounting.
      game.mapKey = map;
      game.systemId = "simplefront";
      window.__probe = { game, frames, raf: [], gpuErrors: [] };
      const sample = (now) => {
        window.__probe.raf.push(now);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      await game.loadWorld();
      game.renderer.device.addEventListener("uncapturederror", (event) =>
        window.__probe.gpuErrors.push(event.error.message),
      );
    },
    { map },
  );
  await page.waitForFunction(
    () => __probe.game.workerReady && __probe.game.bakedTintOn,
    {},
    { timeout: 120_000 },
  );
  const selectedMap = await page.evaluate(() => __probe.game.mapKey);
  if (selectedMap !== map)
    throw new Error(`Requested ${map}, mounted ${selectedMap}`);
}

async function smoke(page) {
  const spawned = await page.evaluate(async () => {
    const { game, frames } = __probe;
    const adapter = await navigator.gpu.requestAdapter();
    const startTick = game.tickCount;
    const water = game.hoverFields?.waterMask;
    let tile = -1;
    if (water) {
      const cx = Math.floor(game.mapWidth / 2);
      const cy = Math.floor(game.mapHeight / 2);
      for (
        let radius = 0;
        radius < Math.max(game.mapWidth, game.mapHeight);
        radius += 8
      ) {
        for (const [x, y] of [
          [cx + radius, cy],
          [cx - radius, cy],
          [cx, cy + radius],
          [cx, cy - radius],
        ]) {
          if (x >= 0 && y >= 0 && x < game.mapWidth && y < game.mapHeight) {
            const candidate = y * game.mapWidth + x;
            if (water[candidate] === 0 && game.ownerScratch[candidate] === 0) {
              tile = candidate;
              break;
            }
          }
        }
        if (tile >= 0) break;
      }
    }
    if (tile >= 0) game.queueIntent({ type: "spawn", tile });
    const deadline = performance.now() + 20_000;
    while (game.inSpawn && performance.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));

    let cityTile = -1;
    let cityCandidates = [];
    if (!game.inSpawn) {
      for (
        let i = 0;
        i < game.ownerScratch.length && cityCandidates.length < 8;
        i++
      ) {
        if (game.ownerScratch[i] === game.mySmallID && game.plotU32[i] === 0)
          cityCandidates.push(i);
      }
      if (cityCandidates.length)
        game.queueIntent({
          type: "paint_tiles",
          kind: "city",
          tiles: cityCandidates,
        });
    }
    const cityDeadline = performance.now() + 12_000;
    while (
      cityCandidates.length > 0 &&
      !cityCandidates.some((tile) => game.plotU32[tile] >>> 16 > 0) &&
      performance.now() < cityDeadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    cityTile =
      cityCandidates.find((tile) => game.plotU32[tile] >>> 16 > 0) ?? -1;

    game.running = false;
    game.postWorker({ type: "running", running: false, turbo: false });
    await new Promise((resolve) => setTimeout(resolve, 300));
    game.cameraTween = null;
    game.renderer.activeBurns.clear();
    game.renderer.setTransportShips(
      new Int32Array(),
      game.playerFill,
      game.playerBorder,
    );
    __probe.spawnTile = tile;
    return {
      workerFramesCaptured: frames.length,
      startTick,
      endTick: game.tickCount,
      spawned: !game.inSpawn,
      spawnTile: tile,
      cityTile,
      cityCreated: cityTile >= 0,
      dimensions: [game.mapWidth, game.mapHeight],
      canvasBackingSize: [
        game.renderer.canvas.width,
        game.renderer.canvas.height,
      ],
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
      selectedMap: game.mapKey,
      workerReady: game.workerReady,
      bakedTintOn: game.bakedTintOn,
    };
  });
  await page.waitForTimeout(100);
  return spawned;
}

async function measure(page, mode, durationMs = 20_000) {
  const result = await page.evaluate(
    async ({ mode, durationMs }) => {
      const { game, raf } = __probe;
      const counters = {
        attempts: 0,
        fullViews: 0,
        partialViews: 0,
        skippedViews: 0,
        dirtyFractions: [],
        conduitAndPlotUploadCalls: 0,
        conduitAndPlotUploadBytes: 0,
        deltaMs: [],
        viewEncodeMs: [],
        renderCompletionWallMs: [],
      };
      const columns = Math.ceil(game.mapWidth / 32);
      const chunks = columns * Math.ceil(game.mapHeight / 32);
      const originalRunView = game.compiled.runView.bind(game.compiled);
      game.compiled.runView = (...args) => {
        const started = performance.now();
        const ids = args[2];
        if (ids === undefined) counters.fullViews++;
        else {
          counters.partialViews++;
          counters.dirtyFractions.push(ids.length / chunks);
        }
        const result = originalRunView(...args);
        counters.viewEncodeMs.push(performance.now() - started);
        return result;
      };
      const originalWriteBuffer = game.kernel.writeBuffer.bind(game.kernel);
      game.kernel.writeBuffer = (name, data) => {
        counters.conduitAndPlotUploadCalls++;
        counters.conduitAndPlotUploadBytes += data.byteLength;
        return originalWriteBuffer(name, data);
      };
      const originalWriteRange = game.kernel.writeBufferU32Range.bind(
        game.kernel,
      );
      game.kernel.writeBufferU32Range = (name, data, first, last) => {
        counters.conduitAndPlotUploadCalls++;
        counters.conduitAndPlotUploadBytes += (last - first + 1) * 4;
        return originalWriteRange(name, data, first, last);
      };
      const originalPlotPlane = game.renderer.writePlotPlane.bind(
        game.renderer,
      );
      game.renderer.writePlotPlane = (bytes, width, height) => {
        counters.conduitAndPlotUploadCalls++;
        counters.conduitAndPlotUploadBytes += width * height;
        return originalPlotPlane(bytes, width, height);
      };
      const originalPlotTiles = game.renderer.writePlotTiles.bind(
        game.renderer,
      );
      game.renderer.writePlotTiles = (bytes, width, height, tiles) => {
        if (mode === "full")
          return game.renderer.writePlotPlane(bytes, width, height);
        const unique = [...new Set(tiles)].filter(
          (tile) =>
            Number.isInteger(tile) && tile >= 0 && tile < width * height,
        );
        if (unique.length <= (width * height) / 16) {
          counters.conduitAndPlotUploadBytes += unique.length;
          const sorted = unique.sort((a, b) => a - b);
          for (let i = 0; i < sorted.length; i++)
            if (
              i === 0 ||
              sorted[i] !== sorted[i - 1] + 1 ||
              Math.floor(sorted[i] / width) !==
                Math.floor(sorted[i - 1] / width)
            )
              counters.conduitAndPlotUploadCalls++;
        }
        return originalPlotTiles(bytes, width, height, tiles);
      };

      if (!__probe.snapshot) {
        game.cameraTween = null;
        game.paramValues.maskFade = game.inSpawn ? 0 : 1;
        const water = game.hoverFields?.waterMask;
        const anchor = __probe.spawnTile;
        let patch = null;
        for (
          let offset = 0;
          !patch && offset < game.mapWidth * game.mapHeight;
          offset++
        ) {
          const first = (anchor + offset) % (game.mapWidth * game.mapHeight);
          const x = first % game.mapWidth;
          const y = Math.floor(first / game.mapWidth);
          if (x + 1 >= game.mapWidth || y + 1 >= game.mapHeight) continue;
          const candidate = [
            first,
            first + 1,
            first + game.mapWidth,
            first + game.mapWidth + 1,
          ];
          if (water && candidate.every((tile) => water[tile] === 0))
            patch = { x, y, tiles: candidate };
        }
        if (!patch) throw new Error("No 2x2 all-land replay patch found");
        const { tiles } = patch;
        __probe.snapshot = {
          camera: { ...game.camera, cx: patch.x + 1, cy: patch.y + 1 },
          params: { ...game.paramValues },
          patch: { x: patch.x, y: patch.y, allLand: true },
          tiles,
          values: tiles.map((tile) => ({
            tile,
            owner: game.ownerScratch[tile],
            plot: game.plotU32[tile] & 0xffff,
            damage: game.damageU32[tile],
            density: game.densityU32[tile],
            front: game.frontU32[tile],
            supply: game.supplyU32[tile],
          })),
        };
      }
      const {
        camera: baseCamera,
        params: baseParams,
        tiles,
        values: base,
      } = __probe.snapshot;
      const frame = (fields = {}) => ({
        mySmallID: game.mySmallID,
        inSpawn: game.inSpawn,
        tick: game.tickCount,
        spawnAnchor: null,
        myStats: game.myStats,
        transportShips: new Uint32Array(),
        ...fields,
      });
      const packedBytes = (key) =>
        Uint32Array.from(base.map((v) => v.tile | ((v[key] & 255) << 24)));
      const pairs = (key) =>
        Uint32Array.from(base.flatMap((v) => [v.tile, v[key]]));
      const restore = frame({
        owner: pairs("owner"),
        plot: pairs("plot"),
        damage: packedBytes("damage"),
        density: packedBytes("density"),
        front: pairs("front"),
        supply: packedBytes("supply"),
      });
      game.onWorkerFrame(restore);
      game.camera = { ...baseCamera };
      game.cameraTween = null;
      game.paramValues = { ...baseParams };
      game.renderInvalidation.markAll();
      await game.renderOpenfront();
      counters.fullViews = 0;
      counters.partialViews = 0;
      counters.dirtyFractions.length = 0;
      counters.conduitAndPlotUploadCalls = 0;
      counters.conduitAndPlotUploadBytes = 0;
      counters.deltaMs.length = 0;
      counters.viewEncodeMs.length = 0;
      counters.renderCompletionWallMs.length = 0;

      // Presentation keeps its real rAF cadence; this replay alone owns compute.
      const originalAdvance = game.advance.bind(game);
      game.advance = () => {};

      const rafStart = raf.length;
      const started = performance.now();
      let next = started;
      for (let step = 0; step < 200; step++) {
        const phase = Math.floor(step / 50);
        if (phase === 1) {
          game.camera = {
            ...baseCamera,
            cx: baseCamera.cx + (step % 40) * 0.25,
          };
        } else if (phase === 2) {
          game.setHoveredPlayer(step % 2 ? 2 : 3);
        } else if (phase === 3) {
          const owner = step % 2 ? 2 : 3;
          const plot = step % 2 ? 2 | (160 << 8) : 1;
          const byte = (step % 2 ? 180 : 20) << 24;
          const t0 = performance.now();
          game.onWorkerFrame(
            frame({
              owner: Uint32Array.from(tiles.flatMap((tile) => [tile, owner])),
              plot: Uint32Array.from(tiles.flatMap((tile) => [tile, plot])),
              damage: Uint32Array.from(tiles.map((tile) => tile | byte)),
              density: Uint32Array.from(tiles.map((tile) => tile | byte)),
              front: Uint32Array.from(
                tiles.flatMap((tile) => [tile, byte >>> 24]),
              ),
              supply: Uint32Array.from(tiles.map((tile) => tile | byte)),
            }),
          );
          counters.deltaMs.push(performance.now() - t0);
        }
        if (mode === "full") game.renderInvalidation.markAll();
        counters.attempts++;
        const renderStart = performance.now();
        await game.renderOpenfront();
        counters.renderCompletionWallMs.push(performance.now() - renderStart);
        next += 100;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, next - performance.now())),
        );
      }
      counters.skippedViews =
        counters.attempts - counters.fullViews - counters.partialViews;
      const rafSlice = raf.slice(rafStart);
      const intervals = rafSlice
        .slice(1)
        .map((value, i) => value - rafSlice[i]);
      const sortedIntervals = [...intervals].sort((a, b) => a - b);

      game.compiled.runView = originalRunView;
      game.kernel.writeBuffer = originalWriteBuffer;
      game.kernel.writeBufferU32Range = originalWriteRange;
      game.renderer.writePlotPlane = originalPlotPlane;
      game.renderer.writePlotTiles = originalPlotTiles;
      game.advance = originalAdvance;
      return {
        durationMs: performance.now() - started,
        phases: ["stationary", "pan", "hover", "synthetic-fighting"],
        ...counters,
        rafIntervalsMs: {
          count: intervals.length,
          p50:
            sortedIntervals[Math.floor(sortedIntervals.length * 0.5)] ?? null,
          p95:
            sortedIntervals[Math.floor(sortedIntervals.length * 0.95)] ?? null,
        },
      };
    },
    { mode, durationMs },
  );
  const canvas = await page.locator("#shell-canvas").screenshot();
  result.screenshotSha256 = createHash("sha256").update(canvas).digest("hex");
  for (const key of ["deltaMs", "viewEncodeMs", "renderCompletionWallMs"]) {
    result[key] = {
      count: result[key].length,
      p50: quantile(result[key], 0.5),
      p95: quantile(result[key], 0.95),
    };
  }
  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  url: baseUrl,
  sourceHashes,
  protocol: {
    modes: {
      full: "production build with full invalidation before each scripted render and full plot-plane uploads",
      optimized: "production invalidation and partial plot uploads",
    },
    duration: "20 seconds per mode, split into four 5-second phases",
    cadence: "10 scripted updates/second; worker paused during comparison",
    comparability:
      "same page, captured starting tile values, restored state, deterministic 2x2 all-land patch near the human spawn, camera start centered on that patch, and fixed 200-event scripted sequence",
    timings:
      "main-thread performance.now separately around worker-frame handling and synchronous runView encoding; render completion wall time is labeled separately and is not a GPU timestamp; rAF intervals sampled in page",
    uploadScope:
      "conduitAndPlotUpload* counts game conduit buffer writes and plot-texture writes only; it excludes parameter uniform writes and the 8 KiB region-uniform copy, so it is not total GPU upload traffic",
    deviations: [
      "The four scenarios share one 20-second clip instead of a 20-second Cartesian trial per scenario.",
      "Representative endpoint cases cover Verdantia at 1080p and Earth XL at 4K rather than the full map/resolution Cartesian product.",
      "The fighting phase uses deterministic synthetic conduit mutations on a real loaded map after an actual spawn/city smoke.",
      "Map-switch stale-callback behavior remains unit-tested; the two browser cases mount their maps independently.",
      "Full mode emulates the old full-dispatch/full-plot-upload boundary on the optimized build; it is not an old-checkout FPS baseline.",
      "GPU timestamp measurements are recorded by the separate production shader benchmark.",
      "Camera GPU timestamps and full animated-framebuffer pixel parity are unmeasured here; the separate GPU harness checks compute output bytes including alpha.",
      "Screenshot hashes are smoke evidence; time-driven camera layers prevent treating cross-mode hashes as a strict pixel-parity oracle.",
    ],
  },
  cases: [],
};

try {
  for (const config of cases) {
    const errors = [];
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
    });
    page.on("pageerror", (error) => errors.push("page: " + error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (
        !text.includes("WebSocket") &&
        !text.includes("ERR_CONNECTION_REFUSED")
      )
        errors.push("console: " + text.slice(0, 1000));
    });
    await mount(page, config.map);
    const actualMatch = await smoke(page);
    const entry = { ...config, actualMatch, errors };
    if (!smokeOnly) {
      entry.full = await measure(page, "full");
      entry.optimized = await measure(page, "optimized");
    }
    entry.errors.push(
      ...(await page.evaluate(() =>
        __probe.gpuErrors.map((error) => "gpu: " + error),
      )),
    );
    report.cases.push(entry);
    if (!smokeOnly)
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    await page.screenshot({
      path: `/tmp/render-cache-${config.map}-${config.width}x${config.height}.png`,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

if (smokeOnly) console.log(JSON.stringify(report, null, 2));
else {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(output.pathname);
}
