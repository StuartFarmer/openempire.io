import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
const loaded = () =>
  page.waitForFunction(
    () => {
      const t = document.querySelector("game-shell-page")?.textContent ?? "";
      return t.includes("zoom") && !t.includes("Loading") && !/zoom 1×/.test(t);
    },
    { timeout: 120000 },
  );
await loaded();
await page.waitForTimeout(500);

// Zoom in a bit so we can confirm camera persists across layer switches.
const box = await page.locator("#shell-canvas").boundingBox();
await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.35);
for (let i = 0; i < 5; i += 1) {
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(50);
}
await page.waitForTimeout(300);
const zoomBefore = await page.evaluate(
  () =>
    (document.querySelector("game-shell-page")?.textContent ?? "").match(
      /zoom [\d.]+×/,
    )?.[0],
);

for (const view of ["elevation", "temperature", "water", "crop"]) {
  await page.selectOption("game-shell-page select >> nth=1", view);
  await page.waitForFunction(
    () =>
      !(document.querySelector("game-shell-page")?.textContent ?? "").includes(
        "Loading",
      ),
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/openfront-run/shell-layer-${view}.png` });
}
const zoomAfter = await page.evaluate(
  () =>
    (document.querySelector("game-shell-page")?.textContent ?? "").match(
      /zoom [\d.]+×/,
    )?.[0],
);
console.log("zoom before/after switches:", zoomBefore, zoomAfter);

// 'n' cycles.
await page.keyboard.press("n");
await page.waitForTimeout(1200);
const viewNow = await page.evaluate(
  () => document.querySelectorAll("game-shell-page select")[1]?.value,
);
console.log("after n key:", viewNow);
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
