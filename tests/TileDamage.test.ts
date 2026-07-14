import { describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { farmTick } from "../src/core/execution/utils/FarmGrowth";
import { supplyField } from "../src/core/execution/utils/SupplyField";
import { growUrbanArea } from "../src/core/execution/utils/UrbanGrowth";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

/**
 * Tile combat damage (rework-settlement-ecology): fighting scars the ground.
 * Tiles conquered in combat accumulate damage that heals over time; while any
 * damage remains the tile refuses plots, is skipped by urban growth, and
 * freezes its farm — full heal before anything grows again.
 */

const atkInfo = new PlayerInfo("attacker", PlayerType.Human, null, "atk_id");
const defInfo = new PlayerInfo("defender", PlayerType.Human, null, "def_id");

const goodClimate: LayersFill = (n) => (n === "temperature" ? 153 : 255);

/** Instant-heal variant so a single game tick clears all damage. */
class FastHeal extends TestConfig {
  override food() {
    return { ...super.food(), tileDamageHealMilli: 1000 };
  }
}

/** The broad-food-shed config UrbanGrowth tests use to isolate the CA. */
class Fed extends TestConfig {
  override food() {
    return {
      ...super.food(),
      foodShedRadius: 500,
      foodShedPower: 3,
      wFoodShed: 2,
    };
  }
}

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

describe("combat scars the ground", () => {
  test("tiles conquered from a player take damage; wilderness expansion leaves none", async () => {
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
    conquerBlock(game, attacker, 0, 0, 10, 30); // x 0..9
    conquerBlock(game, defender, 10, 0, 10, 30); // x 10..19; x≥20 is neutral
    attacker.setTroops(100_000);
    defender.setTroops(1_000);

    game.addExecution(
      new AttackExecution(40_000, attacker, defender.id(), null, true),
    );
    for (let i = 0; i < 15; i++) game.executeNextTick();

    // Combat conquest: attacker-held tiles past the old border are scarred.
    let scarred = 0;
    let takenInCombat = 0;
    for (const t of attacker.tiles()) {
      if (game.x(t) < 10) continue;
      takenInCombat++;
      if (game.tileDamage(t) > 0) scarred++;
    }
    expect(takenInCombat).toBeGreaterThan(0);
    expect(scarred).toBe(takenInCombat);

    // Wilderness expansion is not combat: no scar on neutral land taken.
    game.addExecution(
      new AttackExecution(20_000, attacker, game.terraNullius().id(), null),
    );
    for (let i = 0; i < 400; i++) game.executeNextTick(); // long: also heals war scars
    let neutralTaken = 0;
    for (const t of attacker.tiles()) {
      if (game.x(t) < 20) continue;
      neutralTaken++;
      expect(game.tileDamage(t)).toBe(0);
    }
    expect(neutralTaken).toBeGreaterThan(0);
  });

  test("damage stacks toward the 1000 cap and heals to zero over time", async () => {
    const game = await setup("plains", {}, [atkInfo]);
    const t = game.ref(5, 5);
    game.addTileDamage(t, 700);
    game.addTileDamage(t, 700);
    expect(game.tileDamage(t)).toBe(1000); // clamped

    const heal = game.config().food().tileDamageHealMilli;
    game.executeNextTick();
    expect(game.tileDamage(t)).toBe(1000 - heal); // linear heal

    // Runs all the way down to fully healed, then drops out of the sparse set.
    for (let i = 0; i < Math.ceil(1000 / heal); i++) game.executeNextTick();
    expect(game.tileDamage(t)).toBe(0);
    expect(Array.from(game.tileDamageEntries())).toHaveLength(0);
  });
});

describe("nothing grows on smoking ground", () => {
  test("a damaged tile refuses plots until fully healed", async () => {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [atkInfo],
      undefined,
      FastHeal,
      true,
      goodClimate,
    );
    const player = game.player(atkInfo.id);
    conquerBlock(game, player, 0, 0, 6);
    const tile = game.ref(3, 3);

    game.addTileDamage(tile, 500);
    expect(player.canBuild(UnitType.Farmland, tile)).toBe(false);
    expect(player.canBuild(UnitType.Settlement, tile)).toBe(false);

    game.executeNextTick(); // FastHeal: one tick heals everything
    expect(game.tileDamage(tile)).toBe(0);
    expect(player.canBuild(UnitType.Farmland, tile)).toBe(tile);
  });

  test("a damaged tile freezes its farm; healing resumes ripening", async () => {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [atkInfo],
      undefined,
      FastHeal,
      true,
      goodClimate,
    );
    const player = game.player(atkInfo.id);
    conquerBlock(game, player, 0, 0, 6);
    const tile = game.ref(2, 2);
    player.buildUnit(UnitType.Farmland, tile, {});

    for (let i = 0; i < 50; i++) farmTick(game, player);
    const grown = player.farmMaturity(tile);
    expect(grown).toBeGreaterThan(0);

    game.addTileDamage(tile, 900);
    for (let i = 0; i < 50; i++) farmTick(game, player);
    expect(player.farmMaturity(tile)).toBe(grown); // frozen, no senescence either

    game.executeNextTick(); // heal
    farmTick(game, player);
    expect(player.farmMaturity(tile)).toBeGreaterThan(grown); // resumes
  });

  test("the city grows around the scar, never onto it", async () => {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [atkInfo],
      undefined,
      Fed,
      true,
      () => 200,
    );
    const player = game.player(atkInfo.id);
    conquerBlock(game, player, 10, 10, 40);
    const core = game.ref(30, 30);
    player.setCore(core);
    player.setDensity(core, game.config().food().popPerDensity);
    const farm = game.ref(33, 33);
    player.buildUnit(UnitType.Farmland, farm, {});
    player.setFarmMaturity(farm, 1000);

    // Scar a tile right next to the core, in the city's natural path.
    const scar = game.ref(31, 30);
    game.addTileDamage(scar, 1000);

    (
      player as Player & { _foodFlow: { population: number } }
    )._foodFlow.population = 3_000_000;
    const supply = supplyField(game, player);
    for (let i = 0; i < 120; i++) growUrbanArea(game, player, supply);

    expect(player.urbanArea()).toBeGreaterThan(20); // the city did grow…
    expect(player.density(scar)).toBe(0); // …but never onto the scar
  });
});
