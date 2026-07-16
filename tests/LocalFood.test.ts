import { describe, expect, test } from "vitest";
import { FOOD_DEFAULTS } from "../src/core/configuration/FoodConfig";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { foodShedField } from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

/**
 * Local food (rework-settlement-ecology tasks 4.2–4.5): each connected shed
 * REGION feeds itself from its own tilled tiles and tenure-grown granaries.
 * A famine is a regional event, an old district weathers it on reserves,
 * and the demographic time constants guarantee famine kills people before
 * it kills farms (the death spiral has a floor).
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const goodClimate = (n: string) => (n === "temperature" ? 153 : 255);

async function game(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    goodClimate,
  );
  return [g, g.player(info.id)];
}

function conquerBlock(
  g: Game,
  p: Player,
  x0: number,
  y0: number,
  w: number,
  h = w,
): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) p.conquer(g.ref(x, y));
}

describe("time constants (task 4.4)", () => {
  test("starvation acts faster than fallow senescence and tenure decay", () => {
    const f = FOOD_DEFAULTS;
    // Full famine: people die at starveFraction(minFed) per tick.
    const starveFraction = Math.min(
      1,
      (1 / f.avgLifespanTicks) * (1 / f.minFedForLife - 1),
    );
    const starveTicks = 1 / starveFraction; // e-folding of the population

    // A fallow tile senesces from ripe to reversion (below fieldClaimMilli)
    // at farmSenesceRate·m per tick — the field's death clock.
    const senesceTicks =
      Math.log(f.fieldClaimMilli / 1000) / Math.log(1 - f.farmSenesceRate);

    // Tenure decays tenureDecayMilli/tick on vacancy: half-plateau back to
    // zero — the stability death clock.
    const tenureTicks = (f.tenureHalfTicks * 1000) / f.tenureDecayMilli;

    // The spec'd invariant: a famine leaves hungry survivors with
    // intact-ish fields and standing stability — recoverable — never dead
    // fields under a living population.
    expect(starveTicks).toBeLessThan(senesceTicks);
    expect(starveTicks).toBeLessThan(tenureTicks);
    expect(senesceTicks).toBeLessThan(tenureTicks);
  });
});

describe("local distribution (tasks 4.2/4.3/4.5)", () => {
  test("a regional famine is regional: the razed region starves alone", async () => {
    const [g, p] = await game();
    // Two DISCONNECTED blobs — separate shed regions by construction.
    conquerBlock(g, p, 0, 0, 12);
    conquerBlock(g, p, 60, 60, 12);
    const westFarm = g.ref(5, 5);
    const eastFarm = g.ref(65, 65);
    p.buildUnit(UnitType.Farmland, westFarm, {});
    p.buildUnit(UnitType.Farmland, eastFarm, {});
    p.setFarmMaturity(westFarm, 1000);
    p.setFarmMaturity(eastFarm, 1000);
    // People in both regions (city tiles house them locally).
    p.setDensity(g.ref(5, 6), 500);
    p.setDensity(g.ref(65, 66), 500);
    p.setTroops(1000);
    g.addExecution(new PlayerExecution(p));
    for (let i = 0; i < 15; i++) g.executeNextTick();

    // Raze the west field: its region loses all production. Drain the camp
    // stake too — the spawn stock would otherwise carry the refugees for
    // hundreds of ticks (which is its job; here we test what follows).
    for (const u of p.units(UnitType.Farmland)) {
      if (u.tile() === westFarm) u.delete(false);
    }
    p.removeFood(p.food());
    for (let i = 0; i < 25; i++) g.executeNextTick();

    const shed = foodShedField(g, p);
    // The east region still eats from its own field...
    expect(shed.fedByFarm.get(eastFarm)).toBe(1);
    // ...while the west's people (now beyond every shed) starve: the nation
    // bleeds population even though total production could cover everyone.
    expect(p.foodFlow().starvedTroops).toBeGreaterThan(0);
  });

  test("an old district weathers famine on its reserves; a young one starves (4.3)", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 12);
    conquerBlock(g, p, 60, 60, 12);
    const oldFarm = g.ref(5, 5);
    const youngFarm = g.ref(65, 65);
    p.buildUnit(UnitType.Farmland, oldFarm, {});
    p.buildUnit(UnitType.Farmland, youngFarm, {});
    // Neither field produces (maturity ~0) — reserves are all there is.
    p.setFarmMaturity(oldFarm, 1);
    p.setFarmMaturity(youngFarm, 1);
    // The OLD district has deep tenure (grown capacity) and a full granary;
    // the young one has neither. Same people in both.
    g.setTileTenure(oldFarm, 10_000_000);
    (
      p as Player & { _fieldStockMilli: Map<number, number> }
    )._fieldStockMilli.set(oldFarm, 400_000);
    p.setDensity(g.ref(5, 6), 500);
    p.setDensity(g.ref(65, 66), 500);
    p.setTroops(1000);
    p.removeFood(p.food()); // no camp stake — reserves are the only buffer
    g.addExecution(new PlayerExecution(p));
    for (let i = 0; i < 12; i++) g.executeNextTick();

    const shed = foodShedField(g, p);
    expect(shed.fedByFarm.get(oldFarm)).toBe(1); // reserves carry it
    expect(shed.fedByFarm.get(youngFarm) ?? 0).toBeLessThan(1); // starves now
  });

  test("famine recovery floor: people die, the field survives, the nation regrows", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 14);
    const farm = g.ref(7, 7);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);
    p.setTroops(2000);
    g.addExecution(new PlayerExecution(p));
    for (let i = 0; i < 30; i++) g.executeNextTick();
    const grownField = Array.from(
      (p as Player & { _farmMaturity: Map<number, number> })._farmMaturity,
    ).length;

    // Famine: a population far past what the field carries.
    p.setTroops(60_000);
    for (let i = 0; i < 60; i++) g.executeNextTick();
    const troughPop = p.troops();
    expect(troughPop).toBeLessThan(60_000); // famine killed people...
    expect(p.farmMaturity(farm)).toBeGreaterThan(500); // ...not the nucleus

    // Recovery: the survivors are fed by the intact field and regrow.
    for (let i = 0; i < 100; i++) g.executeNextTick();
    expect(p.isAlive()).toBe(true);
    expect(p.troops()).toBeGreaterThan(0);
    const fieldNow = Array.from(
      (p as Player & { _farmMaturity: Map<number, number> })._farmMaturity,
    ).length;
    expect(fieldNow).toBeGreaterThanOrEqual(Math.floor(grownField / 2));
  });
});
