import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 300)); });

const boot = async (p) => {
  await p.goto("http://localhost:9000/#shell", { waitUntil: "load" });
  await p.waitForFunction(() => {
    const el = document.querySelector("game-shell-page");
    return !!el && !!el.worker && (el.tickCount ?? 0) > 0;
  }, { timeout: 150000 });
  await p.waitForTimeout(2000);
};
await boot(page);

// 1 & 2: defaults
console.log("DEFAULTS:", JSON.stringify(await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  const sels = [...document.querySelectorAll("game-shell-page select")].map(s => s.value);
  return { systemId: el.systemId, mapKey: el.mapKey, selects: sels.slice(0, 2) };
})));

// 3: restart button present & works
const hasRestart = await page.evaluate(() =>
  [...document.querySelectorAll("game-shell-page button")].some(b => b.textContent.trim() === "restart"));
console.log("restart button present:", hasRestart);
if (hasRestart) {
  const before = await page.evaluate(() => document.querySelector("game-shell-page").tickCount);
  await page.evaluate(() => [...document.querySelectorAll("game-shell-page button")]
    .find(b => b.textContent.trim() === "restart").click());
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => {
    const el = document.querySelector("game-shell-page");
    return { tick: el.tickCount, centeredOnSpawn: el.centeredOnSpawn, maskFade: el.paramValues.maskFade ?? 0 };
  });
  console.log(`restart: tick ${before} → ${after.tick} (reset=${after.tick < before}), centeredOnSpawn=${after.centeredOnSpawn}, maskFade=${after.maskFade}`);
}

// 4: climate persistence across a reload
await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  el.showKnobs = true;
  el.setKnob("latitudeEffect", 0.42);
  el.tilt = 11.5; el.persistClimate();
});
await page.waitForTimeout(600);
const stored = await page.evaluate(() => localStorage.getItem("openfront.shell.climate"));
console.log("stored after edit:", stored);
await boot(page);   // full reload
console.log("AFTER RELOAD:", JSON.stringify(await page.evaluate(() => {
  const el = document.querySelector("game-shell-page");
  return { latitudeEffect: el.derivedConfig?.latitudeEffect, tilt: el.tilt };
})));

// 5: export json
await page.evaluate(() => (document.querySelector("game-shell-page").showKnobs = true));
await page.waitForTimeout(400);
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
  page.evaluate(() => {
    const b = [...document.querySelectorAll("game-shell-page button")].find(x => x.textContent.trim() === "export json");
    if (b) b.click();
  }),
]);
if (dl) {
  const fs = await import("fs");
  const path = await dl.path();
  console.log("downloaded:", dl.suggestedFilename());
  console.log(fs.readFileSync(path, "utf8"));
} else {
  console.log("export json: NO DOWNLOAD");
}
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
