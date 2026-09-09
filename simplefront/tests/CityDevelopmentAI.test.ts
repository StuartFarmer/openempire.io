import { expect, test } from "vitest";
import {
  cityDevelopmentEligibility,
  cityDevelopmentState,
  foundCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import {
  decidePaintedAI,
  paintedAIState,
} from "../src/core/execution/utils/PaintedAI";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";
import {
  PlayerInfo,
  PlayerType,
  UnitType,
  type Game,
} from "../src/core/game/Game";
import { GameMapImpl } from "../src/core/game/GameMap";
import {
  GameUpdateType,
  type PaintedActionUpdate,
} from "../src/core/game/GameUpdates";
import { expectedLayersByteLength } from "../src/core/game/MapLayers";
import { aiFixture } from "./util/PaintedAISetup";

function execute(game: Game, ticks: number) {
  const actions: (PaintedActionUpdate & { tick: number })[] = [];
  for (let i = 0; i < ticks; i++) {
    const tick = game.ticks();
    actions.push(
      ...game
        .executeNextTick()
        [GameUpdateType.PaintedAction].map((a) => ({ ...a, tick })),
    );
  }
  return actions;
}

function trace(actions: (PaintedActionUpdate & { tick: number })[]) {
  return actions
    .map((a) => `${a.tick}:${a.kind}:${a.troops}:${a.spentMilli}`)
    .join(", ");
}

test.each([
  "balanced",
  "farm-first",
  "expansion-first",
  "military-first",
] as const)(
  "%s protects a needed farm purchase instead of spending its savings on troops",
  async (policy) => {
    const { game, player } = await aiFixture({ organic: true });
    const state = paintedAIState(player)!;
    state.policy = policy;
    player.setTroops(200000);
    player.removeFoodMilli(player.foodMilli());
    player.addFoodMilli(1_499_000n);
    expect(decidePaintedAI(game, player, state)).toEqual({
      kind: "wait",
      reason: "food",
    });
    player.addFoodMilli(1000n);
    expect(decidePaintedAI(game, player, state)).toMatchObject({
      kind: "paint",
      plot: "farm",
    });
  },
);

test("food planning funds incoming recruits before the current army empties the treasury", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const model = cityDevelopmentState(player)!.model;
  player.addFoodMilli(10_000_000n);
  const farmSite = [...player.tiles()].find((tile) => !game.plotAt(tile))!;
  player.buildUnit(UnitType.Farmland, farmSite, {});
  for (const tile of [...player.tiles()]
    .filter((tile) => !game.plotAt(tile))
    .slice(0, 19))
    model.found(tile);
  player.setTroops(20000);
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(3_000_000n);
  expect(paintedResources(game, player)).toMatchObject({
    farms: 2,
    troopCapacity: 200000,
  });
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toMatchObject({
    kind: "paint",
    plot: "farm",
  });
});

test("without a farm site, AI saves a useful expedition without demanding impossible food", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const model = cityDevelopmentState(player)!.model;
  for (const tile of player.tiles())
    if (!game.plotAt(tile) && !model.level(tile)) model.found(tile);
  player.setTroops(200000);
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(200n);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toEqual({
    kind: "wait",
    reason: "food",
  });
  player.addFoodMilli(499800n);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toMatchObject({
    kind: "attack",
    troops: 2500,
  });
});

test("expedition slots leave a required farm's entire purchase price untouched", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const state = paintedAIState(player)!;
  state.phase = -1;
  while (game.ticks() < 40) game.executeNextTick();
  player.setTroops(200000);
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(2_000_000n);
  const action = decidePaintedAI(game, player, state);
  expect(action).toMatchObject({ kind: "attack", troops: 2500 });
  if (action.kind === "attack")
    expect(player.foodMilli() - BigInt(action.troops) * 200n).toBe(1_500_000n);
});

