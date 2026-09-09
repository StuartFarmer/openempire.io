import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { paintedMapLoader } from "../scripts/painted-map-loader";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { cityDevelopmentState } from "../src/core/development/CityDevelopmentExecution";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PaintTilesExecution } from "../src/core/execution/PaintTilesExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { paintedAIState } from "../src/core/execution/utils/PaintedAI";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameImpl } from "../src/core/game/GameImpl";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { SimpleFrontCityConfig } from "../src/core/game/Rulesets";
import * as balance from "./perf/balance/PaintedBalance";
import { aiFixture } from "./util/PaintedAISetup";
import { setup } from "./util/Setup";
import type { TestConfig } from "./util/TestConfig";

class Config extends SimpleFrontCityConfig {
  setInertFood(): void {}
}
async function fixture() {
  const info = new PlayerInfo("city", PlayerType.Human, null, "city");
  const game = await setup(
    "plains",
    {},
    [info],
    undefined,
    Config as unknown as typeof TestConfig,
    false,
  );
  game.addExecution(new SpawnExecution("balance-city", info, game.ref(50, 50)));
  game.executeNextTick();
  game.executeNextTick();
  return { game, player: game.player(info.id) };
}

test("cadence retains each paid farm purchase and unaffordable attempt with its actor and cost", async () => {
  const { game, player } = await fixture();
  const observer = new balance.BalanceDevelopmentObserver();
  observer.read(game, {});
  player.addFoodMilli(10_000_000n);
  const tiles = [game.ref(49, 50), game.ref(48, 50)];
  for (const tile of tiles) {
    game.addExecution(new PaintTilesExecution(player, "farm", [tile]));
    observer.read(game, game.executeNextTick());
    observer.read(game, game.executeNextTick());
    observer.read(game, {});
  }
  expect(
    observer.events.filter((e) => e.event === "farm-purchase"),
  ).toMatchObject(
    tiles.map((tile) => ({
      player: player.id(),
      data: {
        tile,
        kind: "farm",
        outcome: "committed",
        spentMilli: 1_500_000n,
      },
    })),
  );
  expect(tiles.map((tile) => game.plotAt(tile)?.type())).toEqual([
    UnitType.Farmland,
    UnitType.Farmland,
  ]);
  const blockedTile = game.ref(53, 50);
  for (let attempt = 0; attempt < 2; attempt++) {
    player.removeFoodMilli(player.foodMilli());
    game.addExecution(new PaintTilesExecution(player, "farm", [blockedTile]));
    observer.read(game, game.executeNextTick());
    observer.read(game, game.executeNextTick());
    observer.read(game, {});
  }
  const blocked = observer.events.filter(
    (e) => e.event === "food-blocked-action",
  );
  expect(blocked).toHaveLength(2);
  for (const event of blocked)
    expect(event).toMatchObject({
      player: player.id(),
      data: {
        tile: blockedTile,
        kind: "farm",
        reason: "unaffordable",
        outcome: "rejected",
        spentMilli: 0n,
      },
    });
  expect(game.plotAt(blockedTile)).toBeUndefined();
  expect(
    observer.events.filter((e) => e.event === "farm-purchase"),
  ).toHaveLength(2);
  expect(blocked[1].gameTick).toBeGreaterThan(blocked[0].gameTick);
});

test("cadence records only the first paid attack for each player", async () => {
  const { game, player } = await fixture();
  const other = game.addPlayer(
    new PlayerInfo("other", PlayerType.Human, null, "other"),
  );
  other.conquer(game.ref(80, 80));
  other.setSpawnTile(game.ref(80, 80));
  const observer = new balance.BalanceDevelopmentObserver();
  for (const attacker of [player, player, other]) {
    attacker.setTroops(200);
    attacker.addFoodMilli(1_000_000n);
    game.addExecution(
      new AttackExecution(20, attacker, game.terraNullius().id()),
    );
    const updates = game.executeNextTick();
    expect(updates[GameUpdateType.PaintedAction]).toMatchObject([
      { player: attacker.id(), kind: "land", outcome: "committed", troops: 20 },
    ]);
    observer.read(game, updates);
    observer.read(game, {});
  }
  expect(
    observer.events.filter((e) => e.event === "first-attack"),
  ).toMatchObject([
    {
      player: player.id(),
      data: {
        kind: "land",
        outcome: "committed",
        troops: 20,
        spentMilli: 4_000n,
      },
    },
    {
      player: other.id(),
      data: {
        kind: "land",
        outcome: "committed",
        troops: 20,
        spentMilli: 4_000n,
      },
    },
  ]);
});

