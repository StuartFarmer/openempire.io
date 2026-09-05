import { afterEach, describe, expect, test, vi } from "vitest";
import {
  apportion,
  growSimplePlot,
  SimpleEconomy,
  type SimpleGrowthBatch,
  type SimplePlotEconomyConfig,
  type SimplePlotInput,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import { DeleteUnitExecution } from "../src/core/execution/DeleteUnitExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  setUrbanTickProvider,
  urbanTick,
} from "../src/core/execution/utils/UrbanGrowth";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LeanFrontSimpleConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";
import { executeTicks } from "./util/utils";

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
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");

class SimpleTestConfig extends TestConfig {
  override simplePlotEconomy(): SimplePlotEconomyConfig {
    return config;
  }
}

class SimpleRulesetTestConfig extends LeanFrontSimpleConfig {
  setInertFood(_: boolean): void {}
}

const noGrowth: SimpleGrowthBatch = async (records) =>
  records.map((record) => ({
    ...record,
    capacity: config.capacityPerLevel * record.level,
    growth: 0,
    nextStock: record.stock,
  }));

async function game(): Promise<[Game, Player]> {
  const g = await setup("plains", {}, [info]);
  return [g, g.player(info.id)];
}

async function simpleGame(
  players: readonly PlayerInfo[] = [info],
): Promise<[Game, Player[]]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [...players],
    undefined,
    SimpleTestConfig,
  );
  return [g, players.map((player) => g.player(player.id))];
}

async function spawnedSimpleGame(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    SimpleRulesetTestConfig as unknown as typeof TestConfig,
  );
  g.addExecution(new SpawnExecution("simple-game", info, g.ref(10, 10)));
  executeTicks(g, 2);
  return [g, g.player(info.id)];
}

function build(
  g: Game,
  player: Player,
  type: UnitType.Settlement | UnitType.Farmland,
  x: number,
  y: number,
) {
  const tile = g.ref(x, y);
  player.conquer(tile);
  return player.buildUnit(type, tile, {});
}

