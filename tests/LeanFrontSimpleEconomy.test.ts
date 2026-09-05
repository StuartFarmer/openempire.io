import { afterEach, describe, expect, test, vi } from "vitest";
import {
  apportion,
  growSimplePlot,
  type SimplePlotEconomyConfig,
  type SimplePlotInput,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import {
  setUrbanTickProvider,
  urbanTick,
} from "../src/core/execution/utils/UrbanGrowth";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

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

const farm = (overrides: Partial<SimplePlotInput> = {}): SimplePlotInput => ({
  unitId: 1,
  tile: 8,
  owner: 2,
  kind: "farm",
  level: 1,
  stock: 2_000,
  ...overrides,
});

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");

async function game(): Promise<[Game, Player]> {
  const g = await setup("plains", {}, [info]);
  return [g, g.player(info.id)];
}

describe("LeanFront Simple economy", () => {
  afterEach(() => setUrbanTickProvider(null));

  test("grows a seeded level-one farm in whole units", () => {
    expect(growSimplePlot(farm(), config)).toMatchObject({
      capacity: 20_000,
      growth: 276,
      nextStock: 2_276,
    });
  });

  test("uses one final unit near capacity", () => {
    expect(growSimplePlot(farm({ stock: 19_999 }), config).nextStock).toBe(
      20_000,
    );
  });

  test("assigns proportional remainder by ascending unit id", () => {
    expect([
      ...apportion(5, [
        { unitId: 9, weight: 1 },
        { unitId: 3, weight: 1 },
      ]),
    ]).toEqual([
      [3, 3],
      [9, 2],
    ]);
  });

  test("disposing simple economy restores the default urban tick", async () => {
    const [g, p] = await game();
    const provider = vi.fn(() => true);
    setUrbanTickProvider(provider);
    urbanTick(g, p);
    expect(provider).toHaveBeenCalledOnce();
    setUrbanTickProvider(null);
    provider.mockClear();
    urbanTick(g, p);
    expect(provider).not.toHaveBeenCalled();
  });
});