test("cadence emits food-blocked decisions only when the real AI counter advances", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  player.units(UnitType.Farmland)[0].delete(false);
  player.removeFoodMilli(player.foodMilli());
  const observer = new balance.BalanceDevelopmentObserver();
  const cadence = game.config().paintedAI()!.decisionTicks;
  observer.read(game, {});
  for (let i = 0; i < 2 * cadence; i++) {
    observer.read(game, game.executeNextTick());
    observer.read(game, {});
  }
  expect(paintedAIState(player)!.foodBlockedTicks).toBe(2 * cadence);
  expect(
    observer.events.filter((e) => e.event === "food-blocked-decision"),
  ).toMatchObject([
    { player: player.id(), data: { count: cadence } },
    { player: player.id(), data: { count: 2 * cadence } },
  ]);
  expect(observer.events.some((e) => e.event === "food-blocked-action")).toBe(
    false,
  );
});

test("cadence attributes capture and recapture without recounting historical seeds", async () => {
  const { game, player } = await fixture();
  const other = game.addPlayer(
    new PlayerInfo("other", PlayerType.Human, null, "other"),
  );
  other.conquer(game.ref(80, 80));
  other.setSpawnTile(game.ref(80, 80));
  const centre = player.units(UnitType.Settlement)[0];
  const observer = new balance.BalanceDevelopmentObserver();
  observer.read(game, {});
  other.conquer(centre.tile());
  observer.read(game, {});
  observer.read(game, {});
  player.conquer(centre.tile());
  observer.read(game, {});
  observer.read(game, {});
  expect(
    observer.events.filter((e) => e.event === "centre-capture"),
  ).toMatchObject([
    {
      player: other.id(),
      data: { tile: centre.tile(), unit: centre.id(), from: player.smallID() },
    },
    {
      player: player.id(),
      data: { tile: centre.tile(), unit: centre.id(), from: other.smallID() },
    },
  ]);
  expect(observer.summary(game).historicalCentreSeeds).toBe(1);
  expect(observer.summary(game, player.id()).historicalCentreSeeds).toBe(1);
  expect(observer.summary(game, other.id()).historicalCentreSeeds).toBe(0);
});

test("cadence records housing stalls on entry and re-entry, not every observation", async () => {
  const { game, player } = await fixture();
  const observer = new balance.BalanceDevelopmentObserver();
  player.setTroops(9900);
  observer.read(game, {});
  expect(observer.events.filter((e) => e.event === "housing-stall")).toEqual(
    [],
  );
  for (let episode = 0; episode < 2; episode++) {
    player.setTroops(10000);
    observer.read(game, {});
    observer.read(game, {});
    player.setTroops(9900);
    observer.read(game, {});
  }
  expect(
    observer.events.filter((e) => e.event === "housing-stall"),
  ).toMatchObject([
    { player: player.id(), data: { population: 10000, housing: 10000 } },
    { player: player.id(), data: { population: 10000, housing: 10000 } },
  ]);
});

test("organic runner retains the authoritative winner and elapsed time and stops at completion", async () => {
  const execute = GameImpl.prototype.executeNextTick;
  let winnerID = "";
  let victorySeconds = -1;
  // Use the existing setWinner fixture pattern, retaining the real runner,
  // tick execution and game state throughout the benchmark.
  const tick = vi
    .spyOn(GameImpl.prototype, "executeNextTick")
    .mockImplementation(function (this: GameImpl) {
      const updates = execute.call(this);
      if (this.ticks() === 400) {
        const winner = this.playerByClientID("painted-balance-human")!;
        this.setWinner(winner, this.stats().stats());
        winnerID = winner.id();
        victorySeconds = this.elapsedGameSeconds();
      }
      return updates;
    });
  try {
    const result = await balance.runPaintedBalance(
      {
        seed: "simplefront-pace-01",
        maxTicks: 500,
        sampleEvery: 100,
        policyRotation: 0,
        comparePolicies: false,
        cityDevelopment: { ...DEFAULT_CONFIG },
      },
      paintedMapLoader(path.join(__dirname, "../resources/maps")),
    );
    expect(result.completed).toBe(true);
    expect(victorySeconds).toBeGreaterThan(0);
    expect(result.victorySeconds).toBe(victorySeconds);
    expect(result.elapsedSimulationSeconds).toBe(victorySeconds);
    expect(result.events.filter((e) => e.event === "winner")).toEqual([
      {
        tick: 400 - Number(result.config.spawnTicks),
        event: "winner",
        player: winnerID,
        data: {},
      },
    ]);
    expect(result.samples[result.samples.length - 1].gameTick).toBe(400);
    expect(result.performance.tickMs.count).toBe(400);
  } finally {
    tick.mockRestore();
  }
}, 30000);

