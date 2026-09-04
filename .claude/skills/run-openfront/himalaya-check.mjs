// Zoom the derived EarthXL terrain onto Tibet/Himalaya to verify relief
// survives (no saturated plateau), plus a Greenland frame for the ice look.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/tmp/openfront-run", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const text = document.querySelector("game-shell-page")?.textContent ?? "";
    return (
      text.includes("zoom") &&
      !text.includes("Loading") &&
      !text.includes("Deriving") &&
      !/zoom 1×/.test(text)
    );
  },
  { timeout: 180000 },
);
await page.waitForTimeout(600);

// Drive the camera directly: center on a map coordinate at a given scale.
const goTo = async (cx, cy, scale) => {
  await page.evaluate(
    ([cx, cy, scale]) => {
      const shell = document.querySelector("game-shell-page");
      shell.camera = { cx, cy, scale };
    },
    [cx, cy, scale],
  );
  await page.waitForTimeout(500);
};

// Tibet/Himalaya: lon 85E lat 32N on a 4096x2048 equirect.
await goTo(3015, 660, 3.2);
await page.screenshot({ path: "/tmp/openfront-run/himalaya-tibet.png" });

// Greenland.
await goTo(1650, 220, 2.5);
await page.screenshot({ path: "/tmp/openfront-run/himalaya-greenland.png" });

console.log("done");
await browser.close();
