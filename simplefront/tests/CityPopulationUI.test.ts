import { CityPopulationDemo } from "../src/demos/city-population/CityPopulationDemo";
import { PRESETS } from "../src/demos/city-population/presets";
import { encodeScenario } from "../src/demos/city-population/scenario";
import { DemoGallery } from "../src/demos/DemoGallery";

let demo: CityPopulationDemo;
async function click(selector: string) {
  demo.querySelector<HTMLButtonElement>(selector)!.click();
  await demo.updateComplete;
}
async function input(key: string, value: string) {
  const control = demo.querySelector<HTMLInputElement>(
    `[data-config="${key}"]`,
  )!;
  control.value = value;
  control.dispatchEvent(new Event("input"));
  await demo.updateComplete;
}
beforeEach(async () => {
  demo = new CityPopulationDemo();
  document.body.append(demo);
  await demo.updateComplete;
});
afterEach(() => {
  demo.remove();
  vi.useRealTimers();
});

it("provides a third gallery destination without removing the first two", async () => {
  const gallery = new DemoGallery();
  document.body.append(gallery);
  await gallery.updateComplete;
  for (const hash of ["urban-growth", "city-demand", "city-population"])
    expect(gallery.querySelector(`a[href="#${hash}"]`)).not.toBeNull();
  gallery.remove();
  expect(demo.querySelector("h1")?.textContent).toContain(
    "Population-led city",
  );
});
it("previews endpoint changes immediately but only applies them on restart", async () => {
  expect(demo.querySelectorAll("[data-fertility-level]")).toHaveLength(12);
  expect(
    demo
      .querySelector('[data-fertility-level="1"]')
      ?.getAttribute("data-births"),
  ).toBe("4.5");
  await input("lowerLevel", "3");
  await input("upperLevel", "15");
  await input("lowerLevelBirths", "5");
  await input("upperLevelBirths", "2");
  expect(
    demo
      .querySelector('[data-fertility-level="9"]')
      ?.getAttribute("data-births"),
  ).toBe("3.5");
  expect(demo.model!.config.upperLevel).toBe(10);
  await click("[data-apply-settings]");
  expect(demo.model!.config.upperLevel).toBe(15);
  expect(demo.model!.stats().meanFertility).toBe(5);
  expect(demo.model!.stats().seconds).toBe(0);
});
it("rejects overlapping boundaries without destroying the active run", async () => {
  await click("[data-step]");
  const active = demo.model;
  await input("lowerLevel", "10");
  expect(demo.querySelector("[data-gradient-error]")).not.toBeNull();
  await click("[data-apply-settings]");
  expect(demo.querySelector('[role="alert"]')?.textContent).toContain(
    "must exceed",
  );
  expect(demo.model).toBe(active);
  expect(demo.model!.stats().seconds).toBe(0.25);
});
it("retains original presets, terrain editing, overlays, legend and maturation preference", async () => {
  expect(
    [...demo.querySelectorAll<HTMLOptionElement>("[data-preset] option")].map(
      (e) => e.value,
    ),
  ).toEqual(PRESETS.map((p) => p.id));
  expect(demo.querySelector('[data-legend-level="1"]')?.textContent).toBe("1");
  expect(demo.querySelector('option[value="candidates"]')).not.toBeNull();
  await input("densify", "1");
  await click("[data-apply-settings]");
  expect(demo.model!.config.densify).toBe(1);
  await click("[data-edit]");
  demo.paintTerrain(1000, "raise");
  await click("[data-cancel-terrain]");
  expect(demo.scenario.terrain.height[1000]).toBe(0.5);
});
it("shows per-tile fertility alongside levels and upgrade support", async () => {
  const map = demo.querySelector<HTMLCanvasElement>("[data-map]")!;
  vi.spyOn(map, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 640),
  );
  map.dispatchEvent(
    new MouseEvent("pointermove", { clientX: 325, clientY: 325 }),
  );
  await demo.updateComplete;
  expect(demo.querySelector("[data-tile-fertility]")?.textContent?.trim()).toBe(
    "4.50",
  );
  expect(
    demo.querySelector("[data-tile-development]")?.textContent?.trim(),
  ).toBe("0%");
  expect(demo.querySelector("[data-upgrade-support]")?.textContent).toContain(
    "0 / 4",
  );
  expect(demo.querySelector("[data-housing-pressure]")?.textContent).toContain(
    "0%",
  );
});
it("preserves housing after casualties, recovers and round-trips the new settings", async () => {
  for (let i = 0; i < 200; i++) demo.model!.step();
  const housing = demo.model!.stats().capacity;
  await click("[data-empty]");
  expect(demo.model!.stats().capacity).toBe(housing);
  await click("[data-step]");
  expect(demo.model!.stats().population).toBeGreaterThan(0);
  const saved = encodeScenario(demo.scenario);
  demo.importText(saved);
  await demo.updateComplete;
  expect(demo.model!.stats().seconds).toBe(0);
  expect(demo.model!.config.targetOccupancy).toBe(0.85);
});
it("stops when removed and keeps homepage and gallery navigation", async () => {
  expect(
    demo
      .querySelector('a[aria-label="Back to homepage"]')
      ?.getAttribute("href"),
  ).toBe("/");
  expect(demo.querySelector('nav a[href="#"]')).not.toBeNull();
  vi.useFakeTimers();
  await click("[data-play]");
  demo.remove();
  vi.advanceTimersByTime(1000);
  expect(demo.running).toBe(false);
  expect(demo.model!.stats().seconds).toBe(0);
});