async function publish(
  economy: SimpleEconomy,
  g: Game,
  player: Player,
): Promise<void> {
  await economy.prepare(g, noGrowth);
  expect(economy.applyPlayer(g, player)).toBe(true);
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

  test("spawns a free city and farm kit without rich-state residue", async () => {
    const [, player] = await spawnedSimpleGame();

    expect(player.units(UnitType.Settlement)).toHaveLength(1);
    expect(player.units(UnitType.Farmland)).toHaveLength(1);
    expect(player.troops()).toBe(2_000);
    expect(player.food()).toBe(2_000n);
    expect([...player.densityEntries()]).toEqual([]);
    expect([...player.farmMaturityEntries()]).toEqual([]);
  });

  test("builds and upgrades an exact simple plot for flat food costs", async () => {
    const [g, player] = await spawnedSimpleGame();
    const tile = [...player.tiles()].find((t) => g.plotAt(t) === undefined)!;

    player.addFood(8_000n);
    expect(player.canBuild(UnitType.Settlement, tile)).toBe(tile);
    const plot = player.buildUnit(UnitType.Settlement, tile, {});
    expect(player.food()).toBe(6_000n);
    expect(player.findUnitToUpgrade(UnitType.Settlement, tile)).toBe(plot);
    player.upgradeUnit(plot);

    expect(plot.level()).toBe(2);
    expect(player.troops()).toBe(2_000);
    expect(player.food()).toBe(2_000n);
  });

  test("charges food to raze a simple plot only after validation", async () => {
    const [g, player] = await spawnedSimpleGame();
    const plot = player.units(UnitType.Settlement)[0];
    (g.config().deleteUnitCooldown as () => number) = () => 0;

    new DeleteUnitExecution(player, plot.id()).init(g, 0);
    expect(plot.isMarkedForDeletion()).toBe(true);
    expect(player.food()).toBe(1_000n);
  });

  test("rejects an unfunded simple raze without marking the plot", async () => {
    const [g, player] = await spawnedSimpleGame();
    const plot = player.units(UnitType.Settlement)[0];
    (g.config().deleteUnitCooldown as () => number) = () => 0;
    player.removeFood(1_001n);

    const execution = new DeleteUnitExecution(player, plot.id());
    execution.init(g, 0);

    expect(execution.isActive()).toBe(false);
    expect(plot.isMarkedForDeletion()).toBe(false);
    expect(player.food()).toBe(999n);
  });

  test("does not charge a rejected simple raze", async () => {
    const [g, player] = await spawnedSimpleGame();
    const plot = player.units(UnitType.Settlement)[0];
    vi.spyOn(g, "inSpawnPhase").mockReturnValue(true);

    new DeleteUnitExecution(player, plot.id()).init(g, 0);

    expect(plot.isMarkedForDeletion()).toBe(false);
    expect(player.food()).toBe(2_000n);
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

  test("stages seeds once, publishes exact aggregates, and restores the default tick on dispose", async () => {
    const [g, [p]] = await simpleGame();
    const city = build(g, p, UnitType.Settlement, 4, 4);
    const farmUnit = build(g, p, UnitType.Farmland, 8, 8);
    const economy = new SimpleEconomy();

    p.setTroops(999);
    p.addFood(999n);
    await publish(economy, g, p);

    expect([p.troops(), p.food()]).toEqual([2_000, 2_000n]);
    expect([...economy.plotFrame()]).toEqual([
      city.tile(),
      1,
      1,
      2_000,
      20_000,
      0,
      farmUnit.tile(),
      2,
      1,
      2_000,
      20_000,
      0,
    ]);

    economy.install();
    const apply = vi.spyOn(economy, "applyPlayer");
    urbanTick(g, p);
    expect(apply).toHaveBeenCalledOnce();
    economy.dispose();
    apply.mockClear();
    urbanTick(g, p);
    expect(apply).not.toHaveBeenCalled();
  });

  test("charges a debit only to surviving farms, never a newly seeded farm", async () => {
    const [g, [p]] = await simpleGame();
    build(g, p, UnitType.Farmland, 4, 4);
    const economy = new SimpleEconomy();
    await publish(economy, g, p);

    p.addFood(3_000n);
    await publish(economy, g, p); // existing farm now holds 5,000
    build(g, p, UnitType.Farmland, 8, 8);
    p.removeFood(3_000n);
    await publish(economy, g, p);

    const frame = economy.plotFrame();
    expect([frame[3], frame[9]]).toEqual([2_000, 2_000]);
    expect(p.food()).toBe(4_000n);
  });

  test("apportions returned troops by surviving city capacity", async () => {
    const [g, [p]] = await simpleGame();
    const first = build(g, p, UnitType.Settlement, 4, 4);
    const second = build(g, p, UnitType.Settlement, 8, 8);
    const economy = new SimpleEconomy();
    await publish(economy, g, p);

    second.increaseLevel();
    await publish(economy, g, p);
    p.addTroops(3_000);
    await publish(economy, g, p);

    const frame = economy.plotFrame();
    expect([frame[0], frame[3], frame[6], frame[9]]).toEqual([
      first.tile(),
      3_000,
      second.tile(),
      4_000,
    ]);
  });

  test("apportions dormant returns by acquired city capacity", async () => {
    const [g, [p, rival]] = await simpleGame([info, rivalInfo]);
    p.conquer(g.ref(1, 1));
    const first = build(g, rival, UnitType.Settlement, 4, 4);
    const second = build(g, rival, UnitType.Settlement, 8, 8);
    second.increaseLevel();
    const economy = new SimpleEconomy();

    await publish(economy, g, p);
    p.addTroops(3_000);
    await publish(economy, g, p);
    p.conquer(first.tile());
    p.captureUnit(first);
    p.conquer(second.tile());
    p.captureUnit(second);
    await publish(economy, g, p);

    const frame = economy.plotFrame();
    expect([frame[0], frame[3], frame[6], frame[9]]).toEqual([
      first.tile(),
      1_000,
      second.tile(),
      2_000,
    ]);
  });

  test("debits dormant troops before distributing them to an acquired city", async () => {
    const [g, [p, rival]] = await simpleGame([info, rivalInfo]);
    const economy = new SimpleEconomy();

    p.conquer(g.ref(1, 1));
    const city = build(g, rival, UnitType.Settlement, 4, 4);
    await publish(economy, g, p);
    p.addTroops(1_000);
    await publish(economy, g, p); // no city: 1,000 is dormant
    p.removeTroops(500);
    p.conquer(city.tile());
    p.captureUnit(city);
    await publish(economy, g, p);

    expect(p.troops()).toBe(500);
  });

  test("retains lifecycle losses, preserves upgrades, and has no food reserve without farms", async () => {
    const [g, [p, rival]] = await simpleGame([info, rivalInfo]);
    const city = build(g, p, UnitType.Settlement, 4, 4);
    const farmUnit = build(g, p, UnitType.Farmland, 8, 8);
    const economy = new SimpleEconomy();
    await publish(economy, g, p);

    city.increaseLevel();
    await publish(economy, g, p);
    expect(economy.plotFrame()[4]).toBe(40_000);

    rival.conquer(city.tile());
    rival.captureUnit(city);
    farmUnit.delete(false);
    await economy.prepare(g, noGrowth);
    expect(economy.applyPlayer(g, p)).toBe(true);
    expect(economy.applyPlayer(g, rival)).toBe(true);
    expect([p.troops(), p.food(), rival.troops()]).toEqual([0, 0n, 0]);

    const empty = new SimpleEconomy();
    await publish(empty, g, p);
    p.addFood(500n);
    await publish(empty, g, p);
    expect(p.food()).toBe(0n);
  });

  test("clearing an injected provider restores the default urban tick", async () => {
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
