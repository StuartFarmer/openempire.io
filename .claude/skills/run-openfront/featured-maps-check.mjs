// Verify: Single Player map picker shows all nine maps as Featured, no World.
import { gotoHome, launch, openSoloModal } from "./driver.mjs";

const { browser, page } = await launch();
await gotoHome(page);
await openSoloModal(page);

const state = await page.evaluate(() => {
  const picker = document.querySelector("map-picker");
  const grid = [...picker.querySelectorAll("[data-map-id], .map-card")];
  // Fall back to reading the registry the picker rendered from.
  return {
    selectedMap: picker?.selectedMap,
    activeTab: picker?.activeTab,
    cardTexts: [...picker.querySelectorAll("button, div")]
      .map((el) => el.getAttribute?.("aria-label") || "")
      .filter(Boolean)
      .slice(0, 30),
    html: picker?.innerHTML.length,
  };
});
console.log("picker state:", JSON.stringify(state, null, 2));

// Ground truth from the generated registry as the page sees it.
const registry = await page.evaluate(async () => {
  const mod = await import("/src/core/game/Maps.gen.ts");
  return {
    featured: mod.maps
      .filter((m) => m.categories.includes("featured"))
      .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999))
      .map((m) => `${m.featuredRank}: ${m.type}`),
    hasWorld: mod.maps.some((m) => m.id === "World"),
  };
});
console.log("registry:", JSON.stringify(registry, null, 2));

// Visible text of the featured grid (map names rendered on cards).
const names = await page.evaluate(() => {
  const picker = document.querySelector("map-picker");
  return picker.innerText;
});
console.log("picker text:", names.replaceAll("\n", " | "));

await page.screenshot({
  path: "/tmp/openfront-run/featured-maps.png",
  fullPage: false,
});
await browser.close();
