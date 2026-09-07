import { CityDemandDemo } from "../src/demos/city-demand/CityDemandDemo";
import { PRESETS } from "../src/demos/urban-growth/presets";
let demo: CityDemandDemo;
async function click(s: string) {
  demo.querySelector<HTMLButtonElement>(s)!.click();
  await demo.updateComplete;
}
beforeEach(async () => {
  demo = new CityDemandDemo();
  document.body.append(demo);
  await demo.updateComplete;
});
afterEach(() => {
  demo.remove();
  vi.useRealTimers();
});
it("retains the six original presets and terrain, import and overlay controls", () => {
  expect(
    [...demo.querySelectorAll<HTMLSelectElement>("[data-preset] option")].map(
      (e) => e.value,
    ),
  ).toEqual(PRESETS.map((p) => p.id));
  for (const s of [
    "[data-edit]",
    'option[value="suitability"]',
    'option[value="candidates"]',
    '[aria-label="Import scenario JSON"]',
  ])
    expect(demo.querySelector(s)).not.toBeNull();
  expect(demo.querySelector('[data-config="ceiling"]')).toBeNull();
});
it("starts paused, steps, and restarts", async () => {
  expect(demo.running).toBe(false);
  await click("[data-step]");
  expect(demo.model!.stats().seconds).toBe(0.25);
  await click("[data-reset]");
  expect(demo.model!.stats().seconds).toBe(0);
});
it("shows a numbered legend for the levels present and updates it after growth", async () => {
  expect(
    [...demo.querySelectorAll("[data-legend-level]")].map((e) =>
      e.textContent?.trim(),
    ),
  ).toEqual(["1"]);
  for (
    let step = 0;
    step < 1000 && demo.model!.level(demo.model!.centre) < 2;
    step++
  )
    demo.model!.step();
  demo.requestUpdate();
  await demo.updateComplete;
  expect(
    demo.querySelector('[data-legend-level="2"]')?.textContent?.trim(),
  ).toBe("2");
  await click("[data-reset]");
  expect(demo.querySelector('[data-legend-level="2"]')).toBeNull();
});
it("restores the original maturation slider and draft/apply workflow", async () => {
  const input = demo.querySelector<HTMLInputElement>(
    '[data-config="densify"]',
  )!;
  input.value = "1";
  input.dispatchEvent(new Event("input"));
  await demo.updateComplete;
  expect(demo.model!.config.densify).toBe(0.65);
  await click("[data-apply-settings]");
  expect(demo.model!.config.densify).toBe(1);
  for (let i = 0; i < 20; i++) demo.model!.step();
  expect(demo.model!.stats().area).toBe(2);
  expect(demo.model!.level(demo.model!.centre)).toBe(1);
});
it("shows how many cardinal neighbours support the hovered tile's upgrade", async () => {
  const map = demo.querySelector<HTMLCanvasElement>("[data-map]")!;
  vi.spyOn(map, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 640),
  );
  map.dispatchEvent(
    new MouseEvent("pointermove", { clientX: 325, clientY: 325 }),
  );
  await demo.updateComplete;
  expect(demo.querySelector("[data-upgrade-support]")?.textContent).toContain(
    "0 / 4",
  );
  for (let step = 0; step < 1000; step++) {
    if (
      demo
        .model!.candidates()
        .some((c) => c.tile === demo.model!.centre && c.kind === "densify")
    )
      break;
    demo.model!.step();
  }
  demo.requestUpdate();
  await demo.updateComplete;
  expect(demo.querySelector("[data-upgrade-support]")?.textContent).toContain(
    "4 / 4",
  );
});
it("preserves terrain editing, cancellation and submerging the centre", async () => {
  await click("[data-edit]");
  demo.paintTerrain(1000, "raise");
  await click("[data-cancel-terrain]");
  expect(demo.scenario.terrain.height[1000]).toBe(0.5);
  await click("[data-edit]");
  demo.paintTerrain(demo.model!.centre, "water");
  await click("[data-apply-terrain]");
  expect(demo.model).toBeNull();
  demo.placeCentre(100);
  expect(demo.model!.centre).toBe(100);
});
it("population shocks preserve development and recovery fills vacancies", async () => {
  for (let i = 0; i < 400; i++) demo.model!.step();
  const before = demo.model!.stats();
  await click("[data-casualties]");
  expect(demo.model!.stats().capacity).toBe(before.capacity);
  expect(demo.model!.stats().population).toBeCloseTo(before.population * 0.5);
  await click("[data-step]");
  expect(demo.model!.stats().capacity).toBe(before.capacity);
});
it("stops on removal and retains both navigation exits", async () => {
  expect(
    demo
      .querySelector('a[aria-label="Back to homepage"]')
      ?.getAttribute("href"),
  ).toBe("/");
  expect(demo.querySelector('nav a[href="#"]')).not.toBeNull();
  vi.useFakeTimers();
  await click("[data-play]");
  demo.remove();
  const t = demo.model!.stats().seconds;
  vi.advanceTimersByTime(1000);
  expect(demo.running).toBe(false);
  expect(demo.model!.stats().seconds).toBe(t);
});
