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
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});
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
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/openfront-run/parity-1-handwired.png" });
// Toggle to the terrain SYSTEM derivation.
await page.evaluate(() => document.querySelector("#shell-canvas")?.focus());
await page.keyboard.press("y");
await page.waitForTimeout(1500);
const status = await page.evaluate(() =>
  document.querySelector("game-shell-page")?.textContent?.includes("SYSTEM"),
);
await page.screenshot({ path: "/tmp/openfront-run/parity-2-system.png" });
console.log("system-active status shown:", status);
console.log(
  errors.length ? "ERRORS:\n" + errors.slice(0, 5).join("\n") : "no errors",
);
await browser.close();
