import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import {
  cityDevelopmentEligibility,
  cityDevelopmentState,
  foundCityDevelopment,
  organicHousingCapacity,
  tickCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import { CityDevelopmentState as PhysicalDevelopment } from "../src/core/development/CityDevelopmentState";
import { purchasePaintedTile } from "../src/core/execution/PaintTilesExecution";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { SimpleFrontCityConfig } from "../src/core/game/Rulesets";
import { CityModel } from "../src/demos/city-local/model";
import { flatTerrain } from "../src/demos/city-local/terrain";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

class LocalConfig extends SimpleFrontCityConfig {
  setInertFood(): void {}
  override cityDevelopment() {
    return { ...DEFAULT_CONFIG, populationRate: 0, rate: 2000, densify: 1 };
  }
}

async function fixture() {
  const infos = ["alice", "bob", "charlie"].map(
    (id) => new PlayerInfo(id, PlayerType.Human, null, id),
  );
  const game = await setup(
    "plains",
    {},
    infos,
    undefined,
    LocalConfig as unknown as typeof TestConfig,
  );
  const [a, b, c] = infos.map((info) => game.player(info.id));
  for (const [i, player] of [a, b, c].entries()) {
    const tile = game.ref(30 + 20 * i, 30);
    player.conquer(tile);
    player.setSpawnTile(tile);
    player.setTroops(10000);
  }
  const centre = game.ref(30, 30);
  foundCityDevelopment(game, a, centre);
  a.buildUnit(UnitType.Settlement, centre, {});
  return { game, a, b, c, centre };
}

test("capture transfers exactly one tile's housing without its population or level", async () => {
  const { game, a, b, centre } = await fixture();
  const other = game.ref(70, 70);
  a.conquer(other);
  foundCityDevelopment(game, a, other);
  const level = cityDevelopmentState(a)!.model.level(centre);
  const population = [a.troops(), b.troops()];
  b.conquer(centre);
  expect(cityDevelopmentState(a)!.model.level(centre)).toBe(level);
  expect([a.troops(), b.troops()]).toEqual(population);
  expect(organicHousingCapacity(game, b)).toBe(10000 * level);
  expect(organicHousingCapacity(game, a)).toBe(10000);
  a.conquer(centre);
  expect(organicHousingCapacity(game, a)).toBe(20000);
  expect(organicHousingCapacity(game, b)).toBe(10000);
});

test("foreign and neutral buildings support upgrades without origin control", async () => {
  const { game, a, b, c, centre } = await fixture();
  const supports: number[] = [];
  game.forEachNeighbor(centre, (tile) => supports.push(tile));
  for (const [i, tile] of supports.entries()) {
    const owner = i % 2 ? b : c;
    owner.conquer(tile);
    foundCityDevelopment(game, owner, tile);
    if (i === 0) owner.relinquish(tile);
  }
  a.units(UnitType.Settlement)[0].delete(false);
  expect(organicHousingCapacity(game, a)).toBe(10000);
  for (let i = 0; i < 3; i++) tickCityDevelopment(game, a, 10000, 0);
  expect(cityDevelopmentState(a)!.model.level(centre)).toBe(2);
  expect(organicHousingCapacity(game, a)).toBe(20000);
  expect(organicHousingCapacity(game, b)).toBe(20000);
  expect(organicHousingCapacity(game, c)).toBe(10000);
});

test("spamming disconnected centres cannot purchase housing or population", async () => {
  const { game, a } = await fixture();
  const population = a.troops();
  for (let i = 0; i < 9; i++) {
    const tile = game.ref(10 + i * 8, 80);
    a.conquer(tile);
    a.addFoodMilli(2_000_000n);
    const food = a.foodMilli();
    expect(purchasePaintedTile(game, a, "city", tile)).toBe("invalid");
    expect(a.foodMilli()).toBe(food);
    expect(cityDevelopmentState(a)!.model.level(tile)).toBe(0);
  }
  expect(a.troops() - population).toBe(0);
  expect(organicHousingCapacity(game, a)).toBe(10000);
});

test("city removal, relinquishment and player defeat preserve physical housing", async () => {
  const { game, a, b, centre } = await fixture();
  a.units(UnitType.Settlement)[0].delete(false);
  expect(organicHousingCapacity(game, a)).toBe(10000);
  a.relinquish(centre);
  expect(a.isAlive()).toBe(false);
  expect(cityDevelopmentState(a)!.model.level(centre)).toBe(1);
  expect(organicHousingCapacity(game, a)).toBe(10000);
  b.conquer(centre);
  expect(organicHousingCapacity(game, b)).toBe(10000);
  expect(purchasePaintedTile(game, b, "city", centre)).toBe("invalid");
  expect(purchasePaintedTile(game, b, "farm", centre)).toBe("invalid");
});

test("construction on a disconnected neighbourhood continues after seed capture", async () => {
  const { game, a, b, centre } = await fixture();
  const remote = game.ref(70, 70);
  a.conquer(remote);
  foundCityDevelopment(game, a, remote);
  game.forEachNeighbor(remote, (tile) => a.conquer(tile));
  b.conquer(centre);
  for (let i = 0; i < 10; i++) tickCityDevelopment(game, a, 10000, 0);
  expect(organicHousingCapacity(game, a)).toBe(20000);
  expect(organicHousingCapacity(game, b)).toBe(10000);
});

test("unfinished work survives capture and both players' queued projects coexist", async () => {
  const { game, a, b, centre } = await fixture();
  game.forEachNeighbor(centre, (tile) => a.conquer(tile));
  const second = game.ref(50, 30);
  foundCityDevelopment(game, b, second);
  b.buildUnit(UnitType.Settlement, second, {});
  game.forEachNeighbor(second, (tile) => b.conquer(tile));
  for (let i = 0; i < 3; i++) {
    tickCityDevelopment(game, a, 10000, 0);
    tickCityDevelopment(game, b, 10000, 0);
  }
  const model = cityDevelopmentState(a)!.model;
  expect(cityDevelopmentState(b)!.model).toBe(model);
  const tile = model.pendingFor((tile) => game.owner(tile) === a)!;
  const secondTile = model.pendingFor((tile) => game.owner(tile) === b)!;
  const credit = model.work(tile);
  const secondCredit = model.work(secondTile);
  expect(credit).toBeGreaterThan(0);
  expect(secondCredit).toBeGreaterThan(0);
  b.conquer(tile);
  expect(model.work(tile)).toBe(credit);
  expect(model.work(secondTile)).toBe(secondCredit);
  a.relinquish(centre);
  for (let i = 0; i < 10; i++) tickCityDevelopment(game, a, 10000, 0);
  expect(model.work(tile)).toBe(credit);
  a.conquer(tile);
  expect(model.work(tile)).toBe(credit);
});

test("ten disconnected neighbourhoods share one completion opportunity per step", async () => {
  const { game, a } = await fixture();
  for (let i = 0; i < 9; i++) {
    const tile = game.ref(10 + i * 8, 80);
    a.conquer(tile);
    foundCityDevelopment(game, a, tile);
    game.forEachNeighbor(tile, (next) => a.conquer(next));
  }
  const model = cityDevelopmentState(a)!.model;
  expect(organicHousingCapacity(game, a)).toBe(100000);
  for (let i = 0; i < 100; i++) {
    const before = model.capacity.slice();
    tickCityDevelopment(game, a, 10000000, 0);
    const completed = [...model.developedTiles()].filter(
      (tile) => model.capacity[tile] > before[tile],
    );
    expect(completed.length).toBeLessThanOrEqual(1);
    for (const tile of completed)
      expect(model.capacity[tile] - before[tile]).toBe(100);
  }
  expect(organicHousingCapacity(game, a)).toBeGreaterThan(100000);
});

test("matches Demo 4's local candidates, work and completions on identical fixed terrain", () => {
  const terrain = flatTerrain(9);
  const config = { ...DEFAULT_CONFIG, populationRate: 0, rate: 2000 };
  const model = new PhysicalDevelopment(terrain, config, 42);
  const demo = new CityModel(terrain, config, 42, 40);
  const account = model.account("one", 42);
  model.found(40);
  model.found(10);
  demo.found(10);
  for (let i = 0; i < 200; i++) {
    demo.changePopulation(1e9);
    const housing = model.usableCapacity(() => true);
    expect(model.candidates(() => true)).toEqual(demo.candidates());
    model.advanceConstructionStep(account, housing, housing, () => true);
    demo.step();
    expect(model.capacity).toEqual(demo.capacity);
    expect(model.pendingFor(() => true)).toBe(demo.pendingTile);
    if (demo.pendingTile !== null)
      expect(model.work(demo.pendingTile)).toBe(demo.pendingCredit);
  }
});

test("snapshot restore retains unfinished ordering, RNG, partial timing and development order", async () => {
  const { game, a, b, centre } = await fixture();
  const model = cityDevelopmentState(a)!.model;
  const second = game.ref(50, 30);
  foundCityDevelopment(game, b, second);
  game.forEachNeighbor(centre, (tile) => a.conquer(tile));
  game.forEachNeighbor(second, (tile) => b.conquer(tile));
  for (let i = 0; i < 4; i++) {
    tickCityDevelopment(game, b, 10000, 0);
    tickCityDevelopment(game, a, 10000, 0);
  }
  const remote = game.ref(10, 10);
  a.conquer(remote);
  foundCityDevelopment(game, a, remote);
  const snapshot = JSON.parse(JSON.stringify(model.deterministicState()));
  const order = [...model.developedTiles()];
  const advance = () => {
    for (let i = 0; i < 40; i++) {
      tickCityDevelopment(game, a, 30000, 0);
      tickCityDevelopment(game, b, 30000, 0);
    }
    return model.deterministicState();
  };
  const expected = advance();
  model.restore(snapshot);
  expect([...model.developedTiles()]).toEqual(order);
  expect(model.deterministicState()).toEqual(snapshot);
  expect(advance()).toEqual(expected);
  const before = model.deterministicState();
  expect(() =>
    model.restore({ ...snapshot, version: "city-population-3" }),
  ).toThrow();
  expect(() => model.restore({ ...snapshot, unfinished: [999999] })).toThrow();
  expect(model.deterministicState()).toEqual(before);
});

test("neutral development participates in the global game hash", async () => {
  const first = await fixture(),
    second = await fixture();
  first.a.relinquish(first.centre);
  second.a.relinquish(second.centre);
  const model = cityDevelopmentState(first.a)!.model;
  const snapshot = model.deterministicState();
  snapshot.tiles[0][1] = 2;
  model.restore(snapshot);
  const aHash = first.game.executeNextTick()[GameUpdateType.Hash][0].hash;
  const bHash = second.game.executeNextTick()[GameUpdateType.Hash][0].hash;
  expect(aHash).not.toBe(bHash);
});

test("damaged captured housing transfers immediately while construction waits", async () => {
  const { game, a, b, centre } = await fixture();
  game.addTileDamage(centre, 900);
  b.conquer(centre);
  expect(organicHousingCapacity(game, a)).toBe(10000);
  expect(organicHousingCapacity(game, b)).toBe(10000);
  expect(cityDevelopmentEligibility(game, b)(centre)).toBe(false);
});

test("global development hash includes frontier ownership even when territory counts match", async () => {
  const first = await fixture(),
    second = await fixture();
  for (const { game, a, b, centre } of [first, second]) {
    a.conquer(centre + 1);
    b.conquer(game.ref(80, 80));
  }
  first.b.conquer(first.centre + 1);
  first.a.conquer(first.game.ref(80, 80));
  expect(first.a.numTilesOwned()).toBe(second.a.numTilesOwned());
  expect(first.b.numTilesOwned()).toBe(second.b.numTilesOwned());
  const aHash = first.game.executeNextTick()[GameUpdateType.Hash][0].hash;
  const bHash = second.game.executeNextTick()[GameUpdateType.Hash][0].hash;
  expect(aHash).not.toBe(bHash);
});

test("unfinished maturation follows a captured ordinary tile and survives recapture", async () => {
  const { game, a, b, c } = await fixture();
  const tile = game.ref(80, 80);
  a.conquer(tile);
  foundCityDevelopment(game, a, tile);
  game.forEachNeighbor(tile, (next) => {
    c.conquer(next);
    foundCityDevelopment(game, c, next);
  });
  const state = cityDevelopmentState(a)!;
  for (let i = 0; i < 3; i++) tickCityDevelopment(game, a, 17200, 0);
  const work = state.model.work(tile);
  expect(work).toBeGreaterThan(0);
  expect(state.model.level(tile)).toBe(1);
  const population = [a.troops(), b.troops()];
  b.conquer(tile);
  expect(state.model.work(tile)).toBe(work);
  expect(state.model.level(tile)).toBe(1);
  expect(organicHousingCapacity(game, b)).toBe(10000);
  expect([a.troops(), b.troops()]).toEqual(population);
  for (let i = 0; i < 3; i++) tickCityDevelopment(game, b, 8600, 0);
  expect(state.model.work(tile)).toBeGreaterThan(work);
  const capturedWork = state.model.work(tile);
  a.conquer(tile);
  expect(state.model.work(tile)).toBe(capturedWork);
});
