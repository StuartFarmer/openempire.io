import { describe, expect, test } from "vitest";
import {
  SimpleEconomy,
  type SimpleGrowthBatch,
} from "../src/client/games/leanfront-simple/economy/SimpleEconomy";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
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
  null,
  "attacker",
);
const defenderInfo = new PlayerInfo(
  "defender",
  PlayerType.Human,
  null,
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
  for (const player of [...openPlayers, ...simplePlayers]) {
    player.buildUnit(
      UnitType.Settlement,
      player.tiles().values().next().value!,
      {},
    );
    player.buildUnit(UnitType.Farmland, [...player.tiles()][1]!, {});
  }
  openPlayers[0]!.setTroops(50_000);
  return { open, simple, openPlayers, simplePlayers };
}

async function expectCombatParity(target: "terra" | "player"): Promise<void> {
  const players =
    target === "player" ? [attackerInfo, defenderInfo] : [attackerInfo];
  const { open, simple, openPlayers, simplePlayers } = await fixture(players);
  const openTarget =
    target === "terra" ? open.terraNullius().id() : openPlayers[1]!.id();
  const simpleTarget =
    target === "terra" ? simple.terraNullius().id() : simplePlayers[1]!.id();
  const openAttack = new AttackExecution(20_000, openPlayers[0]!, openTarget);
  const simpleAttack = new AttackExecution(
    20_000,
    simplePlayers[0]!,
    simpleTarget,
  );
  const simpleEconomy = new SimpleEconomy();
  await simpleEconomy.prepare(simple, identityGrowth);
  simpleEconomy.applyPlayer(simple, simplePlayers[0]!);
  simplePlayers[0]!.setTroops(50_000);
  simplePlayers[0]!.addFood(1_000_000n);
  await simpleEconomy.prepare(simple, identityGrowth);
  simpleEconomy.applyPlayer(simple, simplePlayers[0]!);

  openAttack.init(open, open.ticks());
  simpleAttack.init(simple, simple.ticks());

  for (let tick = 0; tick < 30; tick++) {
    await simpleEconomy.prepare(simple, identityGrowth);
    simpleEconomy.applyPlayer(simple, simplePlayers[0]!);
    openAttack.tick(open.ticks());
    simpleAttack.tick(simple.ticks());
    open.executeNextTick();
    simple.executeNextTick();
    expect(snapshot(simple)).toEqual(snapshot(open));
  }
}

describe("LeanFront Simple combat parity", () => {
  test("matches OpenFront against Terra Nullius for 30 real combat ticks", async () => {
    await expectCombatParity("terra");
  });

  test("matches OpenFront against another player for 30 real combat ticks", async () => {
    await expectCombatParity("player");
  });
});
