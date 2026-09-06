import { describe, expect, test } from "vitest";
import {
  SimpleEconomy,
  type SimpleGrowthBatch,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import type { SimplePlotEconomyConfig } from "../src/core/configuration/Config";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitInfo,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

const info = new PlayerInfo("attacker", PlayerType.Human, null, "attacker");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival");

const config: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};

class SimpleTestConfig extends TestConfig {
  override simplePlotEconomy(): SimplePlotEconomyConfig {
    return config;
  }

  override unitInfo(type: UnitType): UnitInfo {
    if (type === UnitType.Settlement || type === UnitType.Farmland) {
      return {
        cost: () =>
          type === UnitType.Settlement
            ? config.cityLevelCost
            : config.farmLevelCost,
        costResource: "food",
        constructionDuration: 0,
        upgradable: true,
      };
    }
    return super.unitInfo(type);
  }
}

const noGrowth: SimpleGrowthBatch = async (records) =>
  records.map((record) => ({
    ...record,
    capacity: config.capacityPerLevel * record.level,
    growth: 0,
    nextStock: record.stock,
  }));

async function fixture(): Promise<{
  game: Game;
  player: Player;
  economy: SimpleEconomy;
}> {
  const game = await setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    SimpleTestConfig,
  );
  const player = game.player(info.id);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) player.conquer(game.ref(x, y));
  }
  player.buildUnit(UnitType.Settlement, game.ref(1, 1), {});
  player.buildUnit(UnitType.Farmland, game.ref(2, 2), {});
  const economy = new SimpleEconomy();
  await economy.prepare(game, noGrowth);
  economy.applyPlayer(game, player);
  return { game, player, economy };
}

function beginAttack(game: Game, player: Player, troops = 1_000) {
  const execution = new AttackExecution(
    troops,
    player,
    game.terraNullius().id(),
  );
  execution.init(game, game.ticks());
  return player.outgoingAttacks()[0]!;
}

