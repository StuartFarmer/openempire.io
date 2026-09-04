import { describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { farmTick } from "../src/core/execution/utils/FarmGrowth";
import { PlayerFoodShed } from "../src/core/execution/utils/FoodShed";
import {
  Game,
  LandUse,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * Persistent tiles + burn-on-conquest (rework-persistent-tiles-and-burn):
 * worked land never reverts to wild — a declining field floors at the
 * initial-farmland seed and regrows; conquest KEEPS each tile's type for the
 * captor, burns it, and regrows it as their own; and every conquered tile (not
 * just a razed nucleus) fires a one-shot burn event.
 */

const atkInfo = new PlayerInfo("attacker", PlayerType.Human, null, "atk_id");
const defInfo = new PlayerInfo("defender", PlayerType.Human, null, "def_id");
const goodClimate: LayersFill = (n) => (n === "temperature" ? 153 : 255);

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  w: number,
  h = w,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) player.conquer(game.ref(x, y));
  }
}

async function onePlayer(): Promise<[Game, Player]> {
  const game = await setup(
    "plains",
    { instantBuild: true },
    [atkInfo],
    undefined,
    undefined,
    true,
    goodClimate,
  );
  const player = game.player(atkInfo.id);
  conquerBlock(game, player, 0, 0, 10);
  return [game, player];
}

describe("worked land is permanent and regrows", () => {
  test("a fallow field floors at the initial seed, stays Field, and re-ripens", async () => {
    const [game, player] = await onePlayer();
    const f = game.config().food();
    const tile = game.ref(3, 3);
    // A claimed field tile (maturity at the claim threshold zones it Field).
    player.setFarmMaturity(tile, f.fieldClaimMilli);
    expect(player.landUse(tile)).toBe(LandUse.Field);

    // Fallow: ranked by the shed but not staffed → senesces.
    const shed = new PlayerFoodShed();
    shed.ranked.add(tile);
    for (let i = 0; i < 300; i++) farmTick(game, player, shed);

    // Floored at the initial-farmland seed — NOT cleared to 0, NOT reverted.
    expect(player.farmMaturity(tile)).toBe(f.farmSeedMilli);
    expect(player.landUse(tile)).toBe(LandUse.Field);
    expect(player.isFieldTile(tile)).toBe(true);

    // Labor returns (tilled, not fallow): the crop regrows from the seed.
    shed.ranked.delete(tile);
    shed.tilled.add(tile);
    farmTick(game, player, shed);
    expect(player.farmMaturity(tile)).toBeGreaterThan(f.farmSeedMilli);
  });

  test("a receded city tile keeps its Urban zone and regrows density", async () => {
    const [game, player] = await onePlayer();
    const full = game.config().food().popPerDensity;
    const tile = game.ref(4, 4);
    player.setDensity(tile, full);
    expect(player.landUse(tile)).toBe(LandUse.Urban);

    player.setDensity(tile, 0); // recession empties the tile
    expect(player.density(tile)).toBe(0);
    expect(player.landUse(tile)).toBe(LandUse.Urban); // empty lot, still zoned

    player.setDensity(tile, full); // people return
    expect(player.density(tile)).toBe(full);
  });
});