test("organic opening invests in a paid off-ring farm and expands without seed spam", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const centre = player.units(UnitType.Settlement)[0].tile();
  expect(player.troops()).toBe(8000);
  const owned = player.numTilesOwned();
  const actions = execute(game, 600);
  console.info(
    "organic opening actions [tick:kind:troops:milli-food]",
    trace(actions.slice(0, 12)),
  );
  expect(actions.filter((a) => a.kind === "city")).toHaveLength(0);
  expect(player.units(UnitType.Settlement)).toHaveLength(1);
  expect(paintedResources(game, player).troopCapacity).toBeGreaterThan(10000);
  const farm = actions.find(
    (a) => a.kind === "farm" && a.outcome === "committed",
  );
  expect(farm).toMatchObject({ spentMilli: 1_500_000n });
  expect(game.manhattanDist(farm!.tile!, centre)).toBeGreaterThanOrEqual(2);
  const army = actions.find(
    (a) => a.kind === "land" && a.outcome === "committed",
  );
  expect(army).toBeDefined();
  expect(army!.spentMilli).toBe(BigInt(army!.troops) * 200n);
  expect(player.numTilesOwned()).toBeGreaterThan(owned);
  expect(player.troops()).toBeGreaterThan(0);
  // Larger armies can advance a selected border before the queued order runs.
  // Invalid stale orders must be free; paid actions must remain affordable.
  for (const action of actions.filter((a) => a.outcome !== "committed"))
    expect(action).toMatchObject({
      kind: "land",
      reason: "invalid",
      spentMilli: 0n,
      troops: 0,
    });
});

test("farm recovery skips physical housing even when its seed unit is absent", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  player.units(UnitType.Farmland)[0].delete(false);
  const plain = [...player.tiles()]
    .filter((t) => !game.plotAt(t))
    .sort((a, b) => a - b);
  const urban = plain.find((t) =>
    game.neighbors(t).every((n) => game.owner(n) === player),
  )!;
  foundCityDevelopment(game, player, urban);
  const decision = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(decision.kind).toBe("paint");
  if (decision.kind === "paint")
    expect(cityDevelopmentState(player)!.model.level(decision.tile)).toBe(0);
  const actions = execute(game, 25);
  expect(actions.find((a) => a.kind === "farm")).toMatchObject({
    outcome: "committed",
    spentMilli: 1_500_000n,
  });
});

test("captured seed with surviving housing does not force a replacement", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const centre = player.units(UnitType.Settlement)[0].tile();
  const urban = game.neighbors(centre)[0];
  foundCityDevelopment(game, player, urban);
  const enemy = game.addPlayer(
    new PlayerInfo("captor", PlayerType.Human, null, "captor"),
  );
  enemy.conquer(centre);
  player.units(UnitType.Settlement).forEach((u) => u.delete(false));
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  expect(
    decidePaintedAI(game, player, paintedAIState(player)!),
  ).not.toMatchObject({ kind: "paint", plot: "city" });
  expect(execute(game, 80).filter((a) => a.kind === "city")).toHaveLength(0);
  expect(cityDevelopmentState(player)!.model.level(centre)).toBe(1);
});

test("blocked growth invests in farms without buying disconnected housing", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const centre = player.units(UnitType.Settlement)[0].tile();
  for (const tile of game.neighbors(centre)) game.addTileDamage(tile, 1000);
  const action = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(action).toMatchObject({ kind: "paint", plot: "farm" });
  if (action.kind === "paint")
    expect(game.manhattanDist(action.tile, centre)).toBeGreaterThan(1);
  const account = cityDevelopmentState(player)!;
  const actions = execute(game, 25);
  expect(actions.filter((a) => a.kind === "city")).toHaveLength(0);
  expect(cityDevelopmentState(player)).toBe(account);
  expect(account.model.deterministicState().accounts).toHaveLength(1);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  // Once the damaged ring recovers, the original neighbourhood grows normally.
  paintedAIState(player)!.phase = -1;
  let completions = 0;
  for (let i = 0; i < 600; i++) {
    const before = new Map(
      [...account.model.developedTiles()].map((tile) => [
        tile,
        account.model.level(tile),
      ]),
    );
    game.executeNextTick();
    const changed = [...account.model.developedTiles()].filter(
      (tile) => account.model.level(tile) > (before.get(tile) ?? 0),
    );
    expect(changed.length).toBeLessThanOrEqual(1);
    completions += changed.length;
  }
  expect(completions).toBeGreaterThan(0);
  expect(account.model.deterministicState().accounts).toHaveLength(1);
});