test("benchmark rejects paid founding while observing organic expansion, upgrades and neutral physical work", async () => {
  expect(balance).toHaveProperty("BalanceDevelopmentObserver");
  const { game, player } = await fixture();
  const observer = new (balance as any).BalanceDevelopmentObserver();
  const model = cityDevelopmentState(player)!.model;
  observer.read(game, game.executeNextTick());
  const tile = game.ref(51, 50);
  player.addFoodMilli(100000000n);
  game.addExecution(new PaintTilesExecution(player, "city", [tile]));
  observer.read(game, game.executeNextTick());
  observer.read(game, game.executeNextTick());
  expect(
    observer.events.some(
      (e: any) => e.event === "centre-purchase" && e.data.tile === tile,
    ),
  ).toBe(false);
  expect(model.level(tile)).toBe(0);
  expect(
    observer.events.some(
      (e: any) => e.event === "first-organic-expansion" && e.data.tile === tile,
    ),
  ).toBe(false);
  const expanded = game.ref(49, 50);
  model.found(expanded);
  const read = observer.read(game, game.executeNextTick());
  expect(read.payloadBytes).toBeGreaterThan(0);
  expect(
    observer.events.some(
      (e: any) =>
        e.event === "first-organic-expansion" && e.data.tile === expanded,
    ),
  ).toBe(true);
  const snapshot = model.deterministicState();
  snapshot.tiles.find(([t]) => t === expanded)![1] = 2;
  model.restore(snapshot);
  observer.read(game, game.executeNextTick());
  expect(
    observer.events.some(
      (e: any) => e.event === "first-upgrade" && e.data.tile === expanded,
    ),
  ).toBe(true);
  player.relinquish(expanded);
  const before = (balance as any).paintedBalanceHash(game);
  const neutral = model.deterministicState();
  neutral.tiles.find(([t]) => t === expanded)![2] += 0.25;
  model.restore(neutral);
  expect((balance as any).paintedBalanceHash(game)).not.toBe(before);
  expect(observer.summary(game)).toMatchObject({
    historicalCentreSeeds: 1,
    developedArea: 2,
    summedLevels: 3,
  });
  const physical = model.deterministicState();
  observer.read(game, {});
  expect(model.deterministicState()).toEqual(physical);
  // Swap equal numbers of undeveloped tiles: player counts alone cannot detect
  // that the organic frontier changed owners.
  const frontier = game.ref(48, 50);
  const distant = game.ref(45, 45);
  player.conquer(distant);
  player.relinquish(frontier);
  const frontierHash = (balance as any).paintedBalanceHash(game);
  player.conquer(frontier);
  player.relinquish(distant);
  expect((balance as any).paintedBalanceHash(game)).not.toBe(frontierHash);
});

test("organic benchmark validates and retains full config and deterministic real-game traces with measured overhead", async () => {
  const options = {
    seed: "simplefront-pace-01",
    maxTicks: 5,
    sampleEvery: 5,
    policyRotation: 1 as const,
    comparePolicies: true,
    cityDevelopment: { ...DEFAULT_CONFIG, populationRate: 0.3 },
  };
  const run = (config = options.cityDevelopment) =>
    balance.runPaintedBalance(
      { ...options, cityDevelopment: config },
      paintedMapLoader(path.join(__dirname, "../resources/maps")),
    );
  const a = await run();
  expect(a.config.cityDevelopment).toEqual(options.cityDevelopment);
  const b = await run();
  expect(a.finalHash).toBe(b.finalHash);
  expect(a.samples).toEqual(b.samples);
  expect((a as any).cadenceEvents).toEqual((b as any).cadenceEvents);
  expect((a as any).performance.tickMs.count).toBeGreaterThanOrEqual(105);
  expect((a as any).performance.developmentPayloadBytes.total).toBeGreaterThan(
    0,
  );
  expect((a as any).performance.memorySamples[0].rss).toBeGreaterThan(0);
  expect(a.completed).toBe(false);
  expect(a.victorySeconds).toBeNull();
  await expect(run({ ...DEFAULT_CONFIG, rate: NaN })).rejects.toThrow();
}, 30000);

test("organic CLI retains separate provenance and refuses to overwrite existing results", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "simplefront-balance-test-"),
  );
  const file = path.join(directory, "organic-probe.json");
  const args = [
    "--import",
    "tsx",
    "scripts/painted-balance.ts",
    "--organic",
    "--seed",
    "simplefront-pace-01",
    "--ticks",
    "1",
    "--out",
    file,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved[0].config.cityDevelopment).toEqual(DEFAULT_CONFIG);
  expect(saved[0].completed).toBe(false);
  await writeFile(file, "keep-existing-result");
  const collision = spawnSync(process.execPath, args, {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  expect(collision.status).not.toBe(0);
  expect(await readFile(file, "utf8")).toBe("keep-existing-result");
}, 30000);

test("shared real-game construction and account remainders survive different observation frame batches", async () => {
  const run = async (batch: number, observe: boolean) => {
    const { game, player } = await fixture();
    const observer = new balance.BalanceDevelopmentObserver();
    for (let elapsed = 0; elapsed < 253; elapsed += batch) {
      for (let step = 0; step < Math.min(batch, 253 - elapsed); step++)
        game.executeNextTick();
      if (observe) observer.read(game, {});
    }
    const model = cityDevelopmentState(player)!.model;
    return {
      hash: balance.paintedBalanceHash(game),
      state: model.deterministicState(),
    };
  };
  const singleFrames = await run(1, true);
  expect(await run(7, true)).toEqual(singleFrames);
  expect(await run(253, false)).toEqual(singleFrames);
  expect(singleFrames.state.tiles.length).toBeGreaterThan(1);
  expect(singleFrames.state.accounts[0][2]).toBeGreaterThan(0);
});
