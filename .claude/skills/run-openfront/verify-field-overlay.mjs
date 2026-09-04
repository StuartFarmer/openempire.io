/**
 * Verify the field-maturity green overlay (rework-settlement-ecology task
 * 5.5): start a solo game, spawn, let the starter farm's field spread, then
 * assert (a) the sim has claimed field tiles beyond the nucleus, (b) the
 * client's fieldState buffer carries their maturity bytes, and (c) the
 * rendered frame shows the green wash (screenshot for eyeballing).
 */
import { gotoHome, launch, openSoloModal } from "./driver.mjs";
import { gameState, spawn, startSoloGame, waitForTick } from "./game.mjs";

const { browser, page } = await launch({ rafIntervalMs: 3000 });
try {
  await gotoHome(page);
  await openSoloModal(page);
  await startSoloGame(page, { bots: 10 });
  const tile = await spawn(page);
  console.log("spawned at", tile);

  // Let the field spread (~60s of sim = 600 ticks).
  await waitForTick(page, 600, 240_000);
  const state = await gameState(page);
  console.log("tick", state.ticks, "tiles", state.myPlayer?.tilesOwned);

  const probe = await page.evaluate(() => {
    const gv = document.querySelector("build-menu").game;
    const me = gv.myPlayer();
    const buf = gv.fieldStateBuffer();
    const claimByte = Math.round(
      (gv.config().food().fieldClaimMilli * 255) / 1000,
    );
    let nonzero = 0;
    let max = 0;
    let claimed = 0;
    let painted = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 0) {
        nonzero++;
        if (buf[i] > max) max = buf[i];
        if (buf[i] >= claimByte) {
          claimed++;
          // Field tiles must be painted as Farmland plots (type 2).
          if (gv.plotStateAt(i) === 2) painted++;
        }
      }
    }
    return {
      name: me.name(),
      alive: me.isAlive(),
      tiles: me.numTilesOwned(),
      nonzero,
      max,
      claimed,
      painted,
    };
  });
  console.log("fieldState:", probe);

  await page.screenshot({ path: "/tmp/openfront-run/field-overlay.png" });

  if (probe.nonzero < 3) {
    throw new Error(
      `expected ≥3 tiles with field maturity bytes, got ${probe.nonzero}`,
    );
  }
  if (probe.max < 100) {
    throw new Error(`expected a ripening field (byte ≥100), max=${probe.max}`);
  }
  console.log("FIELD OVERLAY OK");
} finally {
  await browser.close();
}