test("room query exits at the shared candidate boundary", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const model = cityDevelopmentState(player)!.model;
  const eligible = cityDevelopmentEligibility(game, player);
  let calls = 0;
  const first = model.candidates((tile) => {
    calls++;
    return eligible(tile);
  }, 1);
  expect(first).toHaveLength(1);
  expect(calls).toBeLessThan(6);
  expect(model.candidates(eligible).length).toBeGreaterThan(1);
});

test.each(["borders", "farms", "structures"])(
  "blocked %s never trigger a paid centre",
  async (obstacle) => {
    const { game, player } = await aiFixture({
      organic: true,
      inertResources: true,
    });
    const centre = player.units(UnitType.Settlement)[0].tile();
    // Fixture blockers do not change the AI's opening treasury or population.
    const food = player.foodMilli();
    for (const tile of game.neighbors(centre)) {
      if (obstacle === "borders") player.relinquish(tile);
      else {
        player.addFood(100000n);
        player.buildUnit(
          obstacle === "farms" ? UnitType.Farmland : UnitType.DefensePost,
          tile,
          {},
        );
      }
    }
    player.removeFoodMilli(player.foodMilli());
    player.addFoodMilli(food);
    const model = cityDevelopmentState(player)!.model;
    expect(
      model.candidates(cityDevelopmentEligibility(game, player), 1),
    ).toHaveLength(0);
    const actions = execute(game, 25);
    console.info("organic blocked reconstruction", obstacle, trace(actions));
    expect(actions.filter((a) => a.kind === "city")).toHaveLength(0);
    expect(actions.some((a) => a.outcome === "committed")).toBe(true);
    expect(player.units(UnitType.Settlement)).toHaveLength(1);
    expect(model.deterministicState().accounts).toHaveLength(1);
  },
);

test("foreign and neutral same-level supports keep seedless owned housing usable for growth", async () => {
  const { game, player } = await aiFixture({ organic: true });
  const centre = player.units(UnitType.Settlement)[0].tile();
  const enemy = game.addPlayer(
    new PlayerInfo("neighbor", PlayerType.Human, null, "neighbor"),
  );
  const model = cityDevelopmentState(player)!.model;
  for (const [i, tile] of game.neighbors(centre).entries()) {
    foundCityDevelopment(game, player, tile);
    if (i % 2) enemy.conquer(tile);
    else player.relinquish(tile);
  }
  player.units(UnitType.Settlement)[0].delete(false);
  expect(
    model.candidates(cityDevelopmentEligibility(game, player), 1),
  ).toMatchObject([{ tile: centre, kind: "densify" }]);
  expect(
    decidePaintedAI(game, player, paintedAIState(player)!),
  ).not.toMatchObject({ kind: "paint", plot: "city" });
});

test("cramped zero-farm recovery may use the only dry site in the young seed ring", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const centre = player.units(UnitType.Settlement)[0].tile();
  const onlySite = game.neighbors(centre)[0];
  player.units(UnitType.Farmland)[0].delete(false);
  for (const tile of [...player.tiles()])
    if (tile !== centre && tile !== onlySite) player.relinquish(tile);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toEqual({
    kind: "paint",
    plot: "farm",
    tile: onlySite,
  });
  const actions = execute(game, 25);
  expect(actions.find((a) => a.kind === "farm")).toMatchObject({
    outcome: "committed",
    tile: onlySite,
    spentMilli: 1_500_000n,
  });
});

test("lost development retains base housing without paid reconstruction", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const centre = player.units(UnitType.Settlement)[0].tile();
  player.units(UnitType.Settlement)[0].delete(false);
  player.relinquish(centre);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  const actions = execute(game, 25);
  const replacement = actions.find((a) => a.kind === "city");
  console.info("organic housing loss reconstruction", trace(actions));
  expect(replacement).toBeUndefined();
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  expect(cityDevelopmentState(player)!.model.level(centre)).toBe(1);
});

