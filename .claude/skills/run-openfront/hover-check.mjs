import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const t = document.querySelector("game-shell-page")?.textContent ?? "";
    return (
      t.includes("zoom") &&
      !t.includes("Loading") &&
      !t.includes("Deriving") &&
      !/zoom 1×/.test(t)
    );
  },
  { timeout: 180000 },
);
await page.waitForTimeout(600);
// Center a known map coord under the screen center, then move mouse there.
const probe = async (label, cx, cy) => {
  await page.evaluate(
    ([cx, cy]) => {
      document.querySelector("game-shell-page").camera = { cx, cy, scale: 4 };
    },
    [cx, cy],
  );
  await page.waitForTimeout(300);
  // Dispatch a real pointermove at screen center (which maps to cx,cy).
  await page.mouse.move(800, 500);
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => {
    const panel = [
      ...document.querySelectorAll("game-shell-page .font-mono"),
    ].pop();
    if (!panel) return null;
    return [...panel.querySelectorAll("div")].map((d) => d.textContent.trim());
  });
  console.log(`\n${label} (map ${cx},${cy}):`);
  (rows || ["<no panel>"]).forEach((r) => console.log("  " + r));
};
// EarthXL 4096x2048. Sahara ~ (2100, 650); Amazon ~ (1250, 1050); Greenland ~ (1650, 250); mid-Atlantic ~ (1400, 800).
await probe("Sahara", 2100, 640);
await probe("Congo", 2230, 1050);
await probe("Greenland", 1640, 240);
await probe("Atlantic", 1400, 820);
await page.screenshot({ path: "/tmp/openfront-run/hover.png" });
console.log("\n" + (errors.length ? errors.join("\n") : "no page errors"));
await browser.close();
