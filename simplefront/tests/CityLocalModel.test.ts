import { DEFAULT_CONFIG } from "../src/demos/city-local/config";
import { CityModel } from "../src/demos/city-local/model";
import {
  createModel,
  createScenario,
  PRESETS,
} from "../src/demos/city-local/presets";
import {
  decodeScenario,
  encodeScenario,
} from "../src/demos/city-local/scenario";
import { StreetLayout } from "../src/demos/city-local/streets";
import { flatTerrain } from "../src/demos/city-local/terrain";

const centre = 40;
function fixture() {
  return new CityModel(
    flatTerrain(9),
    {
      ...DEFAULT_CONFIG,
      irregularity: 0,
      populationRate: 0,
      rate: 2000,
      maturationScale: 0,
      densify: 1,
    },
    42,
    centre,
  );
}

it("has no historical-origin distance bias on identical local neighbourhoods", () => {
  const m = fixture();
  m.found(10, 1);
  expect(m.inspect(11).score).toBe(m.inspect(41).score);
  expect(m.inspect(10).targetMaturity).toBe(m.inspect(40).targetMaturity);
  expect(m.stats(1).population).toBe(80); // extra seeds create no people
});

it("uses enemy buildings as four-sided physical support, spending only the owner's budget", () => {
  const m = fixture();
  for (const tile of [31, 39, 41, 49]) {
    m.setOwner(tile, 2);
    m.found(tile, 2);
  }
  m.changePopulation(20, 1);
  const beforeB = m.stats(2);
  expect(m.inspect(centre).supportingNeighbours).toBe(4);
  m.step();
  expect(m.level(centre)).toBe(2);
  expect(m.stats(1).capacity).toBe(200);
  expect(m.stats(2).capacity).toBe(400);
  expect(m.stats(2).invested).toBe(beforeB.invested); // vacant B has no work demand
  expect(m.inspect(centre).supportingNeighbours).toBe(0);
  m.step();
  expect(m.level(centre)).toBe(2);
});

it("captures just one tile and retains work without transferring or deleting population", () => {
  const m = fixture();
  m.changePopulation(20);
  m.step();
  const pending = m.pendingTile!;
  expect(m.pendingCredit).toBeGreaterThan(0);
  const progress = m.inspect(pending).progress;
  m.setOwner(pending, 2);
  expect(m.inspect(pending).progress).toBe(progress);
  m.setOwner(centre, 2);
  expect(m.owner(centre)).toBe(2);
  expect(m.owner(centre + 1)).toBe(pending === centre + 1 ? 2 : 1);
  expect(m.stats(1).capacity).toBe(0);
  expect(m.stats(1).population).toBe(100);
  expect(m.stats(2).population).toBe(0);
  expect(m.stats(2).capacity).toBe(100);
  m.step();
  expect(m.stats(1).population).toBe(100);
  m.setOwner(centre, 1);
  m.setOwner(pending, 1);
  expect(m.inspect(pending).progress).toBe(progress);
});

it("continues growing after losing its founding tile, without a replacement centre", () => {
  const m = fixture();
  m.found(60, 1);
  m.setOwner(centre, 2);
  m.changePopulation(20, 1);
  for (let i = 0; i < 8; i++) m.step();
  expect(m.stats(1).area).toBeGreaterThan(1);
  expect(m.level(centre)).toBe(1);
  expect(m.owner(centre)).toBe(2);
});

it("never develops unowned land or water and preserves development on neutral tiles", () => {
  const m = fixture();
  for (const tile of m.terrain.neighbours(centre)) m.setOwner(tile, 0);
  m.changePopulation(20);
  for (let i = 0; i < 10; i++) m.step();
  expect(m.stats(1).area).toBe(1);
  m.setOwner(centre, 0);
  expect(m.level(centre)).toBe(1);
  expect(m.stats(1).capacity).toBe(0);
  expect(() => m.setOwner(-1, 1)).toThrow();
  expect(() => m.setOwner(10, 3 as never)).toThrow();
});

it("keeps one work budget and one completion per player per step regardless of seed count", () => {
  const b = fixture();
  b.found(10, 1);
  for (let i = 0; i < 150; i++) {
    b.changePopulation(1e9);
    const before = Array.from(b.capacity, (_, t) => b.level(t));
    const invested = b.stats().invested;
    const budget = b.stats().developmentPerSecond * 0.25;
    b.step();
    let changed = 0;
    for (let t = 0; t < before.length; t++)
      if (b.level(t) !== before[t]) {
        changed++;
        expect(b.level(t)).toBe(before[t] + 1);
        if (before[t])
          expect(
            b.terrain.neighbours(t).filter((n) => before[n] >= before[t]),
          ).toHaveLength(4);
      }
    expect(changed).toBeLessThanOrEqual(1);
    expect(b.stats().invested - invested).toBeLessThanOrEqual(budget + 1e-8);
  }
});

