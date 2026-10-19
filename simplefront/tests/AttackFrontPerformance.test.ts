import { afterEach, describe, expect, test, vi } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

const attackerInfo = new PlayerInfo("attacker", PlayerType.Human, null, "atk");
const defenderInfo = new PlayerInfo("defender", PlayerType.Human, null, "def");

async function fixture() {
  const game = await setup("big_plains", {}, [attackerInfo, defenderInfo]);
  const attacker = game.player(attackerInfo.id);
  const defender = game.player(defenderInfo.id);
  attacker.conquer(game.ref(0, 0));
  defender.conquer(game.ref(1, 0));
  const attack = attacker.createAttack(defender, 0, null, new Set());
  const execution = new AttackExecution(0, attacker, defender.id());
  // Isolate the real seep pass from conquest, which consumes troops afterwards.
  Object.assign(execution, {
    mg: game,
    map: game.map(),
    attack,
    target: defender,
  });
  return { game, attacker, defender, attack, execution };
}

afterEach(() => vi.restoreAllMocks());

describe("front redistribution", () => {
  test("already ordered destinations need no sorting work", async () => {
    const { attack } = await fixture();
    const tiles = Object.freeze([2, 3, 4]);
    const sort = vi.spyOn(Array.prototype, "sort");
    for (let i = 0; i < 20; i++) attack.distributeOver(tiles, 8);
    expect(sort).not.toHaveBeenCalled();
    expect(tiles.map((tile) => attack.troopsAt(tile))).toEqual([60, 60, 40]);
    expect(attack.troops()).toBe(160);
  });

  test("unordered destinations keep lowest-tile remainders and the input order", async () => {
    const { attack } = await fixture();
    const tiles = Object.freeze([4, 2, 3]);
    attack.distributeOver(tiles, 8);
    expect(tiles).toEqual([4, 2, 3]);
    expect([2, 3, 4].map((tile) => attack.troopsAt(tile))).toEqual([3, 3, 2]);
    expect([...attack.frontTiles()]).toEqual([2, 3, 4]);
    expect(attack.troops()).toBe(8);
  });

  test("opposing attacks share the sorted front after draining tiles and deleting an incoming attack", async () => {
    const { game, attacker, defender, attack, execution } = await fixture();
    const north = game.ref(10, 9);
    const south = game.ref(10, 10);
    attack.addTroopsAt(south, 7);
    attack.addTroopsAt(north, 10);
    const first = defender.createAttack(attacker, 0, null, new Set());
    first.addTroopsAt(game.ref(9, 9), 10);
    const second = defender.createAttack(attacker, 0, null, new Set());
    const left = game.ref(9, 10);
    const right = game.ref(11, 10);
    const down = game.ref(10, 11);
    second.addTroopsAt(left, 2);
    second.addTroopsAt(right, 3);
    second.addTroopsAt(down, 5);
    const sort = vi.spyOn(Array.prototype, "sort");
    execution["clashWithOpposing"]();
    expect(sort).toHaveBeenCalledTimes(1);
    expect(attack.troops()).toBe(0);
    expect([...attack.frontTiles()]).toEqual([south, north]);
    expect(first.isActive()).toBe(false);
    expect(attacker.incomingAttacks()).toEqual([second]);
    expect([left, right, down].map((t) => second.troopsAt(t))).toEqual([
      0, 0, 3,
    ]);
    expect(second.troops()).toBe(3);
  });

  test("seep uses its initial snapshot, refills zero entries, and clears old targets", async () => {
    const { game, attack, execution } = await fixture();
    game.config().setFoodOverride("frontSeepFraction", 0.25);
    const center = game.ref(10, 10);
    const up = game.ref(10, 9);
    const left = game.ref(9, 10);
    const right = game.ref(11, 10);
    const down = game.ref(10, 11);
    const isolated = game.ref(20, 20);
    // Scrambled insertion order; drained entries still belong to the front.
    for (const tile of [down, right, center, up, left, isolated]) {
      attack.addTroopsAt(tile, 1);
      attack.spendAt(tile, 1);
    }
    attack.addTroopsAt(center, 20);
    attack.addTroopsAt(isolated, 100);
    execution["seep"]();
    expect(
      [up, left, center, right, down, isolated].map((t) => attack.troopsAt(t)),
    ).toEqual([2, 1, 15, 1, 1, 100]);
    expect(attack.troops()).toBe(120);
    // A second pass must snapshot the new amounts, without stale destinations.
    execution["seep"]();
    expect(
      [up, left, center, right, down, isolated].map((t) => attack.troopsAt(t)),
    ).toEqual([3, 2, 12, 2, 1, 100]);
    expect(attack.troops()).toBe(120);
  });
});
