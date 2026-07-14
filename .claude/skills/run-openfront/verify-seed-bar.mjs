// Verify the seed-award BuildBar (rework-settlement-ecology task 3.3): spawn,
// expand, and confirm the bar shows banked seed counts (not food prices) and
// that the sim awards seeds as territory grows.
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  attack,
  gameState,
  spawn,
  startSoloGame,
  waitForSpawnPhaseEnd,
  waitForTick,
} from "./game.mjs";

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 30 });
  const tile = await spawn(page);
  await waitForSpawnPhaseEnd(page);

  // Expand to earn farm seeds (1 per 25 peak tiles).
  const target = await page.evaluate((st) => {
    const game = document.querySelector("build-menu").game;
    const me = game.myPlayer().smallID();
    const W = game.width(),
      H = game.height();
    for (let r = 2; r < 40; r++) {
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ]) {
        const x = st.x + dx,
          y = st.y + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) return { x, y };
      }
    }
    return null;
  }, tile);
  if (target) await attack(page, target.x, target.y).catch(() => {});
  await waitForTick(page, (await gameState(page)).ticks + 100);

  const seeds = await page.evaluate(() => {
    const me = document.querySelector("build-menu").game.myPlayer();
    return {
      farm: me.farmSeeds(),
      settlement: me.settlementSeeds(),
      tiles: me.numTilesOwned(),
    };
  });
  console.log("sim seeds:", JSON.stringify(seeds));

  const barText = await page.evaluate(
    () => document.querySelector("build-bar")?.textContent?.trim() ?? "",
  );
  console.log("build-bar text:", JSON.stringify(barText.slice(0, 200)));

  await page.screenshot({ path: "/tmp/openfront-run/seed-bar.png" });
  if (seeds.farm < 1) throw new Error("no farm seeds awarded after expansion");
  if (!/seeds/.test(barText)) throw new Error("bar does not show seed counts");
  console.log("VERIFY OK");
} finally {
  await browser.close();
}
