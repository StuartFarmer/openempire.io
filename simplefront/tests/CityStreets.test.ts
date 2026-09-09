import { DEFAULT_CONFIG } from "../src/demos/city-population/config";
import { CityModel } from "../src/demos/city-population/model";
import { createScenario, PRESETS } from "../src/demos/city-population/presets";
import { StreetLayout, SUBCELLS } from "../src/demos/city-population/streets";
import { flatTerrain } from "../src/demos/city-population/terrain";

function model(width = 5) {
  return new CityModel(
    flatTerrain(width),
    { ...DEFAULT_CONFIG, rate: 2000 },
    42,
    Math.floor((width * width) / 2),
  );
}
function grow(m: CityModel, streets: StreetLayout, steps = 150) {
  for (let i = 0; i < steps; i++) {
    m.changePopulation(1e9);
    m.step();
    streets.sync();
  }
}
function assertConnected(streets: StreetLayout) {
  const cells = new Set<number>();
  const width = streets.model.terrain.width * SUBCELLS;
  for (const [tile, detail] of streets.tiles) {
    const tx = tile % streets.model.terrain.width,
      ty = Math.floor(tile / streets.model.terrain.width);
    for (const local of detail.roads)
      cells.add(
        (ty * SUBCELLS + Math.floor(local / SUBCELLS)) * width +
          tx * SUBCELLS +
          (local % SUBCELLS),
      );
  }
  const reached = new Set<number>(),
    queue = [cells.values().next().value!];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (reached.has(cell) || !cells.has(cell)) continue;
    reached.add(cell);
    if (cell % width) queue.push(cell - 1);
    if (cell % width < width - 1) queue.push(cell + 1);
    queue.push(cell - width, cell + width);
  }
  expect(reached.size).toBe(cells.size);
}

it("starts with a connected street and at least one road-facing house", () => {
  const m = model(),
    streets = new StreetLayout(m, 42);
  const centre = streets.tiles.get(m.centre)!;
  expect(centre.roads.size).toBeGreaterThan(1);
  expect(centre.buildings.size).toBeGreaterThan(0);
  assertConnected(streets);
});
it("connects every new neighbourhood across matching microcell boundaries", () => {
  const m = model(),
    streets = new StreetLayout(m, 42);
  for (let i = 0; i < 150; i++) {
    m.changePopulation(1e9);
    m.step();
    streets.sync();
    assertConnected(streets);
  }
  expect(streets.tiles.size).toBe(25);
  for (const [tile, detail] of streets.tiles) {
    expect(m.level(tile)).toBeGreaterThan(0);
    for (const b of detail.buildings.values()) {
      expect(detail.roads.has(b.cell)).toBe(false);
      expect(detail.roads.has(b.frontage)).toBe(true);
      const dx = Math.abs((b.cell % SUBCELLS) - (b.frontage % SUBCELLS));
      const dy = Math.abs(
        Math.floor(b.cell / SUBCELLS) - Math.floor(b.frontage / SUBCELLS),
      );
      expect(dx + dy).toBe(1);
    }
  }
});
it("fits every road and building inside a sixteen-pixel neighbourhood sprite", () => {
  const m = model(),
    streets = new StreetLayout(m, 42);
  grow(m, streets);
  for (const d of streets.tiles.values()) {
    for (const pixel of [...d.roads, ...d.reserved, ...d.buildings.keys()]) {
      expect(pixel).toBeGreaterThanOrEqual(0);
      expect(pixel).toBeLessThan(16);
    }
  }
});
it("preserves established roads and building positions through maturation and casualties", () => {
  const m = model(),
    streets = new StreetLayout(m, 42);
  grow(m, streets, 40);
  const original = [...streets.tiles].map(([tile, d]) => ({
    tile,
    roads: [...d.roads],
    buildings: [...d.buildings.keys()],
  }));
  grow(m, streets, 120);
  for (const old of original) {
    const next = streets.tiles.get(old.tile)!;
    expect(old.roads.every((c) => next.roads.has(c))).toBe(true);
    expect(old.buildings.every((c) => next.buildings.has(c))).toBe(true);
  }
  const before = JSON.stringify([...streets.tiles]);
  const roads = [...streets.tiles].map(([t, d]) => [
    t,
    [...d.roads],
    [...d.buildings],
  ]);
  m.changePopulation(-1e9);
  streets.sync();
  expect(
    [...streets.tiles].map(([t, d]) => [t, [...d.roads], [...d.buildings]]),
  ).toEqual(roads);
  expect(JSON.stringify([...streets.tiles])).toBe(before);
});
it("adds infill without moving existing houses when a tile levels up", () => {
  const m = model(),
    streets = new StreetLayout(m, 42);
  const first = streets.tiles.get(m.centre)!.buildings.size;
  grow(m, streets, 200);
  expect(m.level(m.centre)).toBe(3);
  expect(streets.tiles.get(m.centre)!.buildings.size).toBeGreaterThan(first);
});
it("adds loops when branching is enabled, not disconnected decorative road pieces", () => {
  const m = model(),
    tree = new StreetLayout(m, 42, { branching: 0, straightness: 1 });
  grow(m, tree, 200);
  const loops = new StreetLayout(m, 42, { branching: 1, straightness: 1 });
  const edges = (s: StreetLayout) =>
    [...s.tiles.values()].reduce((sum, d) => sum + d.connections.size, 0) / 2;
  expect(edges(tree)).toBe(tree.tiles.size - 1);
  expect(edges(loops)).toBeGreaterThan(loops.tiles.size - 1);
  assertConnected(loops);
});
it.each(PRESETS)("keeps streets on developed dry ground in $id", ({ id }) => {
  const s = createScenario(id),
    m = new CityModel(
      s.terrain,
      { ...s.config, rate: 2000 },
      s.seed,
      s.centre!,
    );
  const streets = new StreetLayout(m, s.seed);
  grow(m, streets, 180);
  expect(streets.tiles.size).toBe(m.stats().area);
  for (const tile of streets.tiles.keys())
    expect(s.terrain.water[tile]).toBe(0);
  assertConnected(streets);
});
it("never changes simulation state, randomness or outcomes, even with repeated visual updates", () => {
  const a = model(),
    b = model();
  const streets = new StreetLayout(a, 777);
  for (let i = 0; i < 250; i++) {
    a.step();
    b.step();
    streets.sync();
    streets.sync();
  }
  expect(a.capacity).toEqual(b.capacity);
  expect(a.stats()).toEqual(b.stats());
  expect(a.history).toEqual(b.history);
  expect(a.candidates()).toEqual(b.candidates());
});
it("is stable on redraw and repeatable for the same seed and growth sequence", () => {
  const a = model(),
    b = model();
  const x = new StreetLayout(a, 42),
    y = new StreetLayout(b, 42);
  grow(a, x);
  grow(b, y);
  const snapshot = (s: StreetLayout) =>
    [...s.tiles].map(([t, d]) => [
      t,
      [...d.roads],
      [...d.buildings],
      [...d.connections],
    ]);
  expect(snapshot(x)).toEqual(snapshot(y));
  const before = snapshot(x);
  x.sync();
  x.sync();
  expect(snapshot(x)).toEqual(before);
});
