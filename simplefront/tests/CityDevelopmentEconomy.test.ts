import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import {
  cityDevelopmentEligibility,
  cityDevelopmentState,
  foundCityDevelopment,
  isOrganicUrbanTile,
  tickCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import { CityDevelopmentState } from "../src/core/development/CityDevelopmentState";
import { cityDevelopmentTerrain } from "../src/core/development/CityDevelopmentTerrain";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import {
  PaintTilesExecution,
  purchasePaintedTile,
} from "../src/core/execution/PaintTilesExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { TransportShipExecution } from "../src/core/execution/TransportShipExecution";
import {
  paintedResources,
  paintedState,
  tickPaintedEconomy,
} from "../src/core/execution/utils/PaintedEconomy";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameMapImpl } from "../src/core/game/GameMap";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { PlayerImpl } from "../src/core/game/PlayerImpl";
import {
  SimpleFrontCityConfig,
  SimpleFrontConfig,
} from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

class CityTestConfig extends SimpleFrontCityConfig {
  setInertFood(): void {}
}

class DefaultSimpleTestConfig extends SimpleFrontConfig {
  setInertFood(): void {}
}

class StaticCityTestConfig extends CityTestConfig {
  override cityDevelopment() {
    return { ...DEFAULT_CONFIG, rate: 0 };
  }
}

class FastCityTestConfig extends CityTestConfig {
  override cityDevelopment() {
    return { ...DEFAULT_CONFIG, populationRate: 0, rate: 2_000 };
  }
}

async function cityFixture(ConfigClass = CityTestConfig, spawnOnly = false) {
  const info = new PlayerInfo("city", PlayerType.Human, null, "city");
  const game = await setup(
    "plains",
    {},
    [info],
    undefined,
    ConfigClass as unknown as typeof TestConfig,
    false,
  );
  const centre = game.ref(50, 50);
  const spawn = new SpawnExecution("city-test", info, centre);
  if (spawnOnly) {
    spawn.init(game, game.ticks());
    spawn.tick(game.ticks());
  } else {
    game.addExecution(spawn);
    game.executeNextTick();
    game.executeNextTick();
  }
  return { game, player: game.player(info.id), centre };
}

test("organic spawn founds 10000 housing with 8000 real troops and an off-ring farm", async () => {
  const { game, player } = await cityFixture(CityTestConfig, true);
  const settlement = player.units(UnitType.Settlement)[0];
  const farm = player.units(UnitType.Farmland)[0];

  expect(player.troops()).toBe(8000);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  expect(player.foodMilli()).toBe(4_000_000n);
  expect(player.units(UnitType.Settlement)).toHaveLength(1);
  expect(player.units(UnitType.Farmland)).toHaveLength(1);
  expect(
    game.manhattanDist(settlement.tile(), farm.tile()),
  ).toBeGreaterThanOrEqual(2);
});

test("scaled births include recovery and the HUD reports the same rate", async () => {
  const { game, player } = await cityFixture();
  // 80% occupied, fertility 4.5: 520 people/s, or 52 per 100ms tick.
  const births = tickCityDevelopment(game, player, 8000, 0);
  expect(births.amount + births.credit).toBeCloseTo(8052, 10);
  expect(tickCityDevelopment(game, player, 0, 0).amount).toBe(20);
  player.setTroops(8000);
  expect(paintedResources(game, player).troopGain).toBeCloseTo(52, 10);
});

test("100x game population preserves unscaled model work, expansion and upgrades", async () => {
  const { game, player } = await cityFixture(FastCityTestConfig);
  const state = cityDevelopmentState(player)!;
  const snapshot = state.model.deterministicState();
  const reference = new CityDevelopmentState(
    state.model.terrain,
    state.model.config,
    snapshot.seed,
  );
  reference.restore(snapshot);
  const account = reference.account(player.id());
  const eligible = cityDevelopmentEligibility(game, player);
  for (let i = 0; i < 1000; i++) {
    tickCityDevelopment(
      game,
      player,
      paintedResources(game, player).troopCapacity,
      0,
    );
    account.elapsedMilliseconds += game.config().msPerTick();
    while (account.elapsedMilliseconds >= 250) {
      account.elapsedMilliseconds -= 250;
      const housing = reference.usableCapacity(
        (tile) => game.owner(tile) === player,
      );
      reference.advanceConstructionStep(account, housing, housing, eligible);
    }
    expect(state.model.deterministicState()).toEqual(
      reference.deterministicState(),
    );
  }
  expect(
    [...state.model.developedTiles()].some(
      (tile) => state.model.level(tile) > 1,
    ),
  ).toBe(true);
});