it("preserves streets and levels after captures and casualties, including disconnected seeds", () => {
  const m = fixture();
  m.found(10, 1);
  const streets = new StreetLayout(m, 42);
  expect(streets.tiles.size).toBe(2);
  const before = JSON.stringify(
    [...streets.tiles].map(([t, s]) => [t, [...s.roads], [...s.buildings]]),
  );
  m.setOwner(centre, 2);
  m.changePopulation(-50, 1);
  streets.sync();
  expect(
    JSON.stringify(
      [...streets.tiles].map(([t, s]) => [t, [...s.roads], [...s.buildings]]),
    ),
  ).toBe(before);
  expect(m.level(centre)).toBe(1);
});

it("matches Demo 3's initial fertility calculation and does not clamp overcapacity survivors", () => {
  const m = new CityModel(flatTerrain(9), { ...DEFAULT_CONFIG }, 42, centre);
  expect(m.stats().populationPerSecond).toBeCloseTo(5.2);
  m.step();
  expect(m.stats().population).toBeCloseTo(81.3);
  m.setOwner(centre, 2);
  m.step();
  expect(m.stats(1).population).toBeCloseTo(81.3);
  expect(m.stats(1).populationPerSecond).toBe(0);
  expect(Number.isFinite(m.stats(1).occupancy)).toBe(true);
});

it.each(PRESETS.map((p) => p.id))(
  "runs every arrangement on %s deterministically and round-trips the starting setup",
  (preset) => {
    for (const layout of ["solo", "border", "districts"] as const) {
      const scenario = { ...createScenario(preset), layout };
      const a = createModel(scenario)!,
        b = createModel(decodeScenario(encodeScenario(scenario)))!;
      expect(a.stats(1).population).toBe(80);
      expect(a.stats(1).area).toBe(layout === "districts" ? 2 : 1);
      expect(a.stats(2).population).toBe(layout === "border" ? 80 : 0);
      expect(a.history[0]).toEqual(a.stats(1));
      a.activePlayer = 2;
      expect(a.history[0]).toEqual(a.stats(2));
      a.activePlayer = 1;
      for (let i = 0; i < 240; i++) {
        a.step();
        b.step();
      }
      expect(a.capacity).toEqual(b.capacity);
      expect(a.stats(1)).toEqual(b.stats(1));
      expect(a.stats(2)).toEqual(b.stats(2));
      expect(a.stats(1).area).toBeGreaterThan(layout === "districts" ? 2 : 1);
    }
  },
);

it.each([4, 32, 63])("honours a selected border origin in column %s", (x) => {
  const scenario = {
    ...createScenario("plain"),
    layout: "border" as const,
    centre: 32 * 64 + x,
  };
  const m = createModel(scenario)!;
  expect(m.centre).toBe(scenario.centre);
  expect(m.owner(scenario.centre)).toBe(1);
  expect(m.stats(1).population).toBe(80);
  expect(m.stats(2).population).toBe(80);
});

it("preserves queued establishment work from both players when ownership changes", () => {
  const s = { ...createScenario("plain"), layout: "border" as const };
  const m = createModel(s)!;
  m.changePopulation(20, 1);
  m.changePopulation(20, 2);
  m.step();
  const a = m.pendingTile!;
  m.activePlayer = 2;
  const b = m.pendingTile!;
  const aWork = m.inspect(a).progress,
    bWork = m.inspect(b).progress;
  expect(aWork).toBeGreaterThan(0);
  expect(bWork).toBeGreaterThan(0);
  m.setOwner(a, 2);
  expect(m.inspect(a).progress).toBe(aWork);
  expect(m.inspect(b).progress).toBe(bWork);
  m.changePopulation(-1e9, 2);
  const levels = m.capacity.slice();
  m.step();
  expect(m.capacity).toEqual(levels);
  expect(m.inspect(a).progress).toBe(aWork);
  expect(m.inspect(b).progress).toBe(bWork);
});

it("rejects cross-demo, invalid-owner arrangements and invalid terrain imports", () => {
  const saved = JSON.parse(encodeScenario(createScenario("plain")));
  expect(() =>
    decodeScenario(JSON.stringify({ ...saved, version: "city-population-3" })),
  ).toThrow();
  expect(() =>
    decodeScenario(JSON.stringify({ ...saved, layout: "bad" })),
  ).toThrow();
  saved.terrain.water[0] = 2;
  expect(() => decodeScenario(JSON.stringify(saved))).toThrow();
});
