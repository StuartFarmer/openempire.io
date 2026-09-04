// Verify the LeanFront fork of the openfront system: it appears in the #shell
// picker, its cloned WESL (layers/*.wesl + views/leanfront.wesl) compiles, the
// live CPU sim starts on the same maps, and the game ticks + renders.
// NOTE: #shell has TWO <game-shell-page> elements — the front page's ambient
// backdrop and the real fullscreen shell. Everything below targets the latter.
import { chromium } from "playwright";

const SHELL = "game-shell-page:not([ambient])";

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
const consoleErrs = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrs.push(m.text());
});

const shellText = () =>
  page.evaluate(
    (sel) =>
      document.querySelector(sel)?.textContent.replace(/\s+/g, " ") ?? "",
    SHELL,
  );
const week = async () => (await shellText()).match(/week (\d+)/)?.[1];

await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(
  (sel) => /week \d+/.test(document.querySelector(sel)?.textContent ?? ""),
  SHELL,
  { timeout: 90000 },
);

const systems = await page.evaluate(
  (sel) =>
    [...document.querySelector(sel).querySelectorAll("select")[0].options].map(
      (o) => o.value,
    ),
  SHELL,
);
console.log("systems:", systems.join(", "));

// Switch to LeanFront: destroys the sim, remounts the cloned system, restarts
// the worker on the fork's default map.
await page.selectOption(`${SHELL} select >> nth=0`, "leanfront");
await page.waitForFunction(
  (sel) => /week \d+/.test(document.querySelector(sel)?.textContent ?? ""),
  SHELL,
  { timeout: 90000 },
);
await page.waitForTimeout(4000);

const state = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const sels = el.querySelectorAll("select");
  return {
    system: sels[0].value,
    map: sels[1].value,
    views: [...sels[2].options].map((o) => o.value),
  };
}, SHELL);
console.log("selected system:", state.system, "| map:", state.map);
console.log("views:", state.views.join(", "));

const w1 = await week();
await page.waitForTimeout(12000);
const w2 = await week();
console.log(`ticking: week ${w1} -> ${w2}`);
await page.screenshot({ path: "/tmp/openfront-run/leanfront.png" });

const canvasOk = await page.evaluate(() => {
  const c = document.querySelector("#shell-canvas");
  return !!c && c.width > 0 && c.height > 0;
});
console.log("canvas ok:", canvasOk);
console.log("page errors:", errors.length ? errors : "none");
console.log(
  "console errors:",
  consoleErrs.length ? consoleErrs.slice(0, 10) : "none",
);
await browser.close();
