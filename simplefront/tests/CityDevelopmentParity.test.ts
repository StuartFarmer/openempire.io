import {
  CityDevelopment,
  STEP_SECONDS,
} from "../src/core/development/CityDevelopment";
import {
  DEFAULT_CONFIG,
  developmentIndex,
  fertilityAtLevel,
  maturationWork,
  validateConfig,
} from "../src/core/development/CityDevelopmentConfig";
import {
  DEFAULT_CONFIG as DEMO_DEFAULT_CONFIG,
  GrowthConfig as DemoGrowthConfig,
} from "../src/demos/city-population/config";
import { CityModel } from "../src/demos/city-population/model";
import { createScenario, PRESETS } from "../src/demos/city-population/presets";
import { flatTerrain } from "../src/demos/city-population/terrain";

const CHECKPOINTS = new Set([1, 50, 200, 300, 600, 700, 1200]);

function observed(model: CityDevelopment) {
  return {
    stats: model.stats(),
    capacity: Array.from(model.capacity),
    levels: Array.from(model.capacity, (_, tile) => model.level(tile)),
    pendingTile: model.pendingTile,
    pendingCredit: model.pendingCredit,
    lastTile: model.lastTile,
    lastAction: model.lastAction,
    candidates: model.candidates(),
  };
}

describe("frozen City Population Lab parity", () => {
  it("ports the exact numeric defaults", () => {
    expect(DEFAULT_CONFIG).toEqual(DEMO_DEFAULT_CONFIG);
  });

  it.each(PRESETS)("matches every observable growth step for $id", ({ id }) => {
    const scenario = createScenario(id);
    const demo = new CityModel(
      scenario.terrain,
      scenario.config,
      scenario.seed,
      scenario.centre!,
    );
    const core = new CityDevelopment(
      scenario.terrain,
      scenario.config,
      scenario.seed,
      scenario.centre!,
    );
    let expanded = false;
    let upgraded = false;

    expect(core.stats()).toEqual(demo.stats());
    for (let step = 1; step <= 1200; step++) {
      if (step === 300) {
        const loss = -demo.stats().population * 0.4;
        demo.changePopulation(loss);
        core.changePopulation(loss);
      }
      if (step === 700) {
        demo.changePopulation(250);
        core.changePopulation(250);
      }

      const beforeArea = core.stats().area;
      const beforeLevels = Array.from(core.capacity, (_, tile) =>
        core.level(tile),
      );
      demo.step();
      core.step();

      expanded ||= core.stats().area > beforeArea;
      upgraded ||= beforeLevels.some(
        (level, tile) => level > 0 && core.level(tile) > level,
      );
      expect(core.stats()).toEqual(demo.stats());
      expect(core.pendingTile).toBe(demo.pendingTile);
      expect(core.pendingCredit).toBe(demo.pendingCredit);
      expect(core.lastTile).toBe(demo.lastTile);
      expect(core.lastAction).toBe(demo.lastAction);

      if (CHECKPOINTS.has(step)) {
        expect(Array.from(core.capacity)).toEqual(Array.from(demo.capacity));
        expect(
          Array.from(core.capacity, (_, tile) => core.level(tile)),
        ).toEqual(Array.from(demo.capacity, (_, tile) => demo.level(tile)));
        expect(core.candidates()).toEqual(demo.candidates());
        expect(
          Array.from(core.capacity, (_, tile) => core.inspect(tile)),
        ).toEqual(Array.from(demo.capacity, (_, tile) => demo.inspect(tile)));
        expect(
          Array.from(core.capacity, (_, tile) => core.upgradeProgress(tile)),
        ).toEqual(
          Array.from(demo.capacity, (_, tile) => demo.upgradeProgress(tile)),
        );
      }
    }

    expect(expanded).toBe(true);
    expect(upgraded).toBe(true);
  });

  it("pins the unshocked plain-preset 300-second fixture literally", () => {
    const scenario = createScenario("plain");
    const core = new CityDevelopment(
      scenario.terrain,
      scenario.config,
      scenario.seed,
      scenario.centre!,
    );
    for (let step = 0; step < 1200; step++) core.step();

    expect(core.stats().seconds).toBe(300);
    expect(core.stats().area).toBe(149);
    expect(core.stats().capacity).toBe(36_800);
    expect(core.stats().population).toBeCloseTo(35_410.968239479, 9);
  });

  it("matches non-default fertility and maturation settings", () => {
    const scenario = createScenario("coast");
    const config: DemoGrowthConfig = {
      ...scenario.config,
      lowerLevel: 3,
      upperLevel: 15,
      lowerLevelBirths: 5,
      upperLevelBirths: 2,
      maturationScale: 0,
      densify: 0.2,
    };
    const demo = new CityModel(
      scenario.terrain,
      config,
      scenario.seed,
      scenario.centre!,
    );
    const core = new CityDevelopment(
      scenario.terrain,
      config,
      scenario.seed,
      scenario.centre!,
    );

    for (let step = 0; step < 1200; step++) {
      demo.step();
      core.step();
      expect(core.stats()).toEqual(demo.stats());
      expect(core.lastAction).toBe(demo.lastAction);
    }
    expect(Array.from(core.capacity)).toEqual(Array.from(demo.capacity));
    expect(Array.from(core.capacity, (_, tile) => core.level(tile))).toEqual(
      Array.from(demo.capacity, (_, tile) => demo.level(tile)),
    );
    expect(core.pendingTile).toBe(demo.pendingTile);
    expect(core.pendingCredit).toBe(demo.pendingCredit);
    expect(core.lastTile).toBe(demo.lastTile);
    expect(core.candidates()).toEqual(demo.candidates());
  });
});

