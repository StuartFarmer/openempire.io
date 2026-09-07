import { expect, test, vi } from "vitest";
import { NationExecution } from "../src/core/execution/NationExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import * as supply from "../src/core/execution/utils/SupplyField";
import * as urban from "../src/core/execution/utils/UrbanGrowth";
import {
  Cell,
  Nation,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { createGame } from "../src/core/game/GameImpl";
import { SimpleFrontConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";

test("actual SimpleFront bots and nations expand without legacy economy work", async () => {
  const fixture = await setup("plains");
  const config = new SimpleFrontConfig(
    fixture.config().gameConfig(),
    null,
    false,
  );
  const game = createGame([], [], fixture.map(), fixture.map(), config);
  const nation = new Nation(
    new Cell(50, 50),
    new PlayerInfo("Nation", PlayerType.Nation, null, "nation"),
  );
  const botInfo = new PlayerInfo("Bot", PlayerType.Bot, null, "bot");
  const urbanSpy = vi.spyOn(urban, "urbanTick");
  const supplySpy = vi.spyOn(supply, "supplyField");
  game.addExecution(
    new NationExecution("test", nation),
    new SpawnExecution("test", botInfo, game.ref(80, 80)),
  );
  for (let i = 0; i < 5; i++) game.executeNextTick();
  game.endSpawnPhase();
  const players = [game.player("nation"), game.player("bot")];
  const initial = players.map((p) =>
    p.units(UnitType.Settlement, UnitType.Farmland).map((u) => u.tile()),
  );
  expect(initial.map((tiles) => tiles.length)).toEqual([2, 2]);
  const initialLand = players.map((p) => p.numTilesOwned());
  for (let i = 0; i < 1000; i++) game.executeNextTick();
  for (const [i, p] of players.entries()) {
    expect(p.numTilesOwned()).toBeGreaterThan(initialLand[i]);
    expect(p.units().some((u) => u.isMarkedForDeletion())).toBe(false);
    expect(p.foodMilli()).toBeGreaterThan(4_000_000n);
    expect(p.troops()).toBeGreaterThanOrEqual(0);
  }
  expect(urbanSpy).not.toHaveBeenCalled();
  expect(supplySpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