describe("conquest keeps the tile's type and burns it", () => {
  async function twoPlayers(): Promise<[Game, Player, Player]> {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [atkInfo, defInfo],
      undefined,
      undefined,
      true,
      goodClimate,
    );
    const attacker = game.player(atkInfo.id);
    const defender = game.player(defInfo.id);
    conquerBlock(game, attacker, 0, 0, 10, 20); // x 0..9
    conquerBlock(game, defender, 10, 0, 10, 20); // x 10..19
    return [game, attacker, defender];
  }

  test("a conquered field becomes the captor's initial farmland", async () => {
    const [game, attacker, defender] = await twoPlayers();
    const f = game.config().food();
    const tile = game.ref(12, 5);
    defender.setFarmMaturity(tile, 1000); // a fully-grown enemy field
    expect(defender.landUse(tile)).toBe(LandUse.Field);

    attacker.conquer(tile);

    expect(attacker.landUse(tile)).toBe(LandUse.Field); // type kept for captor
    expect(attacker.farmMaturity(tile)).toBe(f.farmSeedMilli); // reset to seed
    expect(defender.landUse(tile)).toBeUndefined(); // prior owner loses it
  });

  test("a conquered city becomes the captor's empty urban lot", async () => {
    const [game, attacker, defender] = await twoPlayers();
    const full = game.config().food().popPerDensity;
    const tile = game.ref(13, 6);
    defender.setDensity(tile, full); // a full enemy city tile
    expect(defender.landUse(tile)).toBe(LandUse.Urban);

    attacker.conquer(tile);

    expect(attacker.landUse(tile)).toBe(LandUse.Urban); // zone kept for captor
    expect(attacker.density(tile)).toBe(0); // empty lot — regrows a house later
    expect(defender.landUse(tile)).toBeUndefined();
  });

  test("wilderness conquest zones nothing (no type to inherit)", async () => {
    const [game, attacker] = await twoPlayers();
    const tile = game.ref(25, 5); // neutral land
    attacker.conquer(tile);
    expect(attacker.landUse(tile)).toBeUndefined();
  });
});

describe("burn events fire for every conquered tile", () => {
  test("combat damage emits a burn; the list drains once", async () => {
    const [game] = await onePlayer();
    const a = game.ref(2, 2);
    const b = game.ref(2, 3);
    game.addTileDamage(a, 400);
    game.addTileDamage(b, 400);
    const burns = game.drainPackedBurns();
    expect(burns).not.toBeNull();
    expect(Array.from(burns!).sort()).toEqual([a, b].sort());
    expect(game.drainPackedBurns()).toBeNull(); // drained
  });

  test("the burn list is identical across two seeded runs (deterministic)", async () => {
    const run = async (): Promise<number[]> => {
      const game = await setup(
        "plains",
        { instantBuild: true },
        [atkInfo, defInfo],
        undefined,
        undefined,
        true,
        goodClimate,
      );
      const attacker = game.player(atkInfo.id);
      const defender = game.player(defInfo.id);
      conquerBlock(game, attacker, 0, 0, 10, 20);
      conquerBlock(game, defender, 10, 0, 10, 20);
      attacker.setTroops(100_000);
      defender.setTroops(1_000);
      game.addExecution(
        new AttackExecution(40_000, attacker, defender.id(), null, true),
      );
      const all: number[] = [];
      for (let i = 0; i < 15; i++) {
        game.executeNextTick();
        const burns = game.drainPackedBurns();
        if (burns) all.push(...Array.from(burns));
      }
      return all;
    };
    const first = await run();
    const second = await run();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});

describe("captured plots persist, DefensePosts do not", () => {
  test("a conquered Settlement transfers to the captor; a DefensePost is destroyed", async () => {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [atkInfo, defInfo],
      undefined,
      undefined,
      true,
      goodClimate,
    );
    const attacker = game.player(atkInfo.id);
    const defender = game.player(defInfo.id);
    conquerBlock(game, attacker, 0, 0, 10, 20);
    conquerBlock(game, defender, 10, 0, 10, 20);

    const townTile = game.ref(12, 5);
    const fortTile = game.ref(13, 5);
    const settlement = defender.buildUnit(UnitType.Settlement, townTile, {});
    const fort = defender.buildUnit(UnitType.DefensePost, fortTile, {});

    // PlayerExecution owns the capture/raze reconciliation; add + init it
    // (a freshly-added execution is init'd one tick before it first ticks).
    game.addExecution(new PlayerExecution(defender));
    game.executeNextTick();

    // The attacker takes both tiles, then PlayerExecution reconciles the units.
    attacker.conquer(townTile);
    attacker.conquer(fortTile);
    game.executeNextTick();

    expect(settlement.isActive()).toBe(true);
    expect(settlement.owner().id()).toBe(attacker.id()); // captured, not razed
    expect(fort.isActive()).toBe(false); // DefensePost destroyed on capture
  });
});
