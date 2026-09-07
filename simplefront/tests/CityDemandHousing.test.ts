import {
  DEFAULT_CONFIG,
  levelCapacity,
  tileCapacity,
  tileMaturity,
} from "../src/demos/city-demand/config";
import { CityModel } from "../src/demos/city-demand/model";
import { flatTerrain } from "../src/demos/city-demand/terrain";

it.each([
  [0, 0],
  [1, 100],
  [2, 200],
  [5, 500],
  [10, 1000],
  [32, 3200],
  [100, 10000],
])("level %s provides %s housing", (level, housing) => {
  expect(levelCapacity(level, DEFAULT_CONFIG)).toBe(housing);
});
it("maps housing back to the same level-based maturity used for neighbourhoods", () => {
  expect(tileMaturity(200, DEFAULT_CONFIG)).toBeCloseTo(1 / 99);
  expect(tileCapacity(1 / 99, DEFAULT_CONFIG)).toBeCloseTo(200);
  expect(tileMaturity(10000, DEFAULT_CONFIG)).toBe(1);
});
it("awards 100 housing for establishment and every completed upgrade without changing support rules", () => {
  const terrain = flatTerrain(5);
  const model = new CityModel(
    terrain,
    { ...DEFAULT_CONFIG, rate: 2000, densify: 1 },
    42,
    12,
  );
  let upgrades = 0,
    establishments = 0;
  for (let step = 0; step < 1000; step++) {
    const before = Array.from(model.capacity, (_, i) => model.level(i));
    const housing = model.stats().capacity;
    model.changePopulation(1e9);
    model.step();
    let completed = 0;
    for (let tile = 0; tile < before.length; tile++) {
      const level = model.level(tile);
      expect(model.capacity[tile]).toBe(100 * level);
      if (level > before[tile]) {
        expect(level).toBe(before[tile] + 1);
        completed++;
        if (before[tile]) {
          upgrades++;
          const neighbours = terrain.neighbours(tile);
          expect(neighbours).toHaveLength(4);
          expect(neighbours.every((n) => before[n] >= before[tile])).toBe(true);
        } else establishments++;
      }
    }
    expect(model.stats().capacity - housing).toBe(100 * completed);
  }
  expect(upgrades).toBeGreaterThan(0);
  expect(establishments).toBe(24);
  expect(model.capacity[12]).toBe(300);
  expect(model.stats().capacity).toBe(3500);
});
