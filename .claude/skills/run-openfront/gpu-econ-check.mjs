// Does the GPU economy actually build and dispatch inside the SHIPPING sim
// worker, for leanfront and only for leanfront?
import { chromium } from "playwright";
const SHELL = "game-shell-page:not([ambient])";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const RULESET = arg("ruleset", "leanfront");
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const logs = [];
page.on("console", (m) => { const t = m.text(); if (t.includes("leanfront")) logs.push(t); });
page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction((s) => /week \d+/.test(document.querySelector(s)?.textContent ?? ""), SHELL, { timeout: 120000 });
// Ruleset picker is the first <select>; map is the second.
const selects = page.locator(`${SHELL} select`);
await selects.nth(0).selectOption(RULESET).catch(() => {});
await page.waitForTimeout(20000);
await page.locator(`${SHELL} input[type=checkbox]`).first().check().catch(() => {});
await page.waitForTimeout(30000);
await browser.close();
console.log(`ruleset=${RULESET}`);
console.log(logs.length ? logs.slice(0, 8).join("\n") : "(no leanfront economy logs)");
