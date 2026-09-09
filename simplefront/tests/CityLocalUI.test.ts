import savedPalette from "../docs/city-local-palette.json";
import { CityLocalDemo } from "../src/demos/city-local/CityLocalDemo";
import {
  AGE_STYLES,
  ageAppearance,
  DEFAULT_AGE_LEVELS,
} from "../src/demos/city-local/street-ages";
import { DemoGallery } from "../src/demos/DemoGallery";

it("starts with the approved saved palette and age boundaries", () => {
  expect(AGE_STYLES).toEqual(savedPalette.palettes);
  expect(DEFAULT_AGE_LEVELS).toEqual(savedPalette.ageLevels);
});

it("blends custom age colours without altering the default palettes", () => {
  const styles = AGE_STYLES.map((age) => ({ ...age, houses: [...age.houses] }));
  styles[0].houses[0] = "#000000";
  styles[1].houses[0] = "#ffffff";
  styles[0].road = "#000000";
  styles[1].road = "#ff0000";
  styles[0].ground = "#000000";
  styles[1].ground = "#00ff00";
  const defaults = ageAppearance(2);
  expect(ageAppearance(2, 0, DEFAULT_AGE_LEVELS, styles)).toMatchObject({
    house: "#808080",
    road: "#800000",
    ground: "#008000",
  });
  expect(ageAppearance(2)).toEqual(defaults);
});

it("recolours existing streets while paused and resets palettes without changing the simulation", async () => {
  const demo = new CityLocalDemo();
  document.body.append(demo);
  await demo.updateComplete;
  try {
    const model = demo.model!;
    const before = {
      a: model.stats(1),
      b: model.stats(2),
      levels: Array.from(model.terrain.height, (_, tile) => model.level(tile)),
    };
    expect(demo.running).toBe(false);
    expect(demo.querySelectorAll("[data-age-colour]")).toHaveLength(36);
    const ctx = demo
      .querySelector<HTMLCanvasElement>("[data-map]")!
      .getContext("2d")!;
    const colours: string[] = [];
    const clear = vi.spyOn(ctx, "clearRect");
    const paint = vi.spyOn(ctx, "fillRect").mockImplementation(() => {
      colours.push(String(ctx.fillStyle));
    });
    const input = demo.querySelector<HTMLInputElement>(
      '[aria-label="Village road colour"]',
    )!;
    const original = input.value;
    input.value = "#1234ef";
    input.dispatchEvent(new Event("input"));
    await demo.updateComplete;
    expect(colours).toContain("#1234ef");
    expect(clear).toHaveBeenCalledWith(0, 0, 1024, 1024);
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      paint.mock.invocationCallOrder[0],
    );
    expect(demo.model).toBe(model);
    expect({
      a: model.stats(1),
      b: model.stats(2),
      levels: Array.from(model.terrain.height, (_, tile) => model.level(tile)),
    }).toEqual(before);
    colours.length = 0;
    demo.querySelector<HTMLButtonElement>("[data-reset-palettes]")!.click();
    await demo.updateComplete;
    expect(input.value).toBe(original);
    expect(colours).toContain(original);
    expect(colours).not.toContain("#1234ef");
    expect(demo.model).toBe(model);
    expect(model.stats(1)).toEqual(before.a);
    paint.mockRestore();
    clear.mockRestore();
  } finally {
    demo.remove();
  }
});

it("adds a separate fourth demo with the retained visual and growth controls", async () => {
  const gallery = new DemoGallery();
  document.body.append(gallery);
  await gallery.updateComplete;
  for (const name of [
    "urban-growth",
    "city-demand",
    "city-population",
    "city-local",
  ])
    expect(gallery.querySelector(`a[href="#${name}"]`)).not.toBeNull();
  gallery.remove();
  const demo = new CityLocalDemo();
  document.body.append(demo);
  await demo.updateComplete;
  try {
    expect(demo.querySelectorAll("[data-preset] option")).toHaveLength(6);
    expect(demo.querySelectorAll("[data-age-boundary]")).toHaveLength(6);
    expect(demo.querySelector('[data-config="densify"]')).not.toBeNull();
    expect(demo.querySelector('[data-config="reach"]')).toBeNull();
    expect(demo.querySelector('[data-config="centreFalloff"]')).toBeNull();
    expect(demo.querySelector("[data-player]")).not.toBeNull();
    expect(demo.querySelector("[data-map-tool]")).not.toBeNull();
    expect(
      demo.querySelector('a[aria-label="Back to homepage"]'),
    ).not.toBeNull();
    const m = demo.model!;
    demo.captureTile(m.centre, 2);
    await demo.updateComplete;
    expect(demo.model).toBe(m);
    expect(m.level(m.centre)).toBe(1);
    expect(m.stats(1).capacity).toBe(0);
    expect(demo.querySelector("[data-occupancy]")?.textContent).toContain(
      "No housing",
    );
    expect(m.stats(2).capacity).toBe(100);
    demo.querySelector<HTMLButtonElement>("[data-reset]")!.click();
    await demo.updateComplete;
    expect(demo.model!.stats(1).capacity).toBe(100);
  } finally {
    demo.remove();
  }
});

it("applies keyboard capture tools without resetting and retains border setup across landscapes", async () => {
  const demo = new CityLocalDemo();
  document.body.append(demo);
  await demo.updateComplete;
  const select = async (selector: string, value: string) => {
    const e = demo.querySelector<HTMLSelectElement>(selector)!;
    e.value = value;
    e.dispatchEvent(new Event("change"));
    await demo.updateComplete;
  };
  try {
    await select("[data-layout]", "border");
    expect(demo.model!.stats(2).capacity).toBe(100);
    await select("[data-preset]", "hillside");
    expect(demo.model!.stats(2).capacity).toBe(100);
    const m = demo.model!,
      origin = m.centre;
    await select("[data-player]", "2");
    await select("[data-map-tool]", "claim");
    for (const [selector, value] of [
      ["[data-tile-x]", origin % 64],
      ["[data-tile-y]", Math.floor(origin / 64)],
    ] as const) {
      const e = demo.querySelector<HTMLInputElement>(selector)!;
      e.value = String(value);
      e.dispatchEvent(new Event("input"));
    }
    await demo.updateComplete;
    demo.querySelector<HTMLButtonElement>("[data-apply-tile]")!.click();
    await demo.updateComplete;
    expect(demo.model).toBe(m);
    expect(m.owner(origin)).toBe(2);
    expect(m.stats(1).population).toBe(80);
    expect(m.stats(2).population).toBe(80);
    expect(m.stats(2).capacity).toBe(200);
    expect(
      demo.querySelector('[data-player-summary="2"]')!.textContent,
    ).toContain("200");
    const state = m.stats(2);
    const age = demo.querySelector<HTMLInputElement>(
      '[data-age-boundary="1"]',
    )!;
    age.value = "4";
    age.dispatchEvent(new Event("input"));
    await demo.updateComplete;
    expect(m.stats(2)).toEqual(state);
    expect(demo.querySelector('[data-age-style="4"]')).not.toBeNull();
  } finally {
    demo.remove();
  }
});
