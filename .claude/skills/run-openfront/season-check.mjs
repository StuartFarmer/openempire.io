// Verify real seasonal continentality: hover Siberia vs Ireland (same latitude)
// at two points in the year — Siberia must swing far more than Ireland.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({
  headless: true, channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForFunction(() => {
  const t = document.querySelector("game-shell-page")?.textContent ?? "";
  return t.includes("zoom") && !t.includes("Loading") && !t.includes("Deriving") && !/zoom 1×/.test(t);
}, { timeout: 180000 });
await page.waitForTimeout(600);

// Read temp at a map coord by forcing tickCount (year phase) then hovering center.
const readTemp = async (cx, cy, tick) => {
  await page.evaluate(([cx, cy, tick]) => {
    const el = document.querySelector("game-shell-page");
    el.camera = { cx, cy, scale: 6 };
    el.tickCount = tick; // force year phase
  }, [cx, cy, tick]);
  await page.waitForTimeout(200);
  await page.mouse.move(800, 500);
  await page.waitForTimeout(200);
  const rows = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("game-shell-page .font-mono")].pop();
    if (!panel) return {};
    const out = {};
    for (const d of panel.querySelectorAll("div")) {
      const sp = d.querySelectorAll("span");
      if (sp.length === 2) out[sp[0].textContent.trim()] = sp[1].textContent.trim();
    }
    return out;
  });
  return rows;
};
// EarthXL 4096x2048. yearTicks=520. Jan≈phase0 → tick 0; Jul≈phase0.5 → tick 260.
// Siberia (Yakutsk ~62N,129E): x=(129+180)/360*4096=3516, y=(90-62)/180*2048=318.
// Ireland (~53N,-8E): x=(-8+180)/360*4096=1957, y=(90-53)/180*2048=421.
for (const [name, cx, cy] of [["Siberia", 3516, 318], ["Ireland", 1957, 421]]) {
  const jan = await readTemp(cx, cy, 0);
  const jul = await readTemp(cx, cy, 260);
  const pj = parseFloat(jan.temp), pl = parseFloat(jul.temp);
  console.log(`${name}: Jan ${jan.temp}  Jul ${jul.temp}  swing ${(pl-pj).toFixed(1)}°C  mean ${jan.temp?.match(/mean ([\d.-]+)/)?.[1]}`);
}
await page.screenshot({ path: "/tmp/openfront-run/season.png" });
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
