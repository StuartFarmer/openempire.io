import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () =>
    document.querySelector("game-shell-page")?.textContent?.includes("week "),
  { timeout: 60000 },
);
await page.waitForTimeout(3000);
await page.selectOption("game-shell-page select >> nth=0", "openfront");
await page.waitForFunction(
  () => !!document.querySelector("game-shell-page")?.gameRunner,
  { timeout: 30000 },
);
await page.waitForTimeout(4000);

const snap = () =>
  page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    const g = el.gameRunner.game;
    const p = g.playerByClientID(el.myClientID);
    // No Pan/Brush buttons should render for openfront (drag=pan, click=act).
    const btns = [...document.querySelectorAll("game-shell-page button")].map(
      (b) => b.textContent.trim(),
    );
    return {
      inSpawn: g.inSpawnPhase(),
      cam: { cx: Math.round(el.camera.cx), cy: Math.round(el.camera.cy) },
      tiles: p ? p.numTilesOwned() : 0,
      hasPanBtn: btns.some((t) => t.includes("pan") || t.includes("brush")),
    };
  });

const box = await page.locator("#shell-canvas").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

const before = await snap();

// 1) DRAG across the canvas — should PAN and NOT spawn.
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 10; i++)
  await page.mouse.move(cx - i * 12, cy - i * 6, { steps: 1 });
await page.mouse.up();
await page.waitForTimeout(500);
const afterDrag = await snap();

// 2) CLICK (no movement) on land — should SPAWN (end spawn phase).
// Find a land tile under the current camera center and click its screen point.
const clickPt = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const g = el.gameRunner.game,
    cam = el.camera;
  const cxT = Math.floor(cam.cx),
    cyT = Math.floor(cam.cy);
  let f = null;
  for (let r = 0; r < 80 && !f; r++)
    for (let dy = -r; dy <= r && !f; dy++)
      for (let dx = -r; dx <= r && !f; dx++) {
        const x = cxT + dx,
          y = cyT + dy;
        if (x < 0 || y < 0 || x >= g.width() || y >= g.height()) continue;
        if (g.isLand(g.ref(x, y))) f = { x, y };
      }
  const canvas = document.querySelector("#shell-canvas");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const fbx = (f.x + 0.5 - cam.cx) * cam.scale + canvas.width / 2;
  const fby = (f.y + 0.5 - cam.cy) * cam.scale + canvas.height / 2;
  return { x: rect.left + fbx / dpr, y: rect.top + fby / dpr };
});
await page.mouse.click(clickPt.x, clickPt.y);
await page.waitForTimeout(1500);
const afterClick = await snap();

console.log("before:      ", before);
console.log(
  "after DRAG:  ",
  afterDrag,
  "(should: panned, inSpawn still true, tiles 0)",
);
console.log("after CLICK: ", afterClick, "(should: inSpawn false, tiles > 0)");
const panned =
  afterDrag.cam.cx !== before.cam.cx || afterDrag.cam.cy !== before.cam.cy;
console.log("RESULT:", {
  noToolButtons: !before.hasPanBtn,
  dragPanned: panned,
  dragDidNotSpawn: afterDrag.inSpawn === true && afterDrag.tiles === 0,
  clickSpawned: afterClick.inSpawn === false && afterClick.tiles > 0,
});
await page.screenshot({ path: "/tmp/openfront-run/input-model.png" });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
