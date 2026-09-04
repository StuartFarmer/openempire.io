// Drive the flow CA: plant a farm, settle people next to it, run, and LOOK.
// The scalars alone proved nothing about whether the pattern is believable.
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("CONSOLE: " + m.text());
});
await page.goto("http://localhost:9000/#shell", { waitUntil: "load" });
await page.waitForTimeout(6000);

await page.locator('select:has(option[value="flow"])').first().selectOption("flow");
await page.waitForTimeout(9000);

// Dump every select's options so the view picker is targeted, not guessed.
const selects = await page.evaluate(() =>
  [...document.querySelectorAll("select")].map((s, i) => ({
    i,
    value: s.value,
    options: [...s.options].map((o) => o.value),
  })),
);
const viewSel = selects.find((s) => s.options.some((o) => o.includes("flow") && o !== "flow"));
console.log("view options:", viewSel ? viewSel.options.join(", ") : "NOT FOUND");
if (viewSel) {
  const target = viewSel.options.find((o) => o.endsWith("flow"));
  await page.locator("select").nth(viewSel.i).selectOption(target);
  console.log("selected view:", target);
  await page.waitForTimeout(2000);
}

const canvas = page.locator("canvas").first();
const box = await canvas.boundingBox();
const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
const pickBrush = async (name) => {
  const sel = page.locator(`select:has(option[value="${name}"])`).last();
  if ((await sel.count()) > 0) await sel.selectOption(name);
};
await page.getByRole("button", { name: /brush/i }).click().catch(() => {});
await page.waitForTimeout(400);

// A farm, and settlers beside it — the original game's two acts.
await pickBrush("settle");
for (const p of [[0.45, 0.5]]) {
  await page.mouse.click(...at(...p));
  await page.waitForTimeout(200);
}

const scalars = () =>
  page.evaluate(() => {
    const o = {};
    for (const m of document.body.innerText.matchAll(/(totalPop|totalFood|peakPop|totalField|peakZone)\s+([\d.,]+)/g)) o[m[1]] = m[2];
    return o;
  });
console.log("seeded:", JSON.stringify(await scalars()));
// Turbo, so a full 192-year game is watchable.
await page.locator('input[type="checkbox"]').first().check().catch(() => {});
await page.getByRole("button", { name: /^Play$/ }).click().catch(() => {});
const tickNow = () =>
  page.evaluate(() => Number((document.body.innerText.match(/tick\s+(\d+)/) ?? [0, 0])[1]));
for (const wait of [10000, 30000, 60000, 60000]) {
  await page.waitForTimeout(wait);
  console.log(`tick ${await tickNow()}:`, JSON.stringify(await scalars()));
}
const tick = await page.evaluate(() => (document.body.innerText.match(/tick\s+(\d+)/) ?? [])[1]);
console.log("tick:", tick, "| errors:", errs.length ? errs.slice(0, 3) : "none");
await page.screenshot({ path: "/tmp/flow.png" });
await browser.close();
