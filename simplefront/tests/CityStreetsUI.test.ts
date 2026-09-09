import { CityPopulationDemo } from "../src/demos/city-population/CityPopulationDemo";
import { mapPoint, zoomCamera } from "../src/demos/city-population/camera";

it("maps zoomed and panned pointer positions back to world tiles", () => {
  expect(mapPoint(0.5, 0.5, { x: 20, y: 30, zoom: 4 }, 64)).toEqual({
    x: 20,
    y: 30,
  });
  expect(mapPoint(0, 0, { x: 20, y: 30, zoom: 4 }, 64)).toEqual({
    x: 12,
    y: 22,
  });
  expect(zoomCamera({ x: 1, y: 63, zoom: 4 }, 1, 64)).toEqual({
    x: 32,
    y: 32,
    zoom: 1,
  });
});

let demo: CityPopulationDemo;
beforeEach(async () => {
  demo = new CityPopulationDemo();
  document.body.append(demo);
  await demo.updateComplete;
});
afterEach(() => demo.remove());
async function click(selector: string) {
  demo.querySelector<HTMLButtonElement>(selector)!.click();
  await demo.updateComplete;
}
async function setAge(index: number, value: string) {
  const input = demo.querySelector<HTMLInputElement>(
    `[data-age-boundary="${index}"]`,
  )!;
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await demo.updateComplete;
}
it("recolours existing tiles live without changing the simulation", async () => {
  const m = demo.model!;
  for (let i = 0; i < 1200; i++) m.step();
  demo.requestUpdate();
  await demo.updateComplete;
  const before = m.stats(),
    housing = m.capacity.slice();
  const ctx = demo
    .querySelector<HTMLCanvasElement>("[data-map]")!
    .getContext("2d")!;
  const colours: string[] = [];
  const spy = vi.spyOn(ctx, "fillRect").mockImplementation(() => {
    colours.push(String(ctx.fillStyle));
  });
  demo.requestUpdate();
  await demo.updateComplete;
  const oldColours = [...colours];
  colours.length = 0;
  await setAge(1, "4");
  expect(colours.length).toBe(oldColours.length);
  expect(colours).not.toEqual(oldColours);
  expect(demo.querySelector('[data-age-style="4"]')?.textContent).toContain(
    "Middle Ages",
  );
  expect(demo.model).toBe(m);
  expect(m.stats()).toEqual(before);
  expect(m.capacity).toEqual(housing);
  spy.mockRestore();
});
it("keeps the last valid palette while age inputs are invalid and can restore defaults", async () => {
  await setAge(1, "4");
  for (const invalid of ["", "5", "4.5", "0", "101"]) {
    await setAge(1, invalid);
    expect(demo.querySelector("[data-age-error]")?.textContent).toBeTruthy();
    expect(demo.querySelector('[data-age-style="4"]')?.textContent).toContain(
      "Middle Ages",
    );
  }
  const m = demo.model!;
  await click("[data-age-defaults]");
  expect(demo.querySelector("[data-age-error]")).toBeNull();
  expect(
    demo.querySelector<HTMLInputElement>('[data-age-boundary="1"]')!.value,
  ).toBe("3");
  expect(demo.querySelector('[data-age-style="3"]')?.textContent).toContain(
    "Middle Ages",
  );
  expect(demo.model).toBe(m);
});
it("retains custom age boundaries when restarting a scenario", async () => {
  await setAge(5, "100");
  await click("[data-reset]");
  expect(demo.querySelector('[data-age-style="100"]')?.textContent).toContain(
    "Post-modern",
  );
  expect(
    demo.querySelector<HTMLInputElement>('[data-age-boundary="5"]')!.value,
  ).toBe("100");
});
it("offers streets and buildings while retaining every diagnostic view", () => {
  expect(demo.querySelector('option[value="streets"]')).not.toBeNull();
  for (const view of [
    "combined",
    "density",
    "elevation",
    "suitability",
    "candidates",
  ])
    expect(demo.querySelector(`option[value="${view}"]`)).not.toBeNull();
  expect(
    demo.querySelector('[aria-label="Show level numbers"]'),
  ).not.toBeNull();
  expect(demo.querySelectorAll("[data-age-style]")).toHaveLength(6);
  expect(demo.querySelector('[data-age-style="5"]')?.textContent).toContain(
    "Classical",
  );
});
it("changes the camera and visual street settings without resetting or changing the city", async () => {
  await click("[data-step]");
  const m = demo.model!,
    before = m.stats(),
    housing = m.capacity.slice();
  await click("[data-zoom-in]");
  expect(demo.querySelector("[data-zoom-value]")?.textContent).toContain("2×");
  const input = demo.querySelector<HTMLInputElement>(
    '[data-street-setting="branching"]',
  )!;
  input.value = ".9";
  input.dispatchEvent(new Event("input"));
  await demo.updateComplete;
  await click("[data-restyle]");
  expect(demo.model).toBe(m);
  expect(m.stats()).toEqual(before);
  expect(m.capacity).toEqual(housing);
  await click("[data-zoom-reset]");
  expect(demo.querySelector("[data-zoom-value]")?.textContent).toContain("1×");
});
it("does not relocate the city when dragging to pan a zoomed map", async () => {
  await click("[data-zoom-in]");
  const m = demo.model!;
  const canvas = demo.querySelector<HTMLCanvasElement>("[data-map]")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 640),
  );
  canvas.setPointerCapture = () => {};
  canvas.dispatchEvent(
    new MouseEvent("pointerdown", { button: 0, clientX: 320, clientY: 320 }),
  );
  canvas.dispatchEvent(
    new MouseEvent("pointermove", { clientX: 420, clientY: 320 }),
  );
  canvas.dispatchEvent(
    new MouseEvent("pointerup", { clientX: 420, clientY: 320 }),
  );
  await demo.updateComplete;
  expect(demo.model).toBe(m);
  expect(m.stats().seconds).toBe(0);
});
it("updates the same visual layout as the simulation grows, even in another view", async () => {
  const view = demo.querySelector<HTMLSelectElement>(
    '[aria-label="Map view"]',
  )!;
  view.value = "density";
  view.dispatchEvent(new Event("change"));
  await demo.updateComplete;
  const m = demo.model!;
  for (let i = 0; i < 120; i++) {
    m.changePopulation(1e9);
    await click("[data-step]");
  }
  view.value = "streets";
  view.dispatchEvent(new Event("change"));
  await demo.updateComplete;
  expect(demo.model).toBe(m);
  expect(demo.querySelector("[data-street-count]")?.textContent).not.toBe("0");
  await click("[data-reset]");
  expect(demo.model).not.toBe(m);
  expect(demo.model!.stats().area).toBe(1);
});
