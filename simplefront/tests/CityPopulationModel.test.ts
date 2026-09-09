import { CityModel as PreviousModel } from "../src/demos/city-demand/model";
import { createScenario as previousScenario } from "../src/demos/city-demand/presets";
import {
  DEFAULT_CONFIG,
  developmentIndex,
  fertilityAtLevel,
  validateConfig,
} from "../src/demos/city-population/config";
import { CityModel } from "../src/demos/city-population/model";
import { createScenario, PRESETS } from "../src/demos/city-population/presets";
import {
  decodeScenario,
  encodeScenario,
} from "../src/demos/city-population/scenario";
import { flatTerrain } from "../src/demos/city-population/terrain";

const make = (overrides = {}, width = 9) =>
  new CityModel(
    flatTerrain(width),
    { ...DEFAULT_CONFIG, ...overrides },
    42,
    Math.floor((width * width) / 2),
  );

describe("development-to-fertility gradient", () => {
  const c = {
    ...DEFAULT_CONFIG,
    lowerLevel: 3,
    upperLevel: 15,
    lowerLevelBirths: 5,
    upperLevelBirths: 2,
  };
  it.each([
    [1, 0, 5],
    [3, 0, 5],
    [6, 0.25, 4.25],
    [9, 0.5, 3.5],
    [12, 0.75, 2.75],
    [15, 1, 2],
    [100, 1, 2],
  ])("maps level %s to index %s and fertility %s", (level, index, births) => {
    expect(developmentIndex(level, c)).toBe(index);
    expect(fertilityAtLevel(level, c)).toBe(births);
  });
  it("does not assign fertility to wilderness", () => {
    expect(fertilityAtLevel(0, c)).toBe(0);
  });
  it("supports a flat gradient", () => {
    expect(fertilityAtLevel(7, { ...c, lowerLevelBirths: 2 })).toBe(2);
  });
  it.each([
    { lowerLevel: 10, upperLevel: 10 },
    { lowerLevel: 12, upperLevel: 3 },
    { lowerLevel: 1.5 },
    { upperLevel: 101 },
    { lowerLevelBirths: -1 },
    { upperLevelBirths: NaN },
    { targetOccupancy: 1 },
  ])("rejects invalid settings %j", (bad) => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, ...bad })).toThrow();
  });
});

