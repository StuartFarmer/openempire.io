/**
 * Close-up visual check of the supply overlay: spawn, expand a bit, paint a
 * few extra farms/barn, toggle the overlay, zoom the camera into the
 * homestead, and screenshot.
 */
import fs from "fs";
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  attack,
  findExpansionTile,
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
  await startSoloGame(page, { bots: 20, map: "verdantia" });
  const tile = await spawn(page);
  await waitForSpawnPhaseEnd(page);

  // Expand so the frontier outruns the starter settlement's radius a bit.
  const s0 = await gameState(page);
  const target = await findExpansionTile(page, tile);
  if (target) await attack(page, target.x, target.y);
  await waitForTick(page, s0.ticks + 120);

  // Toggle the overlay on via the real build-bar button.
  await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    [...bar.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Supply"))
      .click();
  });
  const s1 = await gameState(page);
  await waitForTick(page, s1.ticks + 5);

  // Zoom into the homestead (kill any goTo animation first, or it fights
  // the manual scale/offset writes).
  await page.evaluate(() => {
    const t = document.querySelector("build-menu").transformHandler;
    t.clearTarget();
    t.scale = 12;
  });
  await panTo(page, tile.x, tile.y);
  await page.waitForTimeout(7000); // ≥2 throttled rAF frames (3s each)
  await page.screenshot({ path: `${OUT}/supply-closeup-on.png` });
  // HUD-free crop over the homestead for a pixel-honest on/off diff.
  const clip = { x: 500, y: 300, width: 400, height: 400 };
  await page.screenshot({ path: `${OUT}/supply-crop-on.png`, clip });

  // Same framing, overlay off.
  await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    [...bar.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Supply"))
      .click();
  });
  await page.waitForTimeout(7000); // ≥2 throttled rAF frames
  await page.screenshot({ path: `${OUT}/supply-closeup-off.png` });
  await page.screenshot({
    path: `${OUT}/supply-crop-off.png`,
    clip: { x: 500, y: 300, width: 400, height: 400 },
  });
  const [on, off] = [
    fs.readFileSync(`${OUT}/supply-crop-on.png`),
    fs.readFileSync(`${OUT}/supply-crop-off.png`),
  ];
  console.log("territory crop differs (HUD excluded):", !on.equals(off));
  console.log("done");
} finally {
  await browser.close();
}