test("legacy painted fixture spawn remains at 2000 troops and 10000 capacity", async () => {
  const info = new PlayerInfo("default", PlayerType.Human, null, "default");
  const game = await setup(
    "plains",
    {},
    [info],
    undefined,
    DefaultSimpleTestConfig as unknown as typeof TestConfig,
    false,
  );
  const spawn = new SpawnExecution("default-test", info, game.ref(50, 50));
  spawn.init(game, game.ticks());
  spawn.tick(game.ticks());
  const player = game.player(info.id);
  expect(player.troops()).toBe(2000);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
});

test("replayed selected organic spawn leaves the founded city unchanged", async () => {
  const { game, player } = await cityFixture();
  const state = cityDevelopmentState(player)!;
  const before = {
    development: state.model.deterministicState(),
    food: player.foodMilli(),
    troops: player.troops(),
    units: player
      .units(UnitType.Settlement, UnitType.Farmland)
      .map((unit) => [unit.type(), unit.tile()]),
    tiles: [...player.tiles()],
  };
  const replay = new SpawnExecution(
    "city-test",
    player.info(),
    game.ref(80, 80),
  );
  replay.init(game, game.ticks());
  replay.tick(game.ticks());

  expect({
    development: state.model.deterministicState(),
    food: player.foodMilli(),
    troops: player.troops(),
    units: player
      .units(UnitType.Settlement, UnitType.Farmland)
      .map((unit) => [unit.type(), unit.tile()]),
    tiles: [...player.tiles()],
  }).toEqual(before);
});

test("non-plot structures preserve physical housing", async () => {
  const { game, player, centre } = await cityFixture();
  const state = cityDevelopmentState(player)!;
  player.setTroops(10000);
  for (
    let i = 0;
    i < 100 && [...state.model.developedTiles()].length === 1;
    i++
  )
    game.executeNextTick();
  const urban = [...state.model.developedTiles()].find(
    (tile) => tile !== centre,
  )!;
  const before = paintedResources(game, player).troopCapacity;
  const structure = player.buildUnit(UnitType.DefensePost, urban, {});

  expect(game.plotAt(urban)).toBeUndefined();
  expect(paintedResources(game, player).troopCapacity).toBe(before);
  structure.delete(false);
  expect(paintedResources(game, player).troopCapacity).toBe(before);
});

test("terrain slope sees dry impassable height without inventing nearby water", () => {
  const land = 1 << 7;
  const map = new GameMapImpl(
    5,
    1,
    Uint8Array.from([0, land, land, land | 31, land]),
    4,
  );
  const terrain = cityDevelopmentTerrain(map);

  expect(terrain.height[3]).toBe(1);
  expect(terrain.slope[2]).toBe(1);
  expect(terrain.water[3]).toBe(1);
  expect(terrain.waterDistance[2]).toBe(2);
  expect(terrain.waterDistance[4]).toBe(4);
});

test("fertility recruits idle troops by game time once per tick", async () => {
  const { game, player } = await cityFixture();
  player.setTroops(8000);
  const state = paintedState(player);
  state.troopCredit = 0;
  state.lastRefillTick = -1;

  tickPaintedEconomy(game, player);
  expect(player.troops() + state.troopCredit).toBeCloseTo(8052, 10);
  const troops = player.troops(),
    credit = state.troopCredit;
  tickPaintedEconomy(game, player);
  expect(player.troops()).toBe(troops);
  expect(state.troopCredit).toBe(credit);
  game.executeNextTick();
  game.executeNextTick();
  expect(player.troops()).toBeGreaterThan(troops);
  expect(state.troopCredit).toBeGreaterThanOrEqual(0);
  expect(state.troopCredit).toBeLessThan(1);
});

