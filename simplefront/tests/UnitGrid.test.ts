import { expect, test } from "vitest";
import { UnitType } from "../src/core/game/Game";
import { GameMapImpl } from "../src/core/game/GameMap";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { UnitGrid, type GridUnit } from "../src/core/game/UnitGrid";
import {
  makeEmptyGu,
  makeGameView,
  makePlayerUpdate,
  makeUnitUpdate,
} from "./util/viewStubs";

const map = () => new GameMapImpl(200, 100, new Uint8Array(20000), 0);

class TestUnit implements GridUnit {
  previous: number;
  active = true;
  building = false;
  reads = 0;
  constructor(
    public position: number,
    public kind = UnitType.Farmland,
  ) {
    this.previous = position;
  }
  tile() {
    return this.position;
  }
  lastTile() {
    return this.previous;
  }
  type() {
    return this.kind;
  }
  isActive() {
    this.reads++;
    return this.active;
  }
  isUnderConstruction() {
    return this.building;
  }
  owner() {
    return { id: () => "owner" };
  }
  move(position: number, grid: UnitGrid<TestUnit>) {
    this.previous = this.position;
    this.position = position;
    grid.updateUnitCell(this);
  }
}

test("exact-tile queries do not inspect unrelated farms in the same spatial bucket", async () => {
  const game = map();
  const grid = new UnitGrid<TestUnit>(game);
  const units = Array.from(
    { length: 500 },
    (_, i) => new TestUnit(game.ref(1 + (i % 50), 1 + Math.floor(i / 50))),
  );
  for (const unit of units) grid.addUnit(unit);
  expect(grid.nearbyUnits(game.ref(99, 99), 0, [UnitType.Farmland])).toEqual(
    [],
  );
  expect(grid.nearbyUnits(units[0].tile(), 0, UnitType.Farmland)).toEqual([
    { unit: units[0], distSquared: 0 },
  ]);
  expect(units.reduce((sum, unit) => sum + unit.reads, 0)).toBeLessThan(5);
});

test("exact-tile queries preserve type order, duplicates, live status and predicates", async () => {
  const game = map(),
    grid = new UnitGrid<TestUnit>(game);
  const tile = game.ref(30, 30);
  const farm = new TestUnit(tile),
    city = new TestUnit(tile, UnitType.Settlement),
    later = new TestUnit(tile);
  for (const unit of [farm, city, later]) grid.addUnit(unit);
  grid.addUnit(farm); // Idempotent add must not reorder an existing unit.
  const query = (types: UnitType[]) =>
    grid.nearbyUnits(tile, 0, types).map((v) => v.unit);
  expect(
    query([UnitType.Settlement, UnitType.Farmland, UnitType.Settlement]),
  ).toEqual([city, farm, later, city]);
  later.building = true;
  farm.active = false;
  expect(query([UnitType.Farmland])).toEqual([]);
  expect(
    grid
      .nearbyUnits(tile, 0, UnitType.Farmland, undefined, true)
      .map((v) => v.unit),
  ).toEqual([later]);
  expect(
    grid
      .nearbyUnits(
        tile,
        0,
        [UnitType.Farmland, UnitType.Settlement],
        ({ unit, distSquared }) => unit === city && distSquared === 0,
        true,
      )
      .map((v) => v.unit),
  ).toEqual([city]);
  grid.removeUnit(city);
  expect(query([UnitType.Settlement])).toEqual([]);
});

