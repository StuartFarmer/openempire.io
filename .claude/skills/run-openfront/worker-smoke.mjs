import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () =>
    document.querySelector("game-shell-page")?.textContent?.includes("week "),
  { timeout: 60000 },
);
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");

// Wait for the worker to ship its first frame (a player table appears).
await page
  .waitForFunction(
    () =>
      (document.querySelector("game-shell-page")?.playerStat?.size ?? 0) > 0,
    { timeout: 30000 },
  )
  .catch(() => {});
await page.waitForTimeout(4000);

const state = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return {
      hasWorker: !!el?.worker,
      players: el?.playerStat?.size ?? 0,
      names: el?.playerName?.size ?? 0,
      inSpawn: el?.inSpawn,
      tick: el?.tickReadout,
      mySmallID: el?.mySmallID,
      myStats: el?.myStats,
    };
  });

console.log("before spawn:", await state());

// Click a land tile near the camera center to spawn (found via the terrain
// water mask maintained on the main thread).
const clickLand = async () => {
  const pt = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const wm = el.hoverFields?.waterMask;
    const W = el.mapWidth,
      H = el.mapHeight,
      cam = el.camera;
    const cx = Math.floor(cam.cx),
      cy = Math.floor(cam.cy);
    let f = null;
    for (let r = 0; r < 90 && !f; r++)
      for (let dy = -r; dy <= r && !f; dy++)
        for (let dx = -r; dx <= r && !f; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (!wm || wm[y * W + x] !== 1) f = { x, y };
        }
    const canvas = document.querySelector("#shell-canvas");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const fbx = (f.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
    const fby = (f.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
    return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
  });
  await page.mouse.click(pt.x, pt.y);
};
await clickLand();
await page.waitForTimeout(2500);
console.log("after spawn:", await state());
const labels = await page.evaluate(
  () => document.querySelectorAll("#shell-labels > div").length,
);
console.log("labels:", labels);
await page.screenshot({ path: "/tmp/openfront-run/worker-smoke.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