test("a refill reuses birth and housing calculations after clamping surplus food", async () => {
  const { game, player } = await cityFixture();
  player.setTroops(8000);
  const capacity = paintedResources(game, player).foodCapacityMilli;
  player.addFoodMilli(capacity + 1000n);
  const state = paintedState(player);
  state.troopCredit = 0.75;
  state.foodCredit = 0.5;
  state.lastRefillTick = -1;
  const development = cityDevelopmentState(player)!;
  development.elapsedMilliseconds = 0;
  const births = vi.spyOn(development.model, "populationPerSecondFor");
  const housing = vi.spyOn(development.model, "usableCapacity");
  try {
    tickPaintedEconomy(game, player);
    expect(player.foodMilli()).toBe(capacity);
    expect(state.foodCredit).toBe(0);
    expect(player.troops() + state.troopCredit).toBeCloseTo(8052.75, 10);
    expect(births).toHaveBeenCalledTimes(1);
    expect(housing).toHaveBeenCalledTimes(1);
  } finally {
    births.mockRestore();
    housing.mockRestore();
  }
});

test("core ticks construct only legal owned cells and preserve farms and food", async () => {
  const { game, player } = await cityFixture();
  player.setTroops(10000);
  const beforeFood = player.foodMilli();
  const beforeFarms = player.units(UnitType.Farmland).length;
  const state = cityDevelopmentState(player)!;
  const before = Array.from(state.model.capacity, (_, tile) =>
    state.model.level(tile),
  );

  for (let i = 0; i < 100; i++) game.executeNextTick();

  const developed = Array.from(state.model.capacity, (_, tile) => tile).filter(
    (tile) => state.model.level(tile) > before[tile],
  );
  expect(developed.length).toBeGreaterThan(0);
  for (const tile of developed) {
    expect(state.model.level(tile)).toBe(before[tile] + 1);
    expect(game.owner(tile)).toBe(player);
    expect(game.tileDamage(tile)).toBe(0);
    expect(game.plotAt(tile)).toBeUndefined();
    expect(player.density(tile)).toBe(0);
    expect(player.landUse(tile)).toBeUndefined();
  }
  expect(player.units(UnitType.Farmland)).toHaveLength(beforeFarms);
  expect(player.foodMilli()).toBeGreaterThanOrEqual(beforeFood);
  expect((player as PlayerImpl)._birthCredit).toBe(0);
  expect(player.foodFlow()).toEqual({
    production: 0,
    consumption: 0,
    starvedTroops: 0,
    capacity: 0,
    population: 0,
  });
  const lost = developed[0];
  const capacity = paintedResources(game, player).troopCapacity;
  const level = state.model.level(lost);
  player.relinquish(lost);
  expect(paintedResources(game, player).troopCapacity).toBe(
    capacity - state.model.capacity[lost] * 100,
  );
  expect(state.model.level(lost)).toBe(level);
  player.conquer(lost);
  expect(paintedResources(game, player).troopCapacity).toBe(capacity);
});

test("core upgrades one level only after four equal-or-higher supports", async () => {
  const { game, player } = await cityFixture(FastCityTestConfig);
  const model = cityDevelopmentState(player)!.model;
  let upgraded = false;

  for (let tick = 0; tick < 2_000 && !upgraded; tick++) {
    player.setTroops(paintedResources(game, player).troopCapacity);
    const before = new Map(
      [...model.developedTiles()].map((tile) => [tile, model.level(tile)]),
    );
    game.executeNextTick();
    for (const tile of model.developedTiles()) {
      const prior = before.get(tile) ?? 0;
      const level = model.level(tile);
      if (level === prior) continue;
      expect(level).toBe(prior + 1);
      if (prior === 0) continue;
      const neighbours: number[] = [];
      game.forEachNeighbor(tile, (neighbour) => neighbours.push(neighbour));
      expect(neighbours).toHaveLength(4);
      expect(
        neighbours.every((neighbour) => (before.get(neighbour) ?? 0) >= prior),
      ).toBe(true);
      upgraded = true;
    }
  }

  expect(upgraded).toBe(true);
});

test("city paint commands are rejected and farms reject urban cells", async () => {
  const { game, player, centre } = await cityFixture();
  const second = [...player.tiles()].find(
    (tile) => tile !== centre && !game.plotAt(tile),
  )!;
  const before = player.foodMilli();

  expect(purchasePaintedTile(game, player, "city", centre)).toBe("invalid");
  expect(purchasePaintedTile(game, player, "city", second)).toBe("invalid");
  game.addExecution(new PaintTilesExecution(player, "city", [second, centre]));
  game.executeNextTick();
  game.executeNextTick();
  expect(player.units(UnitType.Settlement)).toHaveLength(1);
  expect(player.foodMilli()).toBeGreaterThanOrEqual(before);
  expect(purchasePaintedTile(game, player, "farm", centre)).toBe("invalid");
});

