import { levelCapacity, maturationWork } from "../src/demos/city-demand/config";
import { CityModel } from "../src/demos/city-demand/model";
import { DEFAULT_CONFIG } from "../src/demos/urban-growth/config";
import { GrowthModel } from "../src/demos/urban-growth/model";
import { createScenario, PRESETS } from "../src/demos/urban-growth/presets";
import { flatTerrain } from "../src/demos/urban-growth/terrain";
function config(overrides = {}) {
  const { ceiling, ...c } = DEFAULT_CONFIG;
  return { ...c, populationRate: 400, maturationScale: ceiling, ...overrides };
}
const make = (overrides = {}, width = 25) =>
  new CityModel(
    flatTerrain(width),
    config(overrides),
    42,
    Math.floor((width * width) / 2),
  );
function run(m: CityModel, steps = 400, fill = false) {
  for (let i = 0; i < steps; i++) {
    if (fill) m.changePopulation(1e9);
    m.step();
  }
  return m;
}
function surroundedCentre() {
  const m = make({ densify: 1, rate: 25, populationRate: 0 }, 3);
  for (let step = 0; step < 20000; step++) {
    if (
      m.candidates().some((c) => c.tile === m.centre && c.kind === "densify")
    ) {
      m.changePopulation(1e9);
      return m;
    }
    run(m, 1, true);
  }
  throw new Error("Centre never became surrounded");
}
describe("demo 2 follows the first demo", () => {
  it.each([200, 2000])("never skips a level at development rate %s", (rate) => {
    const m = make({ rate }, 9);
    const previous = new Uint8Array(m.capacity.length);
    previous[m.centre] = 1;
    let births = 0;
    for (let step = 0; step < 1200; step++) {
      m.changePopulation(1e9);
      m.step();
      for (let tile = 0; tile < previous.length; tile++) {
        const level = m.level(tile);
        expect(level - previous[tile]).toBeGreaterThanOrEqual(0);
        expect(level - previous[tile]).toBeLessThanOrEqual(1);
        if (!previous[tile] && level) {
          expect(level).toBe(1);
          births++;
        }
        previous[tile] = level;
      }
    }
    expect(births).toBeGreaterThan(0);
  });
  it("retains slow-fast-slow work costs for eligible maturation", () => {
    const work = (start: number) =>
      Array.from({ length: 10 }, (_, i) =>
        maturationWork(start + i, 100, config()),
      ).reduce((a, b) => a + b, 0);
    const early = work(1),
      middle = work(46),
      late = work(90);
    expect(early).toBeGreaterThan(middle * 2);
    expect(late).toBeGreaterThan(middle * 2);
  });
  it.each(PRESETS)(
    "both expands and matures existing neighbourhoods on $name",
    ({ id }) => {
      const s = createScenario(id);
      const { ceiling, ...c } = s.config;
      const b = new CityModel(
        s.terrain,
        { ...c, populationRate: 400, maturationScale: ceiling },
        s.seed,
        s.centre!,
      );
      while (b.stats().capacity < 12000 && b.stats().seconds < 2000) b.step();
      expect(b.stats().capacity).toBeGreaterThanOrEqual(12000);
      // Per-tile sigmoid timing intentionally changes the old footprint ratio.
      // Surrounding support now governs how far maturation can proceed.
      expect(b.stats().area).toBeGreaterThan(1);
      const levels = [...b.capacity.keys()].map((tile) => b.level(tile));
      expect(levels.some((level) => level === 1)).toBe(true);
      expect(levels.some((level) => level >= 3)).toBe(true);
    },
  );
  it("slows near a local target below 100, not only near level 100", () => {
    const c = config();
    expect(maturationWork(1, 40, c)).toBeGreaterThan(
      maturationWork(20, 40, c) * 2,
    );
    expect(maturationWork(39, 40, c)).toBeGreaterThan(
      maturationWork(20, 40, c) * 2,
    );
    expect(maturationWork(40, 40, c)).toBe(Infinity);
    // When neighbourhood development raises the target, maturation can resume.
    expect(Number.isFinite(maturationWork(40, 60, c))).toBe(true);
  });
  it("shows paid progress without awarding a partial level", () => {
    const m = surroundedCentre(),
      housing = m.stats().capacity;
    run(m, 26);
    expect(m.level(m.centre)).toBe(1);
    expect(m.stats().capacity).toBe(housing);
    expect(m.upgradeProgress(m.centre)).toBeGreaterThan(0.8);
    m.step();
    expect(m.level(m.centre)).toBe(2);
  });
  it("reports paid progress for an unfinished rural establishment", () => {
    const m = make({ densify: 0, rate: 10 });
    m.step();
    expect(m.pendingTile).not.toBeNull();
    expect(m.inspect(m.pendingTile!).progress).toBe(0.0025);
    expect(m.level(m.pendingTile!)).toBe(0);
  });
  it("pays the slow establishment phase before a wilderness tile becomes level one", () => {
    const m = make({ densify: 0, maturationScale: 0, rate: 200 });
    run(m, 19, true);
    expect(m.stats().area).toBe(1);
    expect(m.upgradeProgress(m.pendingTile!)).toBeCloseTo(0.95);
    m.step();
    expect(m.stats().area).toBe(2);
    expect(m.level(m.lastTile!)).toBe(1);
    expect(m.upgradeProgress(m.lastTile!)).toBe(0);
  });
  it.each(PRESETS)(
    "preserves exact initial selection scores and local density targets on $name",
    ({ id }) => {
      const s = createScenario(id),
        a = new GrowthModel(s.terrain, s.config, s.seed, s.centre!);
      const { ceiling, ...c } = s.config;
      const b = new CityModel(
        s.terrain,
        { ...c, populationRate: 400, maturationScale: ceiling },
        s.seed,
        s.centre!,
      );
      for (let i = 0; i < s.terrain.height.length; i++) {
        expect(b.inspect(i).score).toBe(a.inspect(i).score);
        expect(b.inspect(i).suitability).toBe(a.inspect(i).suitability);
        expect(b.inspect(i).targetMaturity).toBe(a.inspect(i).targetMaturity);
      }
    },
  );
  it("awards linear housing without changing the work needed for a completed level", () => {
    const m = surroundedCentre(),
      centre = m.centre;
    expect(m.level(centre)).toBe(1);
    expect(m.capacity[centre]).toBe(100);
    run(m, 27);
    expect(m.level(centre)).toBe(2);
    expect(m.capacity[centre]).toBe(200);
    expect(m.upgradeProgress(centre)).toBe(0);
    expect(levelCapacity(100, config())).toBe(10000);
  });
  it("establishes 100-place level-one rural tiles", () => {
    const m = run(make({ densify: 0, maturationScale: 0 }), 200, true);
    expect(m.stats().area).toBeGreaterThan(2);
    for (let i = 0; i < m.capacity.length; i++)
      if (m.capacity[i]) {
        expect(m.level(i)).toBe(1);
        expect(m.capacity[i]).toBe(100);
      }
  });
  it("interleaves maturation with an unfinished rural tile", () => {
    const m = make({ rate: 200, densify: 0.65 });
    let observed = false;
    for (let i = 0; i < 2000; i++) {
      m.changePopulation(1e9);
      const pending = m.pendingTile,
        before = m.stats().capacity;
      m.step();
      if (
        pending !== null &&
        m.pendingTile === pending &&
        m.stats().capacity > before
      )
        observed = true;
    }
    expect(observed).toBe(true);
  });
  it("preserves the centre-to-outskirts density gradient", () => {
    const m = run(make(), 1600, true);
    const outer = [...m.capacity.keys()].filter(
      (i) => m.capacity[i] && m.inspect(i).distance > 3,
    );
    expect(outer.length).toBeGreaterThan(0);
    for (const i of outer)
      expect(m.inspect(i).maturity).toBeLessThanOrEqual(
        m.inspect(i).targetMaturity + 1e-8,
      );
    expect(m.capacity.some((h) => h > 100)).toBe(true);
  });
  it("keeps the shared allowance but not the 20,000 city ceiling", () => {
    const m = make({ waterBonus: 0 });
    for (let i = 0; i < 8000; i++) {
      m.changePopulation(1e9);
      const before = m.stats().invested;
      m.step();
      expect(m.stats().invested - before).toBeLessThanOrEqual(50 + 1e-6);
    }
    expect(m.stats().capacity).toBeGreaterThan(20000);
    for (let i = 0; i < m.capacity.length; i++)
      if (m.capacity[i]) {
        expect(Number.isInteger(m.level(i))).toBe(true);
        expect(m.capacity[i]).toBe(100 * m.level(i));
      }
  });
  it("uses falloff distance as a scale rather than a hard expansion border", () => {
    const m = run(
      make({ reach: 1, densify: 0, maturationScale: 0 }),
      300,
      true,
    );
    expect(
      [...m.capacity.keys()].some(
        (i) => m.capacity[i] && m.inspect(i).distance > 1,
      ),
    ).toBe(true);
  });
  it("retains housing and paid work after population loss and fills vacancies first", () => {
    const m = run(make(), 500),
      housing = m.capacity.slice(),
      invested = m.stats().invested;
    m.changePopulation(-m.stats().population * 0.75);
    const p = m.stats().population;
    m.step();
    expect(m.stats().population).toBeGreaterThan(p);
    expect(m.capacity).toEqual(housing);
    expect(m.stats().invested).toBe(invested);
    m.changePopulation(-1e9);
    m.step();
    expect(m.stats().population).toBeGreaterThan(0);
  });
  it("zero rate stops development and population stays within housing", () => {
    const m = run(make({ rate: 0 }), 1000);
    expect(m.stats().capacity).toBe(100);
    expect(m.stats().population).toBe(100);
    expect(m.stats().invested).toBe(100);
  });
  it("inspection does not consume simulation randomness", () => {
    const a = make(),
      b = make();
    for (let i = 0; i < 400; i++) {
      a.changePopulation(1e9);
      b.changePopulation(1e9);
      a.candidates();
      a.inspect(a.centre);
      a.step();
      b.step();
    }
    expect(a.capacity).toEqual(b.capacity);
    expect(a.stats()).toEqual(b.stats());
  });
});
