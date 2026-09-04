import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("/tmp/openfront-run", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto("http://localhost:9000/#lab", { waitUntil: "load" });
await page.waitForFunction(
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("tick ") && !t.includes("Loading…");
  },
  { timeout: 60000 },
);
await page.waitForTimeout(700);
await page.selectOption("field-lab-page select >> nth=0", "empire");
await page.selectOption("field-lab-page select >> nth=1", "Earth");
await page.waitForFunction(
  () => {
    const t = document.querySelector("field-lab-page")?.textContent ?? "";
    return t.includes("tilesOwned") && !t.includes("Loading…");
  },
  { timeout: 90000 },
);
await page.waitForTimeout(700);
const canvas = page.locator("#lab-canvas");
const box = await canvas.boundingBox();
const paint = async (brush, fx, fy) => {
  await page.selectOption("field-lab-page select >> nth=3", brush);
  await page.waitForTimeout(50);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(80);
};
const seed = async (p, fx, fy) => {
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      await paint("spawnP" + p, fx + dx * 0.01, fy + dy * 0.014);
      await paint("settlers", fx + dx * 0.01, fy + dy * 0.014);
    }
};
await seed(1, 0.224, 0.305); // plains W
await seed(2, 0.252, 0.305); // plains E (adjacent)
const scal = () =>
  page.evaluate(() => {
    const t = (
      document.querySelector("field-lab-page")?.textContent ?? ""
    ).replace(/\s+/g, " ");
    return (
      "owned " +
      t.match(/tilesOwned: \[([^\]]*)\]/)?.[1] +
      " | troops " +
      t.match(/totalTroops: \[([^\]]*)\]/)?.[1]
    );
  });
await page.selectOption("field-lab-page select >> nth=2", "empire");
await page.waitForTimeout(700);
console.log("seed:", await scal());
await page.check("field-lab-page input[type=checkbox]");
await page.click('field-lab-page button:has-text("Play")');
await page.waitForTimeout(5000);
await page
  .locator("#lab-canvas")
  .screenshot({ path: "/tmp/openfront-run/empire-battle.png" });
await page.selectOption("field-lab-page select >> nth=2", "frontline");
await page.waitForTimeout(300);
await page
  .locator("#lab-canvas")
  .screenshot({ path: "/tmp/openfront-run/empire-battle-front.png" });
await page.selectOption("field-lab-page select >> nth=2", "empire");
for (let s = 0; s < 4; s++) {
  await page.waitForTimeout(3500);
  console.log(`t+${(s + 1) * 4}s:`, await scal());
}
await page.click('field-lab-page button:has-text("Pause")');
await page.waitForTimeout(600);
for (const v of ["empire", "population", "troops", "supply", "frontline"]) {
  await page.selectOption("field-lab-page select >> nth=2", v);
  await page.waitForTimeout(350);
  await canvas.screenshot({ path: `/tmp/openfront-run/empire-${v}.png` });
}
console.log(
  errors.length
    ? "PAGEERRORS: " + errors.slice(0, 3).join(" | ")
    : "no page errors",
);
await browser.close();