test("ownership loss removes usable housing without erasing development work", async () => {
  const { game, player } = await cityFixture();
  const state = cityDevelopmentState(player)!;
  player.setTroops(10000);
  for (
    let i = 0;
    i < 50 &&
    state.model.pendingFor((tile) => game.owner(tile) === player) === null;
    i++
  )
    game.executeNextTick();
  expect(
    state.model.pendingFor((tile) => game.owner(tile) === player),
  ).not.toBeNull();
  const tile = state.model.pendingFor((tile) => game.owner(tile) === player)!;
  const credit = state.model.work(tile);
  const levels = new Map(
    [...state.model.developedTiles()].map((developed) => [
      developed,
      state.model.level(developed),
    ]),
  );

  player.setTroops(1000);
  for (let i = 0; i < 20; i++) game.executeNextTick();
  expect(state.model.work(tile)).toBe(credit);
  expect(
    new Map(
      [...state.model.developedTiles()].map((developed) => [
        developed,
        state.model.level(developed),
      ]),
    ),
  ).toEqual(levels);
  player.setTroops(10000);
  const troops = player.troops();

  player.relinquish(tile);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  for (let i = 0; i < 20; i++) game.executeNextTick();
  expect(state.model.work(tile)).toBe(credit);
  expect(player.troops()).toBe(troops);
  player.conquer(tile);
  expect(state.model.work(tile)).toBe(credit);
});

test("founder loss retains minimum housing and recovers food and troops without buying a replacement", async () => {
  const { game, player } = await cityFixture(StaticCityTestConfig);
  const state = cityDevelopmentState(player)!;
  const model = state.model;
  const troops = player.troops();
  const oldCentre = player.units(UnitType.Settlement)[0].tile();
  player.units(UnitType.Farmland)[0].delete(false);
  player.units(UnitType.Settlement)[0].delete(false);
  player.relinquish(oldCentre);
  player.removeFoodMilli(player.foodMilli());

  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  for (let i = 0; i < 2000 && player.foodMilli() < 2_000_000n; i++)
    game.executeNextTick();
  expect(player.foodMilli()).toBeGreaterThanOrEqual(2_000_000n);
  expect(player.troops()).toBeGreaterThan(troops);
  const replacement = [...player.tiles()].find((tile) => !game.plotAt(tile))!;
  const before = player.foodMilli();
  expect(purchasePaintedTile(game, player, "city", replacement)).toBe(
    "invalid",
  );
  expect(player.foodMilli()).toBe(before);
  expect(cityDevelopmentState(player)!.model).toBe(model);
  expect(model.level(replacement)).toBe(0);
  expect(model.level(oldCentre)).toBe(1);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  player.conquer(oldCentre);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
});

test("development participates in deterministic hashing", async () => {
  const a = await cityFixture();
  const b = await cityFixture();
  a.player.setTroops(10000);
  b.player.setTroops(10000);
  for (let i = 0; i < 100; i++) {
    a.game.executeNextTick();
    b.game.executeNextTick();
  }
  expect((a.player as PlayerImpl).hash()).toBe((b.player as PlayerImpl).hash());
  cityDevelopmentState(a.player)!.elapsedMilliseconds++;
  expect((a.player as PlayerImpl).hash()).not.toBe(
    (b.player as PlayerImpl).hash(),
  );
  cityDevelopmentState(a.player)!.elapsedMilliseconds--;
  const tile = Array.from(
    { length: cityDevelopmentState(a.player)!.model.capacity.length },
    (_, index) => index,
  ).find((index) => isOrganicUrbanTile(a.player, index) && index !== a.centre)!;
  a.player.relinquish(tile);
  expect((a.player as PlayerImpl).hash()).not.toBe(
    (b.player as PlayerImpl).hash(),
  );
});

