import { beforeEach, describe, expect, test } from "vitest";
import {
  foodShedField,
  foodShedPotential,
} from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * The food-shed (add-urban-core-growth, growth-model.md Part 2): a second
 * supply field, sourced from Farmland and weighted by maturity, with soft
 * distance decay. It governs where a settlement grows into a city.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const flat: LayersFill = () => 200;

async function layeredGame(): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    flat,
  );
}

describe("food-shed field", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(info.id);
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) player.conquer(game.ref(x, y));
  });

  test("potential is highest at a mature farm and decays with distance", () => {
    const farm = game.ref(30, 30);
    player.buildUnit(UnitType.Farmland, farm, {});
    player.setFarmMaturity(farm, 1000);

    const shed = foodShedField(game, player);
    const atFarm = foodShedPotential(game, shed, farm);
    const near = foodShedPotential(game, shed, game.ref(35, 30)); // 5 away
    const far = foodShedPotential(game, shed, game.ref(48, 30)); // 18 away

    expect(atFarm).toBeCloseTo(1, 5); // maturity 1 × decay(0)=1
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(atFarm);
    expect(far).toBeLessThan(near);
  });

  test("an immature farm projects a weak food-shed", () => {
    const farm = game.ref(30, 30);
    player.buildUnit(UnitType.Farmland, farm, {});
    player.setFarmMaturity(farm, 200); // 20% mature

    const shed = foodShedField(game, player);
    // Potential at the farm scales with maturity (decay(0)=1).
    expect(foodShedPotential(game, shed, farm)).toBeCloseTo(0.2, 5);
  });

  test("no farms → no food-shed anywhere", () => {
    const shed = foodShedField(game, player);
    expect(foodShedPotential(game, shed, game.ref(30, 30))).toBe(0);
  });

  test("food-shed does not reach across unowned land", async () => {
    // A farm in a disconnected owned pocket cannot feed the main territory.
    const g = await layeredGame();
    const p = g.player(info.id);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) p.conquer(g.ref(x, y));
    const farm = g.ref(2, 2);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);
    // A far, unconnected owned tile.
    p.conquer(g.ref(50, 50));

    const shed = foodShedField(g, p);
    expect(foodShedPotential(g, shed, g.ref(50, 50))).toBe(0);
    expect(foodShedPotential(g, shed, farm)).toBeGreaterThan(0);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(info.id);
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 40; x++) p.conquer(g.ref(x, y));
      for (const [x, y] of [
        [10, 10],
        [25, 25],
        [30, 12],
      ]) {
        p.buildUnit(UnitType.Farmland, g.ref(x, y), {});
        p.setFarmMaturity(g.ref(x, y), 700);
      }
      const shed = foodShedField(g, p);
      const probes: number[] = [];
      for (let x = 0; x < 40; x += 5)
        probes.push(foodShedPotential(g, shed, g.ref(x, 15)));
      return probes;
    };
    expect(await run()).toEqual(await run());
  });
});