describe("LeanFront Simple attack energy", () => {
  test("caps a newly seen real attack before its first combat tick", async () => {
    const { game, player, economy } = await fixture();
    player.removeFood(1_990n); // 10 food funds floor(10 * 1000 / 40) = 250 people.
    const attack = beginAttack(game, player);

    await economy.prepare(game, noGrowth);

    expect(attack.troops()).toBe(250);
    expect(player.troops()).toBe(1_750);
    expect(player.food()).toBe(0n);
  });

  test("energy exhaustion returns real attack survivors without retreat malus", async () => {
    const { game, player, economy } = await fixture();
    player.removeFood(1_990n);
    const attack = beginAttack(game, player);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const survivors = attack.troops();

    await economy.prepare(game, noGrowth);

    expect(player.outgoingAttacks()).toEqual([]);
    expect(player.troops()).toBe(1_750 + survivors);
  });

  test("charges a new attack only from surviving farms after a capture", async () => {
    const { game, player, economy } = await fixture();
    player.addFood(3_000n);
    const capturedFarm = player.buildUnit(
      UnitType.Farmland,
      game.ref(3, 3),
      {},
    );
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    player.setTroops(100_000);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const attack = beginAttack(game, player, 100_000);
    const rival = game.addPlayer(rivalInfo);
    rival.conquer(capturedFarm.tile());
    rival.captureUnit(capturedFarm);

    await expect(economy.prepare(game, noGrowth)).resolves.toBeUndefined();

    expect(attack.troops()).toBe(50_000);
    expect(player.food()).toBe(0n);
  });

  test("caps a post-capture attack to the surviving city people", async () => {
    const { game, player, economy } = await fixture();
    const secondCity = player.buildUnit(UnitType.Settlement, game.ref(3, 3), {});
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const rival = game.addPlayer(rivalInfo);
    rival.conquer(secondCity.tile());
    rival.captureUnit(secondCity);
    player.addFood(2_000n);
    const attack = beginAttack(game, player, 2_500);

    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);

    expect(attack.troops()).toBe(2_000);
    expect(player.troops()).toBe(0);
    expect(player.troops() + attack.troops()).toBe(2_000);
  });

  test("shares surviving city people across concurrent new attacks", async () => {
    const { game, player, economy } = await fixture();
    player.addFood(2_000n);
    const source = game.ref(0, 0);
    const first = new AttackExecution(
      1_500,
      player,
      game.terraNullius().id(),
      null,
      true,
      [source],
    );
    const second = new AttackExecution(
      1_500,
      player,
      game.terraNullius().id(),
      null,
      true,
      [source],
    );
    first.init(game, game.ticks());
    second.init(game, game.ticks());

    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);

    expect(player.outgoingAttacks().map((attack) => attack.troops())).toEqual([
      1_500,
      500,
    ]);
    expect(player.troops()).toBe(0);
  });

  test("charges a captured-farm build across surviving and new farms", async () => {
    const { game, player, economy } = await fixture();
    player.addFood(3_000n);
    const capturedFarm = player.buildUnit(
      UnitType.Farmland,
      game.ref(3, 3),
      {},
    );
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const rival = game.addPlayer(rivalInfo);
    rival.conquer(capturedFarm.tile());
    rival.captureUnit(capturedFarm);
    player.buildUnit(UnitType.Farmland, game.ref(4, 4), {});

    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    economy.applyPlayer(game, rival);

    expect(player.food()).toBe(1_000n);
    expect(rival.food()).toBe(2_000n);
    expect(player.food() + rival.food()).toBe(3_000n);
  });

  test("leaves a new farm seed untouched when prior farms cover a build", async () => {
    const { game, player, economy } = await fixture();
    player.addFood(3_000n);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);

    player.buildUnit(UnitType.Farmland, game.ref(3, 3), {});
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);

    expect(player.food()).toBe(4_000n);
    expect([...economy.plotFrame()]).toEqual([
      game.ref(1, 1),
      1,
      1,
      2_000,
      20_000,
      0,
      game.ref(2, 2),
      2,
      1,
      2_000,
      20_000,
      0,
      game.ref(3, 3),
      2,
      1,
      2_000,
      20_000,
      0,
    ]);
  });

  test("uses future farm growth to repay an uncovered captured-farm build", async () => {
    const { game, player, economy } = await fixture();
    player.addFood(3_000n);
    const capturedFarm = player.buildUnit(
      UnitType.Farmland,
      game.ref(3, 3),
      {},
    );
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const rival = game.addPlayer(rivalInfo);
    rival.conquer(capturedFarm.tile());
    rival.captureUnit(capturedFarm);
    player.buildUnit(UnitType.Settlement, game.ref(4, 4), {});

    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    economy.applyPlayer(game, rival);

    const ownedFarmStock = () => {
      const frame = economy.plotFrame();
      for (let i = 0; i < frame.length; i += 6) {
        if (frame[i] === game.ref(2, 2)) return frame[i + 3];
      }
      throw new Error("owned farm missing from frame");
    };
    expect(player.food()).toBe(0n);
    expect(rival.food()).toBe(2_000n);
    expect(ownedFarmStock()).toBe(0);

    const growFarm: SimpleGrowthBatch = async (records) =>
      records.map((record) => ({
        ...record,
        capacity: 20_000,
        growth: record.kind === "farm" ? 1_000 : 0,
        nextStock: record.stock + (record.kind === "farm" ? 1_000 : 0),
      }));
    await economy.prepare(game, growFarm);
    economy.applyPlayer(game, player);
    expect(player.food()).toBe(0n);
    expect(ownedFarmStock()).toBe(0);

    await economy.prepare(game, growFarm);
    economy.applyPlayer(game, player);
    expect(player.food()).toBe(0n);
    expect(ownedFarmStock()).toBe(0);

    await economy.prepare(game, growFarm);
    economy.applyPlayer(game, player);
    expect(player.food()).toBe(1_000n);
    expect(ownedFarmStock()).toBe(1_000);
  });

  test("treats colliding attack ids from different players as new attacks", async () => {
    const firstInfo = new PlayerInfo("first", PlayerType.Human, null, "Aa");
    const secondInfo = new PlayerInfo("second", PlayerType.Human, null, "BB");
    const game = await setup(
      "plains",
      { instantBuild: true },
      [firstInfo, secondInfo],
      undefined,
      SimpleTestConfig,
    );
    const first = game.player(firstInfo.id);
    const second = game.player(secondInfo.id);
    for (const [player, x] of [
      [first, 0],
      [second, 10],
    ] as const) {
      for (let y = 0; y < 5; y++) {
        for (let dx = 0; dx < 5; dx++) player.conquer(game.ref(x + dx, y));
      }
      player.buildUnit(UnitType.Settlement, game.ref(x + 1, 1), {});
      player.buildUnit(UnitType.Farmland, game.ref(x + 2, 2), {});
    }
    const economy = new SimpleEconomy();
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, first);
    economy.applyPlayer(game, second);
    const firstAttack = beginAttack(game, first);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, first);
    second.removeFood(1_990n);
    const secondAttack = beginAttack(game, second);
    expect(secondAttack.id()).toBe(firstAttack.id());

    await economy.prepare(game, noGrowth);

    expect(secondAttack.troops()).toBe(250);
    expect(second.food()).toBe(0n);
  });

  test("stops a dead player's unfunded active attack before combat", async () => {
    const { game, player, economy } = await fixture();
    const attack = beginAttack(game, player);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    for (const unit of player.units()) unit.delete(false);
    for (const tile of [...player.tiles()]) player.relinquish(tile);
    player.removeFood(player.food());

    await economy.prepare(game, noGrowth);

    expect(attack.isActive()).toBe(false);
    expect(player.outgoingAttacks()).toEqual([]);
  });

  test("publishes a dead attacker's returned survivors only once", async () => {
    const { game, player, economy } = await fixture();
    player.setTroops(1_000);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    const attack = beginAttack(game, player);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);
    for (const unit of player.units()) unit.delete(false);
    for (const tile of [...player.tiles()]) player.relinquish(tile);
    player.removeFood(player.food());

    await economy.prepare(game, noGrowth);
    expect(attack.isActive()).toBe(false);
    expect(player.troops()).toBe(1_000);
    await economy.prepare(game, noGrowth);
    economy.applyPlayer(game, player);

    expect(player.troops()).toBe(1_000);
  });

  test("publishes a dead player's ordinary lifecycle balance during prepare", async () => {
    const { game, player, economy } = await fixture();
    for (const unit of player.units()) unit.delete(false);
    for (const tile of [...player.tiles()]) player.relinquish(tile);

    await economy.prepare(game, noGrowth);

    expect(player.isAlive()).toBe(false);
    expect([player.troops(), player.food()]).toEqual([0, 0n]);
    await economy.prepare(game, noGrowth);

    expect([player.troops(), player.food()]).toEqual([0, 0n]);
  });
});

test("resolves city, farm, and raze plot actions through core intents", async () => {
  const { game, player, economy } = await fixture();
  const city = player.units(UnitType.Settlement)[0]!;
  const farm = player.units(UnitType.Farmland)[0]!;
  const empty = game.ref(3, 3);
  player.addFood(2_000n);

  expect(economy.resolvePlotAction(game, player, "city", city.tile())).toEqual({
    ok: true,
    intent: {
      type: "upgrade_structure",
      unit: UnitType.Settlement,
      unitId: city.id(),
    },
  });
  expect(economy.resolvePlotAction(game, player, "city", farm.tile())).toEqual({
    ok: false,
    message: "Raze the existing plot first",
  });
  expect(economy.resolvePlotAction(game, player, "farm", empty)).toEqual({
    ok: true,
    intent: { type: "build_unit", unit: UnitType.Farmland, tile: empty },
  });
  expect(economy.resolvePlotAction(game, player, "raze", city.tile())).toEqual({
    ok: true,
    intent: { type: "delete_unit", unitId: city.id() },
  });
  city.markForDeletion();
  expect(economy.resolvePlotAction(game, player, "raze", city.tile())).toEqual({
    ok: false,
    message: "Plot is already being razed",
  });
});
