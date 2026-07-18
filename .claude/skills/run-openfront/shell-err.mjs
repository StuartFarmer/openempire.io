import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage();
const logs = [];
page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForTimeout(7000);
const st = await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  return { status: el?.status, note: el?.derivedNote, ok: el?.derivedOk };
});
console.log("shell state:", JSON.stringify(st));
console.log("--- last logs ---");
for (const l of logs.slice(-14)) console.log("  " + l.slice(0, 300));
await browser.close();
