import { GrowthModel } from "../src/demos/urban-growth/model";
import { PRESETS, createScenario } from "../src/demos/urban-growth/presets";
import {
  decodeScenario,
  encodeScenario,
} from "../src/demos/urban-growth/scenario";
import { cloneTerrain, editTerrain } from "../src/demos/urban-growth/terrain";

describe("growth scenarios", () => {
  it("offers six complete runnable reproducible terrain presets", () => {
    expect(PRESETS).toHaveLength(6);
    for (const preset of PRESETS) {
      const a = createScenario(preset.id),
        b = createScenario(preset.id);
      expect(a.terrain.height).toEqual(b.terrain.height);
      expect(a.terrain.width).toBe(64);
      const m = new GrowthModel(a.terrain, a.config, a.seed, a.centre!);
      for (let i = 0; i < 120; i++) m.step();
      expect(m.stats().capacity).toBeGreaterThan(100);
    }
  });
  it("roundtrips actual edited terrain and settings, not just preset names", () => {
    const s = createScenario("plain");
    editTerrain(s.terrain, 20 * 64 + 20, "raise", 3, 0.2);
    editTerrain(s.terrain, 10 * 64 + 10, "water", 2, 0.2);
    s.config.densify = 0.9;
    const restored = decodeScenario(encodeScenario(s));
    expect(restored.terrain.height).toEqual(s.terrain.height);
    expect(restored.terrain.water).toEqual(s.terrain.water);
    expect(restored.config).toEqual(s.config);
    expect(restored.centre).toBe(s.centre);
  });

  it("finishes the last neighbourhood when less than one capacity unit remains", () => {
    const s = createScenario("pass");
    const m = new GrowthModel(s.terrain, s.config, s.seed, s.centre!);
    let found = false;
    for (let i = 0; i < 40000; i++) {
      m.step();
      if (
        m.pendingTile !== null &&
        s.config.ceiling - m.stats().capacity - m.pendingCredit < 1
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    m.step();
    expect(m.stats().status).toBe("mature");
    expect(m.stats().capacity).toBe(20000);
    expect(m.pendingCredit).toBe(0);
  });
  it("edits a terrain draft without changing the running scenario", () => {
    const s = createScenario("plain"),
      draft = cloneTerrain(s.terrain);
    editTerrain(draft, s.centre!, "lower", 3, 0.2);
    expect(s.terrain.height[s.centre!]).toBe(0.5);
    expect(draft.height[s.centre!]).toBeLessThan(0.5);
    editTerrain(draft, s.centre!, "water", 1, 0.2);
    expect(draft.water[s.centre!]).toBe(1);
    editTerrain(draft, s.centre!, "dry", 1, 0.2);
    expect(draft.water[s.centre!]).toBe(0);
  });
  it("rejects malformed dimensions, unsafe values and a submerged centre", () => {
    const original = JSON.parse(encodeScenario(createScenario("plain")));
    for (const mutate of [
      (s: any) => (s.version = 99),
      (s: any) => (s.terrain.width = 999999),
      (s: any) => (s.terrain.height[0] = null),
      (s: any) => (s.terrain.water[s.centre] = 1),
      (s: any) => (s.config.rate = -1),
      (s: any) => (s.terrain.water[0] = 2),
    ]) {
      const s = structuredClone(original);
      mutate(s);
      expect(() => decodeScenario(JSON.stringify(s))).toThrow();
    }
  });
});
