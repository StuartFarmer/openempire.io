// Does opening the shell's panels cost frames? The climate panel carries the
// ~200-row "game mechanics" knob list, and every worker frame sets @state on
// the page, so an open panel is re-rendered at the sim's tick rate. Measures
// fps with panels closed, with stats open, and with climate+knobs open.
import { chromium } from "playwright";

const SHELL = "game-shell-page:not([ambient])";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const MAP = arg("map", "SPQR");

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.addInitScript(() => {
  window.__frames = 0;
  const t = () => {
    window.__frames += 1;
    requestAnimationFrame(t);
  };
  requestAnimationFrame(t);
});
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  (s) => /week \d+/.test(document.querySelector(s)?.textContent ?? ""),
  SHELL,
  { timeout: 120000 },
);
await page.selectOption(`${SHELL} select >> nth=1`, MAP);
await page.waitForTimeout(25000);

const box = await page.locator(`${SHELL} #shell-canvas`).boundingBox();
for (let i = 0; i < 16; i += 1) {
  const a = (i / 16) * Math.PI * 2;
  await page.mouse.click(
    box.x + box.width / 2 + Math.cos(a) * 60 * (1 + i / 6),
    box.y + box.height / 2 + Math.sin(a) * 60 * (1 + i / 6),
  );
  await page.waitForTimeout(900);
}
await page
  .locator(`${SHELL} input[type=checkbox]`)
  .first()
  .check()
  .catch(() => {});
// Let a real game develop before measuring.
await page.waitForTimeout(45000);

const fps = async (label) => {
  const b = await page.evaluate(() => window.__frames);
  const t0 = Date.now();
  await page.waitForTimeout(6000);
  const a = await page.evaluate(() => window.__frames);
  const tick = await page.evaluate(
    (s) =>
      document
        .querySelector(s)
        ?.textContent.replace(/\s+/g, " ")
        .match(/tick (\d+)/)?.[1],
    SHELL,
  );
  console.log(
    `${label.padEnd(22)} fps=${(((a - b) / (Date.now() - t0)) * 1000).toFixed(1)} tick=${tick}`,
  );
};

await fps("panels closed");
await page.click(`${SHELL} button:has-text("stats")`).catch(() => {});
await fps("stats open");
await page.click(`${SHELL} button:has-text("climate")`).catch(() => {});
await fps("stats + climate/knobs");
const knobRows = await page.evaluate(
  (s) => document.querySelectorAll(`${s} input[type=number]`).length,
  SHELL,
);
console.log("number inputs rendered:", knobRows);
await page.screenshot({ path: "/tmp/openfront-run/shell-panels.png" });
await browser.close();
