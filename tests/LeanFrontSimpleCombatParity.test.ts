import { describe, expect, test } from "vitest";
import {
  SimpleEconomy,
  type SimpleGrowthBatch,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import { createRuntime } from "../src/client/games/leanfront-simple/runtime";
import { Executor } from "../src/core/execution/ExecutionManager";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { GameRunner } from "../src/core/GameRunner";
import type { StampedIntent, Turn } from "../src/core/Schemas";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

class SimpleTestConfig extends TestConfig {
  override simplePlotEconomy() {
    return {
      capacityPerLevel: 20_000,
      seedFraction: 0.1,
      cityGrowthRate: 0.03,
      farmGrowthRate: 0.06,
      cityLevelCost: 4_000n,
      farmLevelCost: 3_000n,
      razeCost: 1_000n,
      attackMilliPerPerson: 40n,
    };
  }
}

const attackerInfo = new PlayerInfo(
  "attacker",
  PlayerType.Human,
  "attacker-client",
  "attacker",
);
const defenderInfo = new PlayerInfo(
  "defender",
  PlayerType.Human,
  "defender-client",
  "defender",
);

const identityGrowth: SimpleGrowthBatch = async (records, config) =>
  records.map((record) => ({
    ...record,
    capacity: config.capacityPerLevel * record.level,
    growth: 0,
    nextStock: record.stock,
  }));

function snapshot(game: Game) {
  return {
    owners: game
      .players()
      .map((player) => ({
        id: player.id(),
        tiles: [...player.tiles()].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    players: game
      .players()
      .map((player) => ({
        id: player.id(),
        troops: player.troops(),
        attacks: player
          .outgoingAttacks()
          .map((attack) => ({
            target: String(attack.target().id()),
            troops: attack.troops(),
            retreating: attack.retreating(),
            retreated: attack.retreated(),
            front: [...attack.frontTiles()]
              .sort((a, b) => a - b)
              .map((tile) => [tile, attack.troopsAt(tile)]),
          }))
          .sort((a, b) => a.target.localeCompare(b.target)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function runner(game: Game): GameRunner {
  return new GameRunner(
    game,
    new Executor(game, "combat-parity", "attacker-client"),
    () => {},
  );
}

function turn(number: number, intents: StampedIntent[] = []): Turn {
  return { turnNumber: number, intents };
}

async function fixture(players: PlayerInfo[]): Promise<{
  open: Game;
  simple: Game;
  openPlayers: Player[];
  simplePlayers: Player[];
}> {
  const open = await setup("plains", { instantBuild: true }, players);
  const simple = await setup(
    "plains",
    { instantBuild: true },
    players,
    undefined,
    SimpleTestConfig,
  );
  const openPlayers = players.map((player) => open.player(player.id));
  const simplePlayers = players.map((player) => simple.player(player.id));
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 10; x++) {
      openPlayers[0]!.conquer(open.ref(x, y));
      simplePlayers[0]!.conquer(simple.ref(x, y));
    }
    if (players.length > 1) {
      for (let x = 10; x < 20; x++) {
        openPlayers[1]!.conquer(open.ref(x, y));
        simplePlayers[1]!.conquer(simple.ref(x, y));
      }
    }
  }
  for (const [game, gamePlayers] of [
    [open, openPlayers],
    [simple, simplePlayers],
  ] as const) {
    for (const [index, player] of gamePlayers.entries()) {
      const x = index === 0 ? 5 : 15;
      player.buildUnit(UnitType.Settlement, game.ref(x, 15), {});
      player.buildUnit(UnitType.Farmland, game.ref(x + 1, 15), {});
    }
  }
  for (const player of openPlayers)
    open.addExecution(new PlayerExecution(player));
  for (const player of simplePlayers)
    simple.addExecution(new PlayerExecution(player));
  return { open, simple, openPlayers, simplePlayers };
}

async function expectCombatParity(target: "terra" | "player"): Promise<void> {
  const players =
    target === "player" ? [attackerInfo, defenderInfo] : [attackerInfo];
  const { open, simple, openPlayers, simplePlayers } = await fixture(players);
  const openRunner = runner(open);
  const simpleRunner = runner(simple);
  const runtime = await createRuntime(
    simple,
    new SimpleEconomy(identityGrowth),
  );
  let turnNumber = 0;

  try {
    await runtime.beforeTick();
    simpleRunner.addTurn(turn(turnNumber));
    openRunner.addTurn(turn(turnNumber++));
    simpleRunner.executeNextTick();
    openRunner.executeNextTick();

    for (const player of openPlayers) player.setTroops(50_000);
    for (const player of simplePlayers) {
      player.setTroops(50_000);
      player.addFood(1_000_000n);
    }
    await runtime.beforeTick();
    simpleRunner.addTurn(turn(turnNumber));
    openRunner.addTurn(turn(turnNumber++));
    simpleRunner.executeNextTick();
    openRunner.executeNextTick();

    const targetID = target === "terra" ? null : simplePlayers[1]!.id();
    const attack: StampedIntent = {
      type: "attack",
      clientID: "attacker-client",
      targetID,
      troops: 20_000,
      sourceTiles: null,
    };
    await runtime.beforeTick();
    simpleRunner.addTurn(turn(turnNumber, [attack]));
    openRunner.addTurn(turn(turnNumber++, [attack]));
    simpleRunner.executeNextTick();
    openRunner.executeNextTick();
    expect(snapshot(simple)).toEqual(snapshot(open));

    for (let combatTick = 0; combatTick < 30; combatTick++) {
      await runtime.beforeTick();
      simpleRunner.addTurn(turn(turnNumber));
      openRunner.addTurn(turn(turnNumber++));
      simpleRunner.executeNextTick();
      openRunner.executeNextTick();
      expect(snapshot(simple)).toEqual(snapshot(open));
    }
  } finally {
    runtime.dispose();
  }
}

describe("LeanFront Simple combat parity", () => {
  test("matches OpenFront against Terra Nullius for 30 queued combat ticks", async () => {
    await expectCombatParity("terra");
  });

  test("matches OpenFront against another player for 30 queued combat ticks", async () => {
    await expectCombatParity("player");
  });
});
