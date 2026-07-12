/**
 * In-game verification of urban-core growth (add-urban-core-growth): start on
 * estuaria, found a capital, idle while the city grows, and screenshot the
 * rendered density field zoomed into the core.
 */
import fs from "fs";
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  gameState,
  panTo,
  spawn,
  startSoloGame,
  waitForSpawnPhaseEnd,
  waitForTick,
} from "./game.mjs";

const OUT = "/tmp/openfront-run";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 20, map: "Estuaria" });
  const tile = await spawn(page);
  await waitForSpawnPhaseEnd(page);
  console.log("founded at", tile);

  const s0 = await gameState(page);
  // Confirm the sim founded a Core and seeded density.
  const founded = await page.evaluate(() => {
    const g = document.querySelector("build-menu").game;
    const me = g.myPlayer();
    return { core: me.core?.() ?? null, area: me.urbanArea?.() ?? 0 };
  });
  console.log("after founding:", JSON.stringify(founded));

  // Zoom into the capital and let it grow.
  await page.evaluate(() => {
    const t = document.querySelector("build-menu").transformHandler;
    t.clearTarget();
    t.scale = 9;
  });
  await panTo(page, tile.x, tile.y);
  await waitForTick(page, s0.ticks + 30);
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/urban-young.png` });

  await waitForTick(page, s0.ticks + 150);
  await page.waitForTimeout(7000);
  const grown = await page.evaluate(() => {
    const g = document.querySelector("build-menu").game;
    const me = g.myPlayer();
    return { area: me.urbanArea?.() ?? 0, troops: me.troops(), tiles: me.numTilesOwned() };
  });
  console.log("after growth:", JSON.stringify(grown));
  await panTo(page, tile.x, tile.y);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/urban-grown.png` });

  if (grown.area > founded.area + 1) console.log("URBAN GROWTH VERIFY: PASS (city grew and renders)");
  else console.log("VERIFY: city did not grow —", founded.area, "→", grown.area);
} finally {
  await browser.close();
}
