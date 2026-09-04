// Fallback path: block elevation.bin so derivation cannot run — the shell
// must show the baked terrain and a visible status, and stay functional.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/tmp/openfront-run", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.route("**/elevation.bin", (route) => route.abort());

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const text = document.querySelector("game-shell-page")?.textContent ?? "";
    return (
      text.includes("zoom") &&
      !text.includes("Loading") &&
      !/zoom 1×/.test(text)
    );
  },
  { timeout: 180000 },
);
await page.waitForTimeout(800);
const text = await page.evaluate(
  () => document.querySelector("game-shell-page")?.textContent ?? "",
);
const fellBack = /derivation failed|baked terrain/.test(text);
console.log(`fallback status shown: ${fellBack}`);
if (!fellBack) console.log(`  text: ${text.slice(0, 300)}`);
await page.screenshot({ path: "/tmp/openfront-run/derived-7-fallback.png" });
await browser.close();
process.exit(fellBack ? 0 : 1);
