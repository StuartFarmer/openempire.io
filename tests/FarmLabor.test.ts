import { describe, expect, test } from "vitest";
import {
  farmLaborFactor,
  foodShedField,
} from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

/**
 * Farm labor (rework-settlement-ecology task 4.1): a farm's output scales
 * with the people available to tend it — city-dwellers in its food-shed
 * cell (with surplus spilling to under-tended farms of the same shed) plus
 * the rural population (everyone not housed in a city tile). A soft factor
 * with a floor: an unpeopled breadbasket underproduces but never zeroes.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");

async function game(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    (n) => (n === "temperature" ? 153 : 255),
  );
  const p = g.player(info.id);
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) p.conquer(g.ref(x, y));
  return [g, p];
}

function setPopulation(p: Player, people: number): void {
  (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
    people;
}

describe("farm labor", () => {
  test("a village's rural population staffs its farms (no city needed)", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, t, {});
    setPopulation(p, 2000); // all rural — no city tiles exist
    const shed = foodShedField(g, p);
    expect(farmLaborFactor(g, shed, t)).toBe(1);
  });

  test("an unpeopled breadbasket bottoms out at the labor floor, never zero", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, t, {});
    setPopulation(p, 0); // nobody anywhere
    const shed = foodShedField(g, p);
    const f = g.config().food();
    expect(farmLaborFactor(g, shed, t)).toBe(f.laborFloor);
    expect(farmLaborFactor(g, shed, t)).toBeGreaterThan(0);
  });

  test("degradation is graceful: half the farmers, roughly half the factor", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    const t = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, t, {});
    setPopulation(p, Math.floor(f.farmersPerFarm / 2)); // half a farm's need
    const shed = foodShedField(g, p);
    expect(farmLaborFactor(g, shed, t)).toBeCloseTo(0.5, 5);
  });

  test("a dense core's surplus spills to every farm of its shed", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    // Three farms around one packed city tile: the Voronoi cell of one farm
    // holds ALL the people, but the surplus staffs the siblings too.
    const core = g.ref(10, 10);
    p.setDensity(core, f.popPerDensity);
    const farms = [g.ref(9, 10), g.ref(11, 10), g.ref(10, 12)];
    for (const t of farms) p.buildUnit(UnitType.Farmland, t, {});
    setPopulation(p, f.popPerDensity); // everyone lives in the core — no rural
    const shed = foodShedField(g, p);
    for (const t of farms) {
      expect(farmLaborFactor(g, shed, t)).toBe(1);
    }
  });

  test("a fully urbanized nation leaves remote farms under-tended", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    // One packed city tile far from the farm (outside the shed cutoff), and
    // zero rural population: nobody can reach the remote farm.
    const cityTile = g.ref(28, 28);
    p.setDensity(cityTile, f.popPerDensity);
    const remote = g.ref(2, 2); // shed cutoff is ~3×foodShedRadius steps
    p.buildUnit(UnitType.Farmland, remote, {});
    setPopulation(p, f.popPerDensity); // pop == urban → rural 0
    const shed = foodShedField(g, p);
    expect(farmLaborFactor(g, shed, remote)).toBe(f.laborFloor);
  });
});
