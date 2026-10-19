import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.SIMPLEFRONT_URL ?? "http://127.0.0.1:9019";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--disable-features=LocalNetworkAccessChecks",
  ],
});
const report = {
  browser: browser.version(),
  generatedAt: new Date().toISOString(),
  errors: [],
  limitations:
    "One real browser shell/worker match to 600 ticks; synthetic controller failure exercises replacement and terminal stop; not a late-game FPS or remote-network test.",
};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.routeWebSocket("**/*", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const type = JSON.parse(String(message)).type;
      if (type !== "full-reload" && type !== "update") socket.send(message);
    });
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/__chain_validation__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><style>html,body{margin:0;width:100%;height:100%}game-shell-page{position:fixed;inset:0}canvas{width:100%;height:100%}</style><script>window.BOOTSTRAP_CONFIG={gitCommit:"DEV",assetManifest:{},cdnBase:"",gameEnv:"dev",numWorkers:2,instanceId:"DEV_ID"}</script>',
    }),
  );
  await page.goto(base + "/__chain_validation__");
  report.vector = await page.evaluate(async () => {
    const { sealTick, verifyTick } =
      await import("/src/core/sync/TickChain.ts");
    const previous = { tick: -1, chainHash: "a".repeat(64) };
    const block = await sealTick(previous, []);
    await verifyTick(previous, block);
    return block.chainHash;
  });
  assert.equal(
    report.vector,
    createHash("sha256")
      .update(JSON.stringify(["simplefront/tick/v1", "a".repeat(64), 0, []]))
      .digest("hex"),
  );
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
    window.__chain = { game, records: [], failures: [], terminated: 0 };
    const receive = game.onWorkerMessage.bind(game);
    game.onWorkerMessage = (message) => {
      if (message.type === "chain_record") {
        __chain.records.push(message.record);
        return;
      }
      if (message.type === "error" || message.type === "chain_failure")
        __chain.failures.push(message.message);
      if (
        message.type === "frame" &&
        game.recoveryTarget !== null &&
        !__chain.restored
      )
        __chain.restored = { cursor: message.chain, stats: message.myStats };
      return receive(message);
    };
    await game.loadWorld();
  });
  await page.waitForFunction(
    () => __chain.game.workerReady && __chain.game.bakedTintOn,
    {},
    { timeout: 120000 },
  );
  console.log("Browser shell ready");
  await page.evaluate(() => {
    const game = __chain.game,
      water = game.hoverFields.waterMask;
    let tile =
      Math.floor(game.mapHeight / 2) * game.mapWidth +
      Math.floor(game.mapWidth / 2);
    while (
      tile < water.length &&
      (water[tile] !== 0 || game.ownerScratch[tile] !== 0)
    )
      tile++;
    if (tile >= water.length) throw new Error("No valid spawn tile");
    game.queueIntent({ type: "spawn", tile });
    if (!game.running) game.toggleRunning();
    game.setTurbo(true);
  });
  try {
    await page.waitForFunction(
      () => __chain.game.tickReadout >= 600,
      {},
      { timeout: 120000 },
    );
  } catch (error) {
    console.log(
      await page.evaluate(() => ({
        tick: __chain.game.tickReadout,
        running: __chain.game.running,
        status: __chain.game.status,
        failures: __chain.failures,
      })),
    );
    throw error;
  }
  console.log("Browser reached 600 ticks");
  await page.evaluate(() => {
    const g = __chain.game;
    g.running = false;
    g.postWorker({ type: "running", running: false, turbo: false });
    g.postWorker({ type: "export_chain" });
  });
  await page.waitForFunction(() => __chain.records.length > 0);
  report.record = await page.evaluate(() => {
    const g = __chain.game,
      record = __chain.records[0];
    __chain.beforeStats = g.myStats;
    __chain.cleared = [];
    const clear = g.kernel.clearBuffer.bind(g.kernel);
    g.kernel.clearBuffer = (name) => {
      __chain.cleared.push(name);
      clear(name);
    };
    g.highlightU32[100] = 1;
    g.litHighlight = [100];
    g.kernel.writeBufferU32Range("highlight", g.highlightU32, 100, 100);
    __chain.originalWorker = g.worker;
    const terminate = g.worker.terminate.bind(g.worker);
    g.worker.terminate = () => {
      __chain.terminated++;
      terminate();
    };
    g.running = false; // Rebuild completion must not depend on advancing gameplay.
    g.onWorkerMessage({
      type: "chain_failure",
      record,
      message: "Browser recovery probe",
    });
    return {
      build: record.genesis.simulationBuild,
      cursor: record.appliedThrough,
      blocks: record.blocks.length,
      stateCheckpoints: record.stateCheckpoints.length,
    };
  });
  await page.waitForFunction(
    () =>
      __chain.game.workerReady &&
      __chain.game.recoveryTarget === null &&
      __chain.game.tickReadout === __chain.records[0].appliedThrough.tick + 1,
    {},
    { timeout: 120000 },
  );
  report.recovery = await page.evaluate(() => ({
    replaced: __chain.originalWorker !== __chain.game.worker,
    terminated: __chain.terminated,
    restored: __chain.restored,
    beforeStats: __chain.beforeStats,
    currentTick: __chain.game.tickReadout,
    status: __chain.game.status,
    paused: !__chain.game.running,
    cleared: __chain.cleared,
    highlightedTiles: __chain.game.litHighlight,
  }));
  assert.equal(report.recovery.replaced, true);
  assert.equal(report.recovery.terminated, 1);
  assert.deepEqual(report.recovery.restored.cursor, report.record.cursor);
  assert.deepEqual(report.recovery.restored.stats, report.recovery.beforeStats);
  assert.equal(report.record.stateCheckpoints, 0);
  assert.equal(report.recovery.paused, true);
  assert.deepEqual(report.recovery.cleared, [
    "owner",
    "plot",
    "density",
    "front",
    "damage",
    "supply",
    "highlight",
  ]);
  assert.deepEqual(report.recovery.highlightedTiles, []);
  await page.evaluate(() => __chain.game.toggleRunning());
  await page.waitForFunction(
    () => __chain.game.tickReadout > __chain.records[0].appliedThrough.tick + 1,
  );
  report.terminal = await page.evaluate(async () => {
    const g = __chain.game;
    g.onWorkerMessage({
      type: "chain_failure",
      record: __chain.records[0],
      message: "Repeat failure",
    });
    g.onWorkerMessage({
      type: "chain_failure",
      record: __chain.records[0],
      message: "Repeat failure again",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      stopped: g.chainStopped,
      worker: g.worker === null,
      running: g.running,
      timer: g.recoveryTimer,
      evidence: !!g.failedChainRecord,
      status: g.status,
    };
  });
  assert.equal(report.terminal.stopped, true);
  assert.equal(report.terminal.worker, true);
  assert.equal(report.terminal.running, false);
  assert.equal(report.terminal.timer, null);
  assert.equal(report.terminal.evidence, true);
  assert.deepEqual(report.errors, []);
  const json = JSON.stringify(
    report,
    (_, value) => (typeof value === "bigint" ? String(value) : value),
    2,
  );
  console.log(json);
  if (process.env.CHAIN_BROWSER_OUTPUT)
    await writeFile(process.env.CHAIN_BROWSER_OUTPUT, json, { flag: "wx" });
} finally {
  await browser.close();
}
