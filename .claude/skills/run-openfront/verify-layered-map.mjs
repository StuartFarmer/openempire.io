/**
 * Spot-check a converted layered map: start a game on it, assert
 * hasLayers()/food economy are live (kit spawn, food HUD, build bar,
 * varied crop fertility), and screenshot with the supply overlay on.
 * Usage: node verify-layered-map.mjs <mapValue e.g. majormenor>
 */
import fs from "fs";
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  gameState,
  spawn,
  startSoloGame,
  waitForSpawnPhaseEnd,
  waitForTick,
} from "./game.mjs";

const mapName = process.argv[2] ?? "majormenor";
const OUT = "/tmp/openfront-run";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 20, map: mapName });
  const tile = await spawn(page);
  await waitForSpawnPhaseEnd(page);
  const s0 = await gameState(page);
  await waitForTick(page, s0.ticks + 30);

  const check = await page.evaluate(() => {
    const g = document.querySelector("build-menu").game;
    const me = g.myPlayer();
    // Sample crop fertility across the map — a layered map has variety.
    const crops = new Set();
    for (let y = 0; y < g.height(); y += 16) {
      for (let x = 0; x < g.width(); x += 16) {
        try {
          crops.add(g.layer("crop", g.ref(x, y)));
        } catch {
          /* layer() may not exist on GameView — fall through */
        }
      }
    }
    const bar = document.querySelector("build-bar");
    return {
      hasLayers: g.hasLayers(),
      cropVariety: crops.size,
      buildBarButtons: bar ? bar.querySelectorAll("button").length : 0,
      troops: me.troops(),
      gold: String(me.gold()),
      food: String(me.food?.() ?? "n/a"),
      settlements: g
        .units("Settlement")
        .filter((u) => u.owner().smallID() === me.smallID()).length,
      farmland: g
        .units("Farmland")
        .filter((u) => u.owner().smallID() === me.smallID()).length,
    };
  });
  console.log(mapName, JSON.stringify(check, null, 1));

  // Supply overlay on + zoom in for the screenshot.
  await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    [...bar.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Supply"))
      ?.click();
    const t = document.querySelector("build-menu").transformHandler;
    t.clearTarget();
    t.scale = 10;
  });
  await page.evaluate(
    ([wx, wy]) => {
      const t = document.querySelector("build-menu").transformHandler;
      const c = t.screenCenter();
      t.offsetX += wx - c.screenX;
      t.offsetY += wy - c.screenY;
    },
    [tile.x, tile.y],
  );
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/layered-${mapName}.png` });

  const ok =
    check.hasLayers &&
    check.cropVariety > 1 &&
    check.buildBarButtons === 4 &&
    check.gold === "0" &&
    check.settlements === 1 &&
    check.farmland === 3;
  console.log(ok ? "LAYERED MAP VERIFY: PASS" : "VERIFY: FAIL");
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
}
