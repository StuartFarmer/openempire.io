import {
  DEFAULT_CONFIG,
  tileCapacity,
  validateConfig,
} from "../src/demos/urban-growth/config";
import { GrowthModel } from "../src/demos/urban-growth/model";
import { flatTerrain, prepareTerrain } from "../src/demos/urban-growth/terrain";

function run(m: GrowthModel, ticks = 400) {
  for (let i = 0; i < ticks; i++) m.step();
  return m;
}

describe("isolated city growth", () => {
  it("gives nonlinear capacity to existing neighbourhood maturity", () => {
    expect(tileCapacity(0, DEFAULT_CONFIG)).toBe(100);
    expect(tileCapacity(0.5, DEFAULT_CONFIG)).toBe(575);
    expect(tileCapacity(1, DEFAULT_CONFIG)).toBe(2000);
  });
  it("densifies without needing another tile", () => {
    const m = run(
      new GrowthModel(flatTerrain(9), { ...DEFAULT_CONFIG, reach: 0 }, 7, 40),
    );
    expect(m.stats().area).toBe(1);
    expect(m.stats().capacity).toBeGreaterThan(1500);
    expect(m.stats().capacity).toBeLessThanOrEqual(2000);
    expect(m.stats().status).toBe("constrained");
  });
  it("never creates development for free or exceeds the shared allowance", () => {
    const m = new GrowthModel(
      flatTerrain(25),
      { ...DEFAULT_CONFIG, rate: 100, waterBonus: 0 },
      17,
      312,
    );
    for (let i = 0; i < 400; i++) {
      const before = m.stats().capacity + m.pendingCredit;
      m.step();
      expect(m.stats().capacity + m.pendingCredit - before).toBeLessThanOrEqual(
        25 + 1e-7,
      );
    }
    expect(m.stats().area).toBeGreaterThan(2);
    expect(m.stats().meanDensity).toBeGreaterThan(100);
  });
  it("stays connected, within reach and off water across long runs", () => {
    const terrain = flatTerrain(25);
    for (let y = 0; y < 25; y++) terrain.water[y * 25 + 14] = 1;
    prepareTerrain(terrain);
    const m = run(
      new GrowthModel(
        terrain,
        { ...DEFAULT_CONFIG, reach: 7, ceiling: 10000 },
        31,
        312,
      ),
      5000,
    );
    expect(m.stats().capacity).toBeLessThanOrEqual(10000);
    const seen = new Set([312]),
      queue = [312];
    for (const t of queue)
      for (const n of terrain.neighbours(t))
        if (m.capacity[n] > 0 && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    expect(seen.size).toBe(m.stats().area);
    m.capacity.forEach((value, i) => {
      if (value > 0) {
        expect(terrain.water[i]).toBe(0);
        expect(
          Math.hypot((i % 25) - 12, Math.floor(i / 25) - 12),
        ).toBeLessThanOrEqual(7);
        expect(i % 25).toBeLessThan(14);
      }
    });
  });
  it("can reach a small ceiling exactly without exceeding it", () => {
    const m = run(
      new GrowthModel(
        flatTerrain(9),
        { ...DEFAULT_CONFIG, ceiling: 1500, rate: 1000, reach: 0 },
        2,
        40,
      ),
      1000,
    );
    expect(m.stats().capacity).toBe(1500);
    expect(m.stats().status).toBe("mature");
  });
  it("does not grow at zero development rate", () => {
    const m = run(
      new GrowthModel(flatTerrain(9), { ...DEFAULT_CONFIG, rate: 0 }, 2, 40),
    );
    expect(m.stats().capacity).toBe(100);
    expect(m.stats().area).toBe(1);
  });

  it("shifts from sprawl to densification as the city matures", () => {
    const m = new GrowthModel(flatTerrain(25), DEFAULT_CONFIG, 42, 312);
    run(m, 240);
    const early = m.stats();
    run(m, 2160);
    expect(m.stats().meanDensity).toBeGreaterThan(early.meanDensity);
    expect(m.stats().capacity).toBeGreaterThan(19000);
    expect(m.capacity.some((value) => value >= 1500)).toBe(true);
  });
  it("replays seeded choices exactly", () => {
    const a = run(new GrowthModel(flatTerrain(25), DEFAULT_CONFIG, 51, 312));
    const b = run(new GrowthModel(flatTerrain(25), DEFAULT_CONFIG, 51, 312));
    expect(a.capacity).toEqual(b.capacity);
    expect(a.stats()).toEqual(b.stats());
  });
  it("penalizes steep slopes both ways and uphill more than downhill", () => {
    const t = flatTerrain(9);
    t.height[39] = 0.3;
    t.height[41] = 0.7;
    prepareTerrain(t);
    const m = new GrowthModel(t, DEFAULT_CONFIG, 4, 40);
    expect(m.inspect(39).suitability).toBeGreaterThan(
      m.inspect(41).suitability,
    );
    expect(m.inspect(39).suitability).toBeLessThan(1);
  });
  it("nearby water accelerates maturation without granting water housing", () => {
    const dry = flatTerrain(9),
      wet = flatTerrain(9);
    wet.water[39] = 1;
    prepareTerrain(wet);
    const c = { ...DEFAULT_CONFIG, reach: 0, waterBonus: 1 };
    // Compare before either one-tile city reaches its 2000 housing limit.
    const a = run(new GrowthModel(dry, c, 1, 40), 20),
      b = run(new GrowthModel(wet, c, 1, 40), 20);
    expect(b.stats().capacity).toBeGreaterThan(a.stats().capacity);
    expect(b.capacity[39]).toBe(0);
  });
  it("rejects invalid settings and water centre before simulation", () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, rate: NaN })).toThrow();
    expect(() =>
      validateConfig({ ...DEFAULT_CONFIG, ruralCapacity: 3000 }),
    ).toThrow();
    const t = flatTerrain(9);
    t.water[40] = 1;
    expect(() => new GrowthModel(t, DEFAULT_CONFIG, 1, 40)).toThrow();
  });
});