describe("literal development invariants", () => {
  it("only establishes level one and upgrades one supported level per step", () => {
    const model = new CityDevelopment(
      flatTerrain(5),
      { ...DEFAULT_CONFIG, rate: 2000, populationRate: 0 },
      42,
      12,
    );
    let expansions = 0;
    let upgrades = 0;

    for (let step = 0; step < 400; step++) {
      model.changePopulation(Number.MAX_SAFE_INTEGER);
      const before = Array.from(model.capacity, (_, tile) => model.level(tile));
      model.step();
      let completions = 0;

      for (let tile = 0; tile < before.length; tile++) {
        const after = model.level(tile);
        expect(model.capacity[tile]).toBe(100 * after);
        if (after === before[tile]) continue;
        completions++;
        expect(after).toBe(before[tile] + 1);
        if (before[tile] === 0) {
          expansions++;
          expect(after).toBe(1);
        } else {
          upgrades++;
          const neighbours = model.terrain.neighbours(tile);
          expect(neighbours).toHaveLength(4);
          expect(neighbours.every((n) => before[n] >= before[tile])).toBe(true);
        }
      }
      expect(completions).toBeLessThanOrEqual(1);
    }

    expect(expansions).toBeGreaterThan(0);
    expect(upgrades).toBeGreaterThan(0);
  });

  it("retains paid establishment work through a population shock", () => {
    const model = new CityDevelopment(flatTerrain(5), DEFAULT_CONFIG, 9, 12);
    model.changePopulation(Number.MAX_SAFE_INTEGER);
    model.step();
    expect(model.pendingTile).not.toBeNull();
    expect(model.pendingCredit).toBeGreaterThan(0);
    const pendingTile = model.pendingTile;
    const pendingCredit = model.pendingCredit;
    const invested = model.stats().invested;

    model.changePopulation(-Number.MAX_SAFE_INTEGER);
    model.step();

    expect(model.pendingTile).toBe(pendingTile);
    expect(model.pendingCredit).toBe(pendingCredit);
    expect(model.stats().invested).toBe(invested);
    expect(model.stats().status).toBe("filling");
  });

  it("retains paid upgrade work through a population shock", () => {
    const model = new CityDevelopment(
      flatTerrain(5),
      { ...DEFAULT_CONFIG, rate: 200, populationRate: 0 },
      42,
      12,
    );
    let progress: number[] = [];
    for (let step = 0; step < 1200; step++) {
      model.changePopulation(Number.MAX_SAFE_INTEGER);
      model.step();
      progress = Array.from(model.capacity, (_, tile) =>
        model.level(tile) ? model.upgradeProgress(tile) : 0,
      );
      if (progress.some((value) => value > 0)) break;
    }
    expect(progress.some((value) => value > 0)).toBe(true);
    const invested = model.stats().invested;
    const levels = Array.from(model.capacity, (_, tile) => model.level(tile));

    model.changePopulation(-Number.MAX_SAFE_INTEGER);
    model.step();

    expect(
      Array.from(model.capacity, (_, tile) =>
        model.level(tile) ? model.upgradeProgress(tile) : 0,
      ),
    ).toEqual(progress);
    expect(Array.from(model.capacity, (_, tile) => model.level(tile))).toEqual(
      levels,
    );
    expect(model.stats().invested).toBe(invested);
  });

  it("pauses a zero development rate without discarding state", () => {
    const model = new CityDevelopment(
      flatTerrain(3),
      { ...DEFAULT_CONFIG, rate: 0 },
      3,
      4,
    );
    model.changePopulation(Number.MAX_SAFE_INTEGER);
    const before = observed(model);
    model.step();
    expect(model.stats().status).toBe("paused-rate");
    expect(model.stats().population).toBe(before.stats.population);
    expect(model.stats().invested).toBe(before.stats.invested);
    expect(Array.from(model.capacity)).toEqual(before.capacity);
  });

  it("recovers from zero population, including zero fertility", () => {
    const model = new CityDevelopment(
      flatTerrain(3),
      { ...DEFAULT_CONFIG, lowerLevelBirths: 0, upperLevelBirths: 0 },
      3,
      4,
    );
    model.changePopulation(-Number.MAX_SAFE_INTEGER);
    expect(model.stats().population).toBe(0);
    expect(model.stats().meanFertility).toBe(0);
    model.step();
    expect(model.stats().population).toBeGreaterThan(0);
    expect(model.stats().capacity).toBe(100);
  });

  it("constructs at full housing even though population growth is paused", () => {
    const model = new CityDevelopment(flatTerrain(3), DEFAULT_CONFIG, 3, 4);
    model.changePopulation(Number.MAX_SAFE_INTEGER);
    const invested = model.stats().invested;
    expect(model.stats().populationPerSecond).toBe(0);
    model.step();
    expect(model.stats().population).toBe(100);
    expect(model.stats().invested).toBeGreaterThan(invested);
  });

  it("reports constrained when a dry centre has no legal expansion", () => {
    const model = new CityDevelopment(flatTerrain(1), DEFAULT_CONFIG, 1, 0);
    model.changePopulation(Number.MAX_SAFE_INTEGER);
    model.step();
    expect(model.candidates()).toEqual([]);
    expect(model.stats().status).toBe("constrained");
  });

  it("treats an already-terminal maturation boundary as unreachable", () => {
    expect(maturationWork(100, 100, DEFAULT_CONFIG)).toBe(Infinity);
    expect(maturationWork(15, 10, DEFAULT_CONFIG)).toBe(Infinity);
  });
});

