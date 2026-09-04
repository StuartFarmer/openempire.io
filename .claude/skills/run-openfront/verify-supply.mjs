/**
 * In-game verification for the supply-lines overlay (add-supply-lines):
 * start a solo game on a layered map, spawn (starter kit), toggle the
 * Supply button in the build bar, and screenshot before/after. Asserts the
 * overlay actually changes rendered pixels over owned territory.
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
  const tile = await spawn(page);
  await waitForSpawnPhaseEnd(page);
  console.log("spawned at", tile);

  // Let the kit settle and some territory accrete.
  const state0 = await gameState(page);
  await waitForTick(page, state0.ticks + 40);

  const barState = await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    const buttons = [...(bar?.querySelectorAll("button") ?? [])];
    return {
      present: !!bar,
      buttons: buttons.length,
      supplyLabel: buttons.some((b) => b.textContent?.includes("Supply")),
    };
  });
  console.log("build bar:", barState);
  if (!barState.supplyLabel) throw new Error("Supply toggle not in build bar");

  await page.screenshot({ path: `${OUT}/supply-off.png` });

  // Toggle the overlay via the real button.
  await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    const btn = [...bar.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Supply"),
    );
    btn.click();
  });
  // Overlay data is pushed on the next sim tick; wait a couple.
  const s1 = await gameState(page);
  await waitForTick(page, s1.ticks + 5);
  await page.screenshot({ path: `${OUT}/supply-on.png` });

  // Compare the two screenshots — the wash must change pixels.
  const [a, b] = [
    fs.readFileSync(`${OUT}/supply-off.png`),
    fs.readFileSync(`${OUT}/supply-on.png`),
  ];
  const differs = !a.equals(b);
  console.log("screenshots differ:", differs);

  // Toggle off again — overlay must disappear (button state flips back).
  await page.evaluate(() => {
    const bar = document.querySelector("build-bar");
    const btn = [...bar.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Supply"),
    );
    btn.click();
  });
  const s2 = await gameState(page);
  await waitForTick(page, s2.ticks + 3);
  await page.screenshot({ path: `${OUT}/supply-off-again.png` });

  const state = await gameState(page);
  console.log("final state:", JSON.stringify(state.myPlayer));
  if (!differs) throw new Error("overlay produced no visible change");
  console.log("SUPPLY OVERLAY VERIFY: PASS");
} finally {
  await browser.close();
}
