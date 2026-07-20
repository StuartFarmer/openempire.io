import { describe, expect, test } from "vitest";
import { foodShedField, isFallow } from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

/**
 * Labor coverage (rework-settlement-ecology §1b): each field's shed-cell
 * pool TILLS its claimed tiles at farmersPerFieldTile each, best (most
 * mature) tiles first; the nucleus is always staffed (bootstrap guard).
 * Ranked-but-unstaffed tiles are FALLOW. Labor gates tilling — it never
 * scales yield and never touches growth rates.
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
  // Labor pools are IDLE-based (troops(); deployed soldiers neither farm
  // nor eat at home — task 4.2), so stock the idle pool directly.
  p.setTroops(people);
  (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
    people;
}

/** Force a coverage refresh (the shed normally refreshes on cadence). */
function refreshShed(g: Game, p: Player) {
  const s = foodShedField(g, p);
  s.lastCalcTick = -1;
  return foodShedField(g, p);
}

describe("labor coverage", () => {
  test("a village's rural population tills its whole field (no city needed)", async () => {
    const [g, p] = await game();
    const nucleus = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, nucleus, {});
    const claims = [g.ref(6, 5), g.ref(7, 5), g.ref(5, 6), g.ref(5, 7)];
    for (const t of claims) p.setFarmMaturity(t, 1000);
    setPopulation(p, 2000); // all rural — no city tiles exist
    const shed = refreshShed(g, p);
    expect(shed.tilled.has(nucleus)).toBe(true);
    for (const t of claims) {
      expect(shed.tilled.has(t)).toBe(true);
      expect(isFallow(shed, t)).toBe(false);
    }
  });

  test("zero population tills only the nucleus; the rest lies fallow", async () => {
    const [g, p] = await game();
    const nucleus = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, nucleus, {});
    const claim = g.ref(6, 5);
    p.setFarmMaturity(claim, 1000);
    setPopulation(p, 0); // nobody anywhere
    const shed = refreshShed(g, p);
    expect(shed.tilled.has(nucleus)).toBe(true); // bootstrap guard
    expect(isFallow(shed, claim)).toBe(true);
  });

  test("a short pool tills the most mature tiles first — margins go fallow", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    const nucleus = g.ref(5, 5);
    p.buildUnit(UnitType.Farmland, nucleus, {});
    const graded: [number, ReturnType<Game["ref"]>][] = [
      [1000, g.ref(6, 5)],
      [900, g.ref(7, 5)],
      [800, g.ref(5, 6)],
      [700, g.ref(5, 7)],
      [600, g.ref(6, 6)],
    ];
    for (const [m, t] of graded) p.setFarmMaturity(t, m);
    // Pool for nucleus + 2 tiles only.
    setPopulation(p, 3 * f.farmersPerFieldTile);
    const shed = refreshShed(g, p);
    expect(shed.tilled.has(graded[0][1])).toBe(true); // 1000
    expect(shed.tilled.has(graded[1][1])).toBe(true); // 900
    for (const [, t] of graded.slice(2)) {
      expect(isFallow(shed, t)).toBe(true); // the young margins starve first
    }
  });

  test("a dense core's surplus spills to the under-staffed field next door", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    // Farm A sits by a packed city tile and needs almost nobody; farm B has
    // real claimed acreage but no people of its own.
    const farmA = g.ref(10, 10);
    p.buildUnit(UnitType.Farmland, farmA, {});
    p.setDensity(g.ref(10, 11), f.popPerDensity);
    const farmB = g.ref(14, 10);
    p.buildUnit(UnitType.Farmland, farmB, {});
    const bClaims = [g.ref(15, 10), g.ref(16, 10)];
    for (const t of bClaims) p.setFarmMaturity(t, 1000);
    setPopulation(p, f.popPerDensity); // everyone lives in the core — no rural
    const shed = refreshShed(g, p);
    for (const t of bClaims) expect(shed.tilled.has(t)).toBe(true);
  });

  test("a fully urbanized nation leaves remote fields unstaffed", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    // The city lives on a DISCONNECTED block — the shed BFS cannot reach
    // the field through unowned land, so its people staff nothing there.
    for (let y = 40; y < 44; y++)
      for (let x = 40; x < 44; x++) p.conquer(g.ref(x, y));
    p.setDensity(g.ref(41, 41), f.popPerDensity);
    const remote = g.ref(2, 2);
    p.buildUnit(UnitType.Farmland, remote, {});
    const claim = g.ref(3, 2);
    p.setFarmMaturity(claim, 1000);
    setPopulation(p, f.popPerDensity); // pop == urban → rural 0
    const shed = refreshShed(g, p);
    expect(shed.tilled.has(remote)).toBe(true); // the nucleus never starves
    expect(isFallow(shed, claim)).toBe(true); // its acreage does
  });
});
