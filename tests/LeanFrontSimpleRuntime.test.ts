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

function beginAttack(game: Game, player: Player) {
  const execution = new AttackExecution(
    1_000,
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
});