describe("population and housing feedback", () => {
  it("uses residents, fertility and vacancies for birth rates, not a fixed city-wide refill", () => {
    const m = make({
      rate: 0,
      populationRate: 0.2,
      lowerLevelBirths: 3,
      upperLevelBirths: 3,
    });
    // 80 residents, 100 homes: .2 * (80 * 3/3 + 10 recovery) * .2 = 3.6/s.
    expect(m.stats().populationPerSecond).toBeCloseTo(3.6);
    m.step();
    expect(m.stats().population).toBeCloseTo(80.9);
  });
  it("higher fertility increases births at equal population and housing", () => {
    const low = make({ rate: 0, lowerLevelBirths: 1, upperLevelBirths: 1 });
    const high = make({ rate: 0, lowerLevelBirths: 5, upperLevelBirths: 5 });
    low.step();
    high.step();
    expect(high.stats().population).toBeGreaterThan(low.stats().population);
  });
  it("full housing stops replenishment but still permits construction", () => {
    const m = make();
    m.changePopulation(1e9);
    expect(m.stats().populationPerSecond).toBe(0);
    expect(m.stats().housingPressure).toBe(1);
    const work = m.stats().invested;
    m.step();
    expect(m.stats().population).toBe(100);
    expect(m.stats().invested).toBeGreaterThan(work);
  });
  it("scales shared work with housing pressure and diminishing population returns", () => {
    const m = make({ populationRate: 0, targetOccupancy: 0.85, rate: 200 });
    expect(m.stats().developmentPerSecond).toBe(0);
    m.changePopulation(12.5);
    expect(m.stats().housingPressure).toBeCloseTo(0.5);
    expect(m.stats().desiredHousing).toBeCloseTo(92.5 / 0.85);
    expect(m.stats().developmentPerSecond).toBeGreaterThan(95);
    expect(m.stats().developmentPerSecond).toBeLessThan(100);
    const work = m.stats().invested;
    m.step();
    expect(m.stats().invested - work).toBeCloseTo(
      m.stats().developmentPerSecond * 0.25,
    );
    m.changePopulation(1e9);
    expect(m.stats().developmentPerSecond).toBeCloseTo(200);
  });
  it("more people produce more work, but quadrupling people less than quadruples work", () => {
    const small = make(),
      large = make({ ruralCapacity: 400 });
    small.changePopulation(1e9);
    large.changePopulation(1e9);
    expect(small.stats().developmentPerSecond).toBeCloseTo(200);
    expect(large.stats().developmentPerSecond).toBeCloseTo(350);
  });
  it("empty housing has no resident births, but baseline recovery prevents a dead end", () => {
    const m = make({ lowerLevelBirths: 0, upperLevelBirths: 0 });
    m.changePopulation(-1e9);
    expect(m.stats().meanFertility).toBe(0);
    expect(m.stats().populationPerSecond).toBeGreaterThan(0);
    m.step();
    expect(m.stats().population).toBeGreaterThan(0);
    expect(m.stats().capacity).toBe(100);
    const paused = make({ populationRate: 0 });
    paused.changePopulation(-1e9);
    paused.step();
    expect(paused.stats().population).toBe(0);
  });
  it("preserves discrete levels, four-sided support, linear housing and paid work after losses", () => {
    const m = make({ rate: 2000 }, 5);
    let upgrades = 0;
    for (let step = 0; step < 400; step++) {
      m.changePopulation(1e9);
      const before = Array.from(m.capacity, (_, i) => m.level(i));
      m.step();
      let completions = 0;
      for (let tile = 0; tile < before.length; tile++) {
        const level = m.level(tile);
        expect(m.capacity[tile]).toBe(level * 100);
        if (level !== before[tile]) {
          completions++;
          expect(level).toBe(before[tile] + 1);
          if (before[tile]) {
            upgrades++;
            expect(m.terrain.neighbours(tile)).toHaveLength(4);
            expect(
              m.terrain
                .neighbours(tile)
                .every((n) => before[n] >= before[tile]),
            ).toBe(true);
          }
        }
      }
      expect(completions).toBeLessThanOrEqual(1);
    }
    expect(upgrades).toBeGreaterThan(0);
    const housing = m.capacity.slice(),
      work = m.stats().invested;
    m.changePopulation(-m.stats().population * 0.75);
    m.step();
    expect(m.capacity).toEqual(housing);
    expect(m.stats().invested).toBe(work);
  });
  it("weights the city's fertility by residents rather than tile count", () => {
    const m = make(
      {
        rate: 2000,
        lowerLevel: 1,
        upperLevel: 3,
        lowerLevelBirths: 5,
        upperLevelBirths: 1,
      },
      3,
    );
    for (let i = 0; i < 200; i++) {
      m.changePopulation(1e9);
      m.step();
    }
    // Eight level-one tiles (800 housing at fertility 5), centre level two (200 at 3).
    expect(m.stats().capacity).toBe(1000);
    expect(m.stats().meanFertility).toBeCloseTo(4.6);
    expect(m.stats().developmentIndex).toBeCloseTo(0.1);
    expect(m.inspect(4).residents).toBeCloseTo(200);
    expect(m.inspect(4).fertility).toBe(3);
  });
  it.each(PRESETS)(
    "preserves terrain and candidate scoring on $id",
    ({ id }) => {
      const a = previousScenario(id),
        b = createScenario(id);
      const old = new PreviousModel(a.terrain, a.config, a.seed, a.centre!);
      const next = new CityModel(b.terrain, b.config, b.seed, b.centre!);
      expect(b.terrain.height).toEqual(a.terrain.height);
      expect(b.terrain.water).toEqual(a.terrain.water);
      expect(next.candidates()).toEqual(old.candidates());
      expect(b.config.densify).toBe(a.config.densify);
    },
  );
});

it("round-trips the third demo's settings and rejects second-demo exports", () => {
  const s = createScenario("coast");
  Object.assign(s.config, {
    lowerLevel: 3,
    upperLevel: 15,
    lowerLevelBirths: 5,
    upperLevelBirths: 2,
    targetOccupancy: 0.9,
  });
  expect(decodeScenario(encodeScenario(s)).config).toEqual(s.config);
  const wrongVersion = JSON.parse(encodeScenario(s));
  wrongVersion.version = "city-demand-2";
  expect(() => decodeScenario(JSON.stringify(wrongVersion))).toThrow();
});