describe("configuration and terrain contracts", () => {
  it("maps the documented fertility gradient", () => {
    const config = {
      ...DEFAULT_CONFIG,
      lowerLevel: 3,
      upperLevel: 15,
      lowerLevelBirths: 5,
      upperLevelBirths: 2,
    };
    expect(developmentIndex(1, config)).toBe(0);
    expect(developmentIndex(9, config)).toBe(0.5);
    expect(developmentIndex(100, config)).toBe(1);
    expect(fertilityAtLevel(0, config)).toBe(0);
    expect(fertilityAtLevel(9, config)).toBe(3.5);
  });

  it.each([
    { rate: -1 },
    { rate: Infinity },
    { targetOccupancy: 1 },
    { lowerLevel: 1.5 },
    { lowerLevel: 10, upperLevel: 10 },
    { ruralCapacity: 500, urbanCapacity: 500 },
  ])("rejects invalid numeric settings $rate", (override) => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, ...override })).toThrow();
  });

  it("rejects inconsistent terrain arrays and an invalid centre", () => {
    const terrain = flatTerrain(3);
    expect(
      () =>
        new CityDevelopment(
          { ...terrain, slope: new Float64Array(8) },
          DEFAULT_CONFIG,
          1,
          4,
        ),
    ).toThrow();
    terrain.water[4] = 1;
    expect(() => new CityDevelopment(terrain, DEFAULT_CONFIG, 1, 4)).toThrow();
  });
});

describe("elapsed-time batching", () => {
  const make = () =>
    new CityDevelopment(flatTerrain(5), DEFAULT_CONFIG, 42, 12);

  it("matches direct steps across whole, fractional, and partitioned time", () => {
    const direct = make();
    const whole = make();
    const partitioned = make();
    for (let i = 0; i < 200; i++) direct.step();
    whole.advance(200 * STEP_SECONDS);
    for (let i = 0; i < 200; i++) {
      partitioned.advance(0.1);
      partitioned.advance(0.1);
      partitioned.advance(0.05);
    }
    expect(observed(whole)).toEqual(observed(direct));
    expect(observed(partitioned)).toEqual(observed(direct));
  });

  it("retains a sub-step remainder and treats zero as a no-op", () => {
    const reference = make();
    const partitioned = make();
    partitioned.advance(0);
    partitioned.advance(0.24);
    expect(observed(partitioned)).toEqual(observed(reference));
    partitioned.advance(0.01);
    reference.step();
    expect(observed(partitioned)).toEqual(observed(reference));
  });

  it.each([-0.01, NaN, Infinity, -Infinity, Number.MAX_VALUE])(
    "rejects invalid elapsed time %s without mutation",
    (elapsed) => {
      const control = make();
      const model = make();
      const before = observed(model);
      expect(() => model.advance(elapsed)).toThrow();
      expect(observed(model)).toEqual(before);
      control.advance(0.25);
      model.advance(0.25);
      expect(observed(model)).toEqual(observed(control));
    },
  );
});
