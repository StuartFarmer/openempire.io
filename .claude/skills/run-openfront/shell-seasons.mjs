import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const t = document.querySelector("game-shell-page")?.textContent ?? "";
    return t.includes("zoom") && !t.includes("Loading") && !/zoom 1×/.test(t);
  },
  { timeout: 120000 },
);
const weekOf = () =>
  page.evaluate(() =>
    Number(
      (document.querySelector("game-shell-page")?.textContent ?? "").match(
        /week (\d+)/,
      )?.[1] ?? "0",
    ),
  );
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
await waitWeek(13); // northern summer
await page.screenshot({ path: "/tmp/openfront-run/shell-summer.png" });
console.log("summer week", await weekOf());
await waitWeek(39); // northern winter
await page.screenshot({ path: "/tmp/openfront-run/shell-winter.png" });
console.log("winter week", await weekOf());
await browser.close();
