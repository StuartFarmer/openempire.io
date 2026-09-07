import { DemoGallery } from "../src/demos/DemoGallery";
import { encodeScenario } from "../src/demos/urban-growth/scenario";
import { UrbanGrowthDemo } from "../src/demos/urban-growth/UrbanGrowthDemo";

let demo: UrbanGrowthDemo;
async function click(selector: string) {
  demo.querySelector<HTMLButtonElement>(selector)!.click();
  await demo.updateComplete;
}
beforeEach(async () => {
  demo = new UrbanGrowthDemo();
  document.body.append(demo);
  await demo.updateComplete;
});
afterEach(() => {
  demo.remove();
  vi.useRealTimers();
});

describe("standalone growth lab controls", () => {
  it("offers direct homepage navigation in the gallery and the experiment", async () => {
    expect(
      demo
        .querySelector('a[aria-label="Back to homepage"]')
        ?.getAttribute("href"),
    ).toBe("/");
    expect(demo.querySelector('a.back-link[href="#"]')?.textContent).toContain(
      "All demos",
    );
    const gallery = new DemoGallery();
    document.body.append(gallery);
    await gallery.updateComplete;
    expect(
      gallery
        .querySelector('a[aria-label="Back to homepage"]')
        ?.getAttribute("href"),
    ).toBe("/");
    gallery.remove();
  });
  it("starts paused on a complete preset and advances only on Step or Play", async () => {
    expect(demo.running).toBe(false);
    expect(demo.model!.stats().seconds).toBe(0);
    expect(demo.querySelectorAll("[data-preset] option")).toHaveLength(6);
    await click("[data-step]");
    expect(demo.model!.stats().seconds).toBe(0.25);
    await click("[data-reset]");
    expect(demo.model!.stats().seconds).toBe(0);
  });
  it("loads a complete different preset instead of carrying old settings", async () => {
    const select = demo.querySelector<HTMLSelectElement>("[data-preset]")!;
    select.value = "valley";
    select.dispatchEvent(new Event("change"));
    await demo.updateComplete;
    expect(demo.scenario.preset).toBe("valley");
    expect(demo.scenario.config.waterBonus).toBe(0.9);
    expect(demo.scenario.terrain.water.some((x) => x === 1)).toBe(true);
  });
  it("applies draft growth settings only through restart", async () => {
    const input = demo.querySelector<HTMLInputElement>('[data-config="rate"]')!;
    input.value = "0";
    input.dispatchEvent(new Event("input"));
    await demo.updateComplete;
    expect(demo.model!.config.rate).toBe(200);
    await click("[data-apply-settings]");
    await click("[data-step]");
    expect(demo.model!.stats().capacity).toBe(100);
  });
  it("cancels terrain edits or applies them with a clean paused restart", async () => {
    await click("[data-edit]");
    demo.paintTerrain(1000, "raise");
    expect(demo.scenario.terrain.height[1000]).toBe(0.5);
    await click("[data-cancel-terrain]");
    expect(demo.terrainDraft).toBeNull();
    await click("[data-edit]");
    demo.paintTerrain(1000, "raise");
    await click("[data-apply-terrain]");
    expect(demo.scenario.terrain.height[1000]).toBeGreaterThan(0.5);
    expect(demo.model!.stats().seconds).toBe(0);
    expect(demo.running).toBe(false);
  });
  it("clears a submerged centre and permits a fresh placement", async () => {
    const centre = demo.scenario.centre!;
    await click("[data-edit]");
    demo.paintTerrain(centre, "water");
    await click("[data-apply-terrain]");
    expect(demo.model).toBeNull();
    expect(demo.scenario.centre).toBeNull();
    demo.placeCentre(100);
    await demo.updateComplete;
    expect(demo.model!.centre).toBe(100);
  });
  it("imports a scenario atomically and reports invalid input without losing a run", async () => {
    await click("[data-step]");
    const model = demo.model;
    demo.importText("{broken");
    await demo.updateComplete;
    expect(demo.model).toBe(model);
    expect(demo.querySelector('[role="alert"]')).not.toBeNull();
    demo.importText(encodeScenario(demo.scenario));
    await demo.updateComplete;
    expect(demo.model!.stats().seconds).toBe(0);
    expect(demo.running).toBe(false);
  });
  it("stops simulation when removed from the demo page", async () => {
    vi.useFakeTimers();
    await click("[data-play]");
    expect(demo.running).toBe(true);
    demo.remove();
    const ticks = demo.model!.stats().seconds;
    vi.advanceTimersByTime(1000);
    expect(demo.running).toBe(false);
    expect(demo.model!.stats().seconds).toBe(ticks);
  });
  it("provides a separate gallery with an actual demo selection", async () => {
    const gallery = new DemoGallery();
    document.body.append(gallery);
    await gallery.updateComplete;
    const link = gallery.querySelector<HTMLAnchorElement>(
      'a[href="#urban-growth"]',
    );
    expect(link?.textContent).toContain("Open");
    expect(gallery.querySelector("game-shell-page")).toBeNull();
    gallery.remove();
  });
});
