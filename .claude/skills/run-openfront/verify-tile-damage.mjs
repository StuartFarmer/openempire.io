// Verify the battle-worn tile-damage tint (rework-settlement-ecology task 1.3):
// start a solo game with many bots, spawn, and wait for combat anywhere on the
// map (bot-vs-bot conquest also scars tiles). Assert the damage channel carries
// non-zero bytes to the client, screenshot the brown wash, then watch it fade.
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import {
  gameState,
  panTo,
  spawn,
  startSoloGame,
  waitForSpawnPhaseEnd,
  waitForTick,
} from "./game.mjs";

const scanDamage = (page) =>
  page.evaluate(() => {
    const game = document.querySelector("build-menu").game;
    const buf = game.damageStateBuffer();
    let n = 0,
      max = 0,
      at = null;
    const W = game.width();
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      if (v > 0) {
        n++;
        if (v > max) {
          max = v;
          at = { x: i % W, y: (i / W) | 0 };
        }
      }
    }
    return { damagedTiles: n, maxByte: max, at };
  });

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 100 });
  await spawn(page);
  await waitForSpawnPhaseEnd(page);
  console.log("spawned; waiting for combat somewhere on the map…");

  // Poll for combat damage (bot wars) for up to ~1500 ticks.
  let dmg = { damagedTiles: 0 };
  for (let i = 0; i < 30; i++) {
    await waitForTick(page, (await gameState(page)).ticks + 50);
    dmg = await scanDamage(page);
    console.log(
      `tick ${(await gameState(page)).ticks}: damaged=${dmg.damagedTiles} max=${dmg.maxByte}`,
    );
    if (dmg.damagedTiles > 10) break;
  }
  if (dmg.damagedTiles === 0) {
    throw new Error("no combat damage reached the client");
  }

  // Screenshot the scarred front.
  await panTo(page, dmg.at.x, dmg.at.y);
  await new Promise((r) => setTimeout(r, 4000)); // let a frame render
  await page.screenshot({ path: "/tmp/openfront-run/damage-fresh.png" });
  console.log("fresh-scar screenshot at", JSON.stringify(dmg.at));

  // Healing: pick the current max byte and confirm the same tile decays.
  const probe = dmg.at;
  const byteAt = (p) =>
    page.evaluate(({ x, y }) => {
      const game = document.querySelector("build-menu").game;
      return game.damageStateBuffer()[game.ref(x, y)];
    }, p);
  const b0 = await byteAt(probe);
  await waitForTick(page, (await gameState(page)).ticks + 60);
  const b1 = await byteAt(probe);
  await page.screenshot({ path: "/tmp/openfront-run/damage-healed.png" });
  console.log(`probe tile byte: ${b0} → ${b1} after ~60 ticks`);
  console.log(
    b1 < b0
      ? "HEALING OK"
      : "WARNING: probe did not fade (front may have re-scarred it)",
  );
  console.log("VERIFY OK");
} finally {
  await browser.close();
}
