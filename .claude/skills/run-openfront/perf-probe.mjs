// Perf probe (rework-settlement-ecology): quantify the render-upload flood.
// Spies on texSubImage2D BEFORE the game boots, runs a bot-heavy game until
// wars rage, then reports: GL sub-upload calls/tick, damage/density delta
// volumes, and worker tick duration.
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  gameState,
  spawn,
  startSoloGame,
  waitForSpawnPhaseEnd,
  waitForTick,
} from "./game.mjs";

const { browser, page } = await launch({ rafIntervalMs: 1000 });
try {
  // Install the GL spy before any game code runs.
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    const orig = proto.texSubImage2D;
    window.__glStats = { subUploads: 0, tinyUploads: 0 };
    proto.texSubImage2D = function (...args) {
      window.__glStats.subUploads++;
      // 9-arg overload: (target, level, x, y, w, h, format, type, pixels)
      if (args.length >= 9 && args[4] === 1 && args[5] === 1) {
        window.__glStats.tinyUploads++;
      }
      return orig.apply(this, args);
    };
  });
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 100 });
  await spawn(page);
  await waitForSpawnPhaseEnd(page);

  // Let bot wars develop.
  await waitForTick(page, (await gameState(page)).ticks + 400);

  // Sample over a 100-tick window.
  const before = await page.evaluate(() => ({
    ...window.__glStats,
    tick: document.querySelector("build-menu").game.ticks(),
  }));
  const t0 = Date.now();
  await waitForTick(page, before.tick + 100);
  const after = await page.evaluate(() => {
    const game = document.querySelector("build-menu").game;
    return {
      ...window.__glStats,
      tick: game.ticks(),
      damageChanged: game.recentlyUpdatedDamageTiles().length,
      densityChanged: game.recentlyUpdatedDensityTiles().length,
      damagedTotal: (() => {
        const b = game.damageStateBuffer();
        let n = 0;
        for (let i = 0; i < b.length; i++) if (b[i] > 0) n++;
        return n;
      })(),
    };
  });
  const ticks = after.tick - before.tick;
  const wallMs = Date.now() - t0;
  console.log(
    JSON.stringify(
      {
        ticks,
        wallMsPerTick: Math.round(wallMs / ticks),
        subUploadsPerTick: Math.round(
          (after.subUploads - before.subUploads) / ticks,
        ),
        tinyUploadsPerTick: Math.round(
          (after.tinyUploads - before.tinyUploads) / ticks,
        ),
        lastTickDamageDeltas: after.damageChanged,
        lastTickDensityDeltas: after.densityChanged,
        damagedTilesTotal: after.damagedTotal,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
