import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/tmp/openfront-run", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  errors.push(`CONSOLE[${m.type()}]: ${m.text()}`);
});

await page.goto("http://localhost:9000/#webgpu", { waitUntil: "load" });
await page.waitForTimeout(3000);

const hasGpu = await page.evaluate(() => !!navigator.gpu);
console.log("navigator.gpu:", hasGpu);

// Wait for the first generate to land (gpuMs set) or an error status.
const status = await page
  .waitForFunction(
    () => {
      const el = document.querySelector("webgpu-generator-page");
      if (!el) return null;
      const text = el.textContent ?? "";
      if (text.includes("GPU: —") && !/failed/i.test(text)) return null;
      return text.match(/GPU: [^\n]*/)?.[0] ?? text.slice(0, 200);
    },
    { timeout: 30000 },
  )
  .then((h) => h.jsonValue())
  .catch(() => "TIMEOUT waiting for generation");
console.log("status:", status);

const pageText = await page.evaluate(() =>
  (document.querySelector("webgpu-generator-page")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 400),
);
console.log("page text:", pageText);

// Is the canvas non-black? Read a few pixels via 2d copy.
const pixels = await page.evaluate(() => {
  const src = document.querySelector("#webgpu-canvas");
  if (!src) return "no canvas";
  const copy = document.createElement("canvas");
  copy.width = src.width;
  copy.height = src.height;
  const ctx = copy.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
  let nonBlack = 0;
  const total = copy.width * copy.height;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] > 24) nonBlack += 1;
  }
  return `size=${copy.width}x${copy.height} nonBlackPct=${((nonBlack / total) * 100).toFixed(1)}`;
});
console.log("canvas:", pixels);

await page.screenshot({ path: "/tmp/openfront-run/webgpu-page.png" });
console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