test("exact-tile movement preserves bucket insertion order and removes stale locations", async () => {
  const game = map(),
    grid = new UnitGrid<TestUnit>(game);
  const start = game.ref(30, 30),
    target = game.ref(31, 30),
    outside = game.ref(101, 30);
  const first = new TestUnit(start),
    second = new TestUnit(target);
  grid.addUnit(first);
  grid.addUnit(second);
  first.move(target, grid);
  const query = (tile: number, radius = 0) =>
    grid.nearbyUnits(tile, radius, UnitType.Farmland).map((v) => v.unit);
  expect(query(start)).toEqual([]);
  expect(query(target)).toEqual([first, second]);
  expect(query(target, 1)).toEqual([first, second]);
  first.move(outside, grid);
  expect(query(target)).toEqual([second]);
  expect(query(outside)).toEqual([first]);
  first.move(target, grid);
  expect(query(target)).toEqual([second, first]);
  expect(query(target, 1)).toEqual([second, first]);
  grid.removeUnit(second);
  expect(query(target)).toEqual([first]);
  grid.removeUnit(first);
  expect(query(target)).toEqual([]);
  grid.addUnit(first);
  expect(query(target)).toEqual([first]);
});

test("optimization retains existing bucket-edge query semantics", () => {
  const game = map(),
    grid = new UnitGrid<TestUnit>(game);
  for (const [x, y] of [
    [0, 0],
    [100, 30],
    [30, 0],
    [99, 99],
    [101, 30],
  ]) {
    const tile = game.ref(x, y),
      unit = new TestUnit(tile);
    grid.addUnit(unit);
    expect(
      grid.nearbyUnits(tile, 0, UnitType.Farmland).map((v) => v.unit),
    ).toEqual(x % 100 === 0 || y % 100 === 0 ? [] : [unit]);
    expect(
      grid.nearbyUnits(tile, 0.5, UnitType.Farmland).map((v) => v.unit),
    ).toEqual([unit]);
  }
});

test("multiple client updates with a start-of-tick lastTile leave no intermediate occupancy", () => {
  const game = map(),
    grid = new UnitGrid<TestUnit>(game);
  const unit = new TestUnit(game.ref(30, 30));
  grid.addUnit(unit);
  // UnitView keeps lastTile at the tick's start across multiple updates.
  for (const x of [31, 32, 101, 102]) {
    unit.position = game.ref(x, 30);
    grid.updateUnitCell(unit);
  }
  for (const x of [30, 31, 32, 101])
    expect(grid.nearbyUnits(game.ref(x, 30), 0, UnitType.Farmland)).toEqual([]);
  expect(
    grid.nearbyUnits(unit.tile(), 0, UnitType.Farmland).map((v) => v.unit),
  ).toEqual([unit]);
  grid.removeUnit(unit);
  expect(grid.nearbyUnits(unit.tile(), 0, UnitType.Farmland)).toEqual([]);
});

test("GameView exact occupancy follows within-tick return moves and inactive updates", () => {
  const game = makeGameView({ width: 200, height: 100 });
  const tile = (x: number) => game.ref(x, 30);
  const opening = makeEmptyGu(1);
  opening.updates[GameUpdateType.Player].push(makePlayerUpdate());
  opening.updates[GameUpdateType.Unit].push(makeUnitUpdate({ pos: tile(30) }));
  game.update(opening);
  const turn = makeEmptyGu(2);
  for (const x of [31, 32, 30])
    turn.updates[GameUpdateType.Unit].push(makeUnitUpdate({ pos: tile(x) }));
  game.update(turn);
  expect(
    game.nearbyUnits(tile(30), 0, UnitType.Warship).map((v) => v.unit.tile()),
  ).toEqual([tile(30)]);
  for (const x of [31, 32])
    expect(game.nearbyUnits(tile(x), 0, UnitType.Warship)).toEqual([]);
  const removed = makeEmptyGu(3);
  removed.updates[GameUpdateType.Unit].push(
    makeUnitUpdate({ pos: tile(33), isActive: false }),
  );
  game.update(removed);
  // Reactivation of the retained view must not expose a stale indexed location.
  const returned = makeEmptyGu(3);
  returned.updates[GameUpdateType.Unit].push(makeUnitUpdate({ pos: tile(35) }));
  game.update(returned);
  expect(game.nearbyUnits(tile(30), 0, UnitType.Warship)).toEqual([]);
  expect(game.nearbyUnits(tile(35), 0, UnitType.Warship).length).toBe(1);
});
