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
await page.waitForFunction(
  () => {
    const t = document.querySelector("game-shell-page")?.textContent ?? "";
    return t.includes("zoom") && !t.includes("Loading") && !/zoom 1×/.test(t);
  },
  { timeout: 120000 },
);
await page.waitForTimeout(1000);
// Terrain: the pristine baked tiles.
await page.screenshot({ path: "/tmp/openfront-run/revert-terrain.png" });

// Temperature: live, sweeping — capture at two points in the year.
await page.selectOption("game-shell-page select >> nth=1", "temperature");
const waitWeek = (w) =>
  page.waitForFunction(
    (target) =>
      Number(
        (document.querySelector("game-shell-page")?.textContent ?? "").match(
          /week (\d+)/,
        )?.[1] ?? "0",
      ) >= target,
    w,
    { timeout: 120000 },
  );
await waitWeek(13);
await page.screenshot({ path: "/tmp/openfront-run/revert-temp-summer.png" });
await waitWeek(39);
await page.screenshot({ path: "/tmp/openfront-run/revert-temp-winter.png" });
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
