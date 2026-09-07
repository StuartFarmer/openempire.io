import { DEFAULT_CONFIG } from "../src/demos/city-demand/config";
import { CityModel } from "../src/demos/city-demand/model";
import { flatTerrain, prepareTerrain } from "../src/demos/city-demand/terrain";

function city(width = 5, water: number[] = [], densify = 1) {
  const terrain = flatTerrain(width);
  for (const tile of water) terrain.water[tile] = 1;
  return new CityModel(
    prepareTerrain(terrain),
    {
      ...DEFAULT_CONFIG,
      rate: 2000,
      densify,
      maturationScale: 0,
    },
    42,
    Math.floor((width * width) / 2),
  );
}
function run(m: CityModel, steps = 1000) {
  for (let i = 0; i < steps; i++) {
    m.changePopulation(1e9);
    m.step();
  }
}

it("expands instead of maturing a lone centre even at 100% preference", () => {
  const m = city();
  expect(m.candidates().filter((c) => c.kind === "densify")).toEqual([]);
  run(m, 2);
  expect(m.stats().area).toBe(2);
  expect(m.level(m.centre)).toBe(1);
  expect(m.upgradeProgress(m.centre)).toBe(0);
});

it("requires all four cardinal neighbours before every level increase", () => {
  const m = city();
  let higherNeighbourUpgrades = 0;
  for (let step = 0; step < 1000; step++) {
    const before = Array.from(m.capacity, (_, tile) => m.level(tile));
    m.changePopulation(1e9);
    m.step();
    for (let tile = 0; tile < before.length; tile++) {
      if (before[tile] && m.level(tile) > before[tile]) {
        const neighbours = m.terrain.neighbours(tile);
        expect(neighbours).toHaveLength(4);
        expect(neighbours.every((n) => before[n] >= before[tile])).toBe(true);
        if (neighbours.some((n) => before[n] > before[tile]))
          higherNeighbourUpgrades++;
        expect(m.level(tile)).toBe(before[tile] + 1);
      }
    }
  }
  expect(higherNeighbourUpgrades).toBeGreaterThan(0);
  // A fully developed 5×5 plot supports layers 1, 2, 3, not an isolated tower.
  expect(m.level(12)).toBe(3);
  expect(m.level(7)).toBe(2);
  expect(m.level(2)).toBe(1);
});

it.each([7, 11, 13, 17])(
  "water on side %s blocks maturation despite developed diagonals",
  (water) => {
    const m = city(5, [water]);
    run(m);
    expect([6, 8, 16, 18].every((tile) => m.level(tile) >= 1)).toBe(true);
    expect(m.level(12)).toBe(1);
    expect(
      m.candidates().some((c) => c.tile === 12 && c.kind === "densify"),
    ).toBe(false);
  },
);

it("does not treat missing map-edge neighbours as support", () => {
  const m = city(1);
  run(m);
  expect(m.level(0)).toBe(1);
  expect(m.stats().status).toBe("constrained");
});

it("keeps eligible tiles at level one when the preference is zero", () => {
  const m = city(9, [], 0);
  run(m, 80);
  expect(m.candidates().some((c) => c.kind === "densify")).toBe(true);
  expect(m.candidates().some((c) => c.kind === "expand")).toBe(true);
  expect([...m.capacity.keys()].every((tile) => m.level(tile) <= 1)).toBe(true);
});