test("an 8000-troop opening pushes farther than 80 at unchanged terrain and food costs", async () => {
  const small = await cityFixture(StaticCityTestConfig, true);
  const large = await cityFixture(StaticCityTestConfig, true);
  const run = ({ game, player }: typeof small, troops: number) => {
    const before = player.numTilesOwned();
    const attack = new AttackExecution(troops, player, null);
    attack.init(game, game.ticks());
    expect(player.foodMilli()).toBe(4_000_000n - BigInt(troops) * 200n);
    game.addExecution(attack);
    for (let i = 0; i < 100; i++) game.executeNextTick();
    return player.numTilesOwned() - before;
  };
  const smallGain = run(small, 80);
  const largeGain = run(large, 8000);
  expect(largeGain).toBeGreaterThan(smallGain);
  expect(largeGain).toBeGreaterThan(0);
});

test("the 10000 housing floor survives losing all development and restores troops", async () => {
  const { game, player, centre } = await cityFixture();
  player.relinquish(centre);
  player.setTroops(0);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  for (let i = 0; i < 20; i++) game.executeNextTick();
  expect(player.troops()).toBeGreaterThan(0);
  player.conquer(centre);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
});

test("additional centre purchases cannot create housing, units or food charges", async () => {
  const { game, player } = await cityFixture();
  const sites = [...player.tiles()]
    .filter((tile) => !game.plotAt(tile))
    .slice(0, 3);
  const before = player.foodMilli();
  const snapshot = cityDevelopmentState(player)!.model.deterministicState();
  for (const tile of sites)
    expect(purchasePaintedTile(game, player, "city", tile)).toBe("invalid");
  expect(player.foodMilli()).toBe(before);
  expect(player.units(UnitType.Settlement)).toHaveLength(1);
  // The alternate build_unit route must enforce the same rule as paint_tiles.
  const construction = new ConstructionExecution(
    player,
    UnitType.Settlement,
    sites[0],
  );
  construction.init(game, game.ticks());
  construction.tick(game.ticks());
  expect(player.units(UnitType.Settlement)).toHaveLength(1);
  expect(player.foodMilli()).toBe(before);
  expect(cityDevelopmentState(player)!.model.deterministicState()).toEqual(
    snapshot,
  );
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
});

test("organic dispatch is charged exactly and creates no recruitment headroom", async () => {
  const { game, player } = await cityFixture();
  player.setTroops(10000);
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(400_000n);
  paintedState(player).lastRefillTick = game.ticks();

  game.addExecution(new AttackExecution(2000, player, null));
  game.executeNextTick();

  expect(player.foodMilli()).toBe(0n);
  expect(paintedResources(game, player)).toMatchObject({
    idleTroops: 8000,
    deployedTroops: 2000,
    totalTroops: 10000,
    troopCapacity: 10000,
    troopGain: 0,
  });
});

test("organic transport and landing handoff count passengers once", async () => {
  const info = new PlayerInfo("sailor", PlayerType.Human, null, "sailor");
  const game = await setup(
    "ocean_and_land",
    {},
    [info],
    undefined,
    StaticCityTestConfig as unknown as typeof TestConfig,
  );
  const player = game.player(info.id);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 8; x++) {
      const tile = game.ref(x, y);
      if (game.isLand(tile)) player.conquer(tile);
    }
  const centre = game.ref(7, 8);
  player.setSpawnTile(centre);
  foundCityDevelopment(game, player, centre);
  player.buildUnit(UnitType.Settlement, centre, {});
  player.setTroops(10000);
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(4_000n);
  paintedState(player).lastRefillTick = game.ticks();
  game.addExecution(new TransportShipExecution(player, game.ref(15, 8), 20));

  const actions = [...game.executeNextTick()[GameUpdateType.PaintedAction]];
  expect(player.foodMilli()).toBe(0n);
  expect(paintedResources(game, player).totalTroops).toBe(10000);
  for (let i = 0; i < 40; i++) {
    actions.push(...game.executeNextTick()[GameUpdateType.PaintedAction]);
    expect(paintedResources(game, player).totalTroops).toBe(10000);
  }
  expect(player.units(UnitType.TransportShip)).toHaveLength(0);
  expect(actions).toEqual([
    expect.objectContaining({
      kind: "transport",
      outcome: "committed",
      spentMilli: 4_000n,
      troops: 20,
    }),
  ]);
});

test("opt-in config preserves core development defaults", () => {
  const config = new CityTestConfig({} as never, null, false);
  expect(config.cityDevelopment()).toBe(DEFAULT_CONFIG);
  expect(config.paintedEconomy()?.startingTroops).toBe(8000);
});
