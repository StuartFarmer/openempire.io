/**
 * In-game verification for the food allocation slider (add-food-allocation):
 * start a layered solo game, spawn, read the slider, drag it, and assert the
 * intent round-trips into the sim (myPlayer().foodPopulationShare changes).
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

const OUT = "/tmp/openfront-run";
fs.mkdirSync(OUT, { recursive: true });

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 20, map: "verdantia" });
  await spawn(page);
  await waitForSpawnPhaseEnd(page);
  const s0 = await gameState(page);
  await waitForTick(page, s0.ticks + 10);

  const before = await page.evaluate(() => {
    const g = document.querySelector("build-menu").game;
    const sliders = [
      ...document.querySelectorAll("control-panel input[type=range]"),
    ];
    return {
      simShare: g.myPlayer().foodPopulationShare(),
      sliderCount: sliders.length,
      sliderValue: sliders.length > 1 ? sliders[1].value : null,
    };
  });
  console.log("before:", JSON.stringify(before));
  if (before.sliderCount < 2) throw new Error("allocation slider not found");
  if (before.simShare !== 0.7) throw new Error("default share not 0.7");
  await page.screenshot({ path: `${OUT}/alloc-before.png` });

  // Drag the allocation slider to 30% population via the real input.
  await page.evaluate(() => {
    const slider = [
      ...document.querySelectorAll("control-panel input[type=range]"),
    ][1];
    slider.value = "30";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const s1 = await gameState(page);
  await waitForTick(page, s1.ticks + 5); // intent → turn → execution

  const after = await page.evaluate(() => {
    const g = document.querySelector("build-menu").game;
    return { simShare: g.myPlayer().foodPopulationShare() };
  });
  console.log("after:", JSON.stringify(after));
  await page.waitForTimeout(7000); // ≥2 throttled rAF frames for the shot
  await page.screenshot({ path: `${OUT}/alloc-after.png` });

  if (Math.abs(after.simShare - 0.3) > 1e-9) {
    throw new Error(`share did not apply: ${after.simShare}`);
  }
  console.log("FOOD ALLOCATION VERIFY: PASS");
} finally {
  await browser.close();
}