test("AI can use its last disconnected site for a farm because base housing remains", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const centre = player.units(UnitType.Settlement)[0].tile();
  const farm = player.units(UnitType.Farmland)[0].tile();
  const onlySite = game.ref(70, 70);
  player.conquer(onlySite);
  player.units(UnitType.Settlement)[0].delete(false);
  for (const tile of [...player.tiles()])
    if (tile !== farm && tile !== onlySite) player.relinquish(tile);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toEqual({
    kind: "paint",
    plot: "farm",
    tile: onlySite,
  });
  expect(execute(game, 25).find((a) => a.kind === "farm")).toMatchObject({
    tile: onlySite,
    outcome: "committed",
    spentMilli: 1_500_000n,
  });
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
  expect(cityDevelopmentState(player)!.model.level(centre)).toBe(1);
});

test.each([
  ["with its farm retained", true],
  ["with its farm lost", false],
])(
  "base housing recovers population after losing development %s",
  async (_case, retainFarm) => {
    const { game, player } = await aiFixture({ organic: true });
    const centre = player.units(UnitType.Settlement)[0].tile();
    const farm = player.units(UnitType.Farmland)[0].tile();
    const site = game.ref(50, 49);
    expect({ centre, farm, site }).toEqual({
      centre: game.ref(50, 50),
      farm: game.ref(50, 48),
      site: game.ref(50, 49),
    });
    player.units(UnitType.Settlement)[0].delete(false);
    if (!retainFarm) player.units(UnitType.Farmland)[0].delete(false);
    for (const tile of [...player.tiles()])
      if (tile !== site && (tile !== farm || !retainFarm))
        player.relinquish(tile);
    player.setTroops(0);

    expect(player.isAlive()).toBe(true);
    expect(player.foodMilli()).toBe(4_000_000n);
    expect(paintedResources(game, player).troopCapacity).toBe(10000);
    expect(cityDevelopmentState(player)!.model.level(centre)).toBe(1);
    expect(cityDevelopmentState(player)!.model.level(site)).toBe(0);

    const actions = execute(game, 600);
    expect(actions.filter((a) => a.kind === "city")).toHaveLength(0);
    expect(
      actions.some((a) => a.kind === "farm" && a.outcome === "committed"),
    ).toBe(true);
    expect(paintedResources(game, player).troopCapacity).toBeGreaterThanOrEqual(
      10000,
    );
    expect(player.troops()).toBeGreaterThan(0);
  },
);

test.each(["coast", "valley"])(
  "organic %s opening keeps useful growth room and issues real paid actions",
  async (shape) => {
    const terrain = Uint8Array.from({ length: 10000 }, (_, tile) => {
      const x = tile % 100,
        y = Math.floor(tile / 100);
      if (shape === "coast") return x < 50 ? 0 : 128;
      return y === 50 || x >= 56 ? 128 : 159;
    });
    const map = new GameMapImpl(
      100,
      100,
      terrain,
      terrain.filter((v) => (v & 128) !== 0).length,
      new Uint8Array(expectedLayersByteLength(100, 100)),
    );
    const { game, player } = await aiFixture({ organic: true, map });
    const centre = player.units(UnitType.Settlement)[0].tile();
    const actions = execute(game, 600);
    console.info("organic terrain opening", shape, trace(actions.slice(0, 4)));
    expect(
      actions.some((a) => a.kind === "farm" && a.outcome === "committed"),
    ).toBe(true);
    expect(
      actions.some((a) => a.kind === "land" && a.outcome === "committed"),
    ).toBe(true);
    expect(actions.filter((a) => a.kind === "city")).toHaveLength(0);
    for (const action of actions.filter((a) => a.outcome !== "committed"))
      expect(action).toMatchObject({
        kind: "land",
        reason: "invalid",
        spentMilli: 0n,
        troops: 0,
      });
    for (const tile of cityDevelopmentState(player)!.model.developedTiles()) {
      expect(game.isLand(tile)).toBe(true);
      expect(game.isImpassable(tile)).toBe(false);
    }
    expect(cityDevelopmentState(player)!.model.level(centre)).toBe(1);
  },
);
