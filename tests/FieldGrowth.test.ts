import { describe, expect, test } from "vitest";
import { farmTick } from "../src/core/execution/utils/FarmGrowth";
import {
  foodShedField,
  isFallow,
} from "../src/core/execution/utils/FoodShed";
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
 * Field growth — the farm CA (rework-settlement-ecology §1b). A Farmland is
 * a NUCLEUS: its field claims tiles as establishment (the farmMaturity
 * plane) crosses fieldClaimMilli. First claim holds between the two
 * automata: claimed field tiles are invisible to the city CA and refuse
 * plots; tiles merely establishing are wild and fair game.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const foeInfo = new PlayerInfo("raider", PlayerType.Human, null, "raider_id");

const goodClimate: LayersFill = (n) => (n === "temperature" ? 153 : 255);

/** Drive the field CA with a REAL shed, force-refreshed every 10 ticks
 *  (patch growth reads tilled output, cells, and residents from it). */
function runField(g: Game, p: Player, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const shed = foodShedField(g, p);
    if (i % 10 === 0) {
      shed.lastCalcTick = -1;
      foodShedField(g, p);
    }
    farmTick(g, p, foodShedField(g, p));
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

async function game(humans: PlayerInfo[] = [info]): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    humans,
    undefined,
    Fed,
    true,
    goodClimate,
  );
  return [g, g.player(info.id)];
}

describe("field-tile claims (task 5.1)", () => {
  test("a tile is claimed at fieldClaimMilli; below it is wild", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 6);
    const claim = g.config().food().fieldClaimMilli;
    const t = g.ref(2, 2);

    expect(p.isFieldTile(t)).toBe(false); // untouched ground
    p.setFarmMaturity(t, claim - 1);
    expect(p.isFieldTile(t)).toBe(false); // establishing = still wild
    p.setFarmMaturity(t, claim);
    expect(p.isFieldTile(t)).toBe(true); // claimed
    p.setFarmMaturity(t, claim - 50); // senesced back under
    expect(p.isFieldTile(t)).toBe(false); // reverted to wild
  });

  test("a Farmland nucleus is claimed even below the threshold", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 6);
    const nucleus = g.ref(3, 3);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 10); // freshly planted, far below claim
    expect(p.isFieldTile(nucleus)).toBe(true);
  });

  test("the city grows around claimed field tiles but takes establishing ones", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 10, 10, 40);
    const core = g.ref(30, 30);
    p.setCore(core);
    p.setDensity(core, g.config().food().popPerDensity);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    const farm = g.ref(33, 33);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);

    const claim = g.config().food().fieldClaimMilli;
    const claimed = g.ref(31, 30); // in the city's natural path
    p.setFarmMaturity(claimed, claim + 100);
    const establishing = g.ref(29, 30); // also in the path, but still wild
    p.setFarmMaturity(establishing, claim - 100);

    (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
      3_000_000;
    const supply = supplyField(g, p);
    for (let i = 0; i < 120; i++) growUrbanArea(g, p, supply);

    expect(p.urbanArea()).toBeGreaterThan(20); // the city did grow…
    expect(p.density(claimed)).toBe(0); // …never onto the claimed field tile
    expect(p.isFieldTile(claimed)).toBe(true); // the claim survives

    // The establishing tile was wild: urbanized, establishment wiped.
    expect(p.density(establishing)).toBeGreaterThan(0);
    expect(p.farmMaturity(establishing)).toBe(0);
  });

  test("claimed field tiles refuse plots; wild ground accepts them", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 8);
    const claim = g.config().food().fieldClaimMilli;
    const claimed = g.ref(2, 2);
    p.setFarmMaturity(claimed, claim);
    (
      p as Player & { _farmSeeds: number; _settlementSeeds: number }
    )._farmSeeds = 1;
    (p as Player & { _settlementSeeds: number })._settlementSeeds = 1;

    expect(p.canBuild(UnitType.Farmland, claimed)).toBe(false);
    expect(p.canBuild(UnitType.Settlement, claimed)).toBe(false);
    const wild = g.ref(5, 5);
    expect(p.canBuild(UnitType.Farmland, wild)).toBe(wild);
  });

  test("fields grow one tilled plot at a time, never into the desert", async () => {
    // Fertile for x < 20, bone-dry dead soil for x >= 20.
    const desertEdge: LayersFill = (n, x) => {
      if (n === "temperature") return 153;
      if (x >= 20 && (n === "crop" || n === "humidity" || n === "water"))
        return 0;
      return 255;
    };
    const g = await setup(
      "plains",
      { instantBuild: true },
      [info],
      undefined,
      Fed,
      true,
      desertEdge,
    );
    const p = g.player(info.id);
    conquerBlock(g, p, 10, 10, 20); // owns fertile AND desert ground
    p.setTroops(50_000); // plenty of spare hands — labor never gates here
    const nucleus = g.ref(17, 15);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);

    runField(g, p, 500);

    const claim = g.config().food().fieldClaimMilli;
    let claimed = 0;
    for (const [t, m] of p.farmMaturityEntries()) {
      if (m >= claim) {
        claimed++;
        expect(g.x(t)).toBeLessThan(20); // never a plot in the desert
      }
    }
    // Plots land one 1×1 tile at a time at a paced cadence — several by
    // now, but NOT a flooded circle.
    expect(claimed).toBeGreaterThanOrEqual(4);
    expect(claimed).toBeLessThanOrEqual(36);
  });

  test("plots favor the watered side of the frontier", async () => {
    // Same soil everywhere; y < 15 sits on groundwater, y >= 15 is dry.
    const riverSide: LayersFill = (n, _x, y) => {
      if (n === "temperature") return 153;
      if (n === "water") return y < 15 ? 255 : 0;
      return 255;
    };
    const g = await setup(
      "plains",
      { instantBuild: true },
      [info],
      undefined,
      Fed,
      true,
      riverSide,
    );
    const p = g.player(info.id);
    conquerBlock(g, p, 2, 2, 26);
    p.setTroops(100_000);
    const nucleus = g.ref(14, 15); // right on the boundary
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    // A claimed row ALONG the boundary, so the frontier offers the wet and
    // dry sides symmetrically — the lottery weight is what's under test.
    for (let x = 10; x <= 18; x++) {
      if (x !== 14) p.setFarmMaturity(g.ref(x, 15), 800);
    }

    // The preference shows in the ORDER plots land (eventually both sides
    // fill to the labor bound) — sample the first dozen.
    const claim = g.config().food().fieldClaimMilli;
    const count = () => {
      let wet = 0;
      let dry = 0;
      for (const [t, m] of p.farmMaturityEntries()) {
        if (m < claim || g.y(t) === 15) continue; // skip the seeded row
        if (g.y(t) < 15) wet++;
        else dry++;
      }
      return { wet, dry };
    };
    for (let i = 0; i < 800; i++) {
      const shed = foodShedField(g, p);
      if (i % 10 === 0) {
        shed.lastCalcTick = -1;
        foodShedField(g, p);
      }
      farmTick(g, p, foodShedField(g, p));
      const c = count();
      if (c.wet + c.dry >= 12) break;
    }
    const { wet, dry } = count();
    expect(wet + dry).toBeGreaterThanOrEqual(12);
    expect(wet).toBeGreaterThan(dry); // weighted toward the river, not exclusive
  });

  test("a riper, larger field readies its next plot sooner", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 20);
    p.setTroops(50_000);
    const nucleus = g.ref(10, 10);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);

    const claim = g.config().food().fieldClaimMilli;
    const countClaimed = () => {
      let n = 0;
      for (const [, m] of p.farmMaturityEntries()) if (m >= claim) n++;
      return n;
    };
    let firstPatchAt = -1;
    let secondPatchAt = -1;
    for (let i = 0; i < 600; i++) {
      const shed = foodShedField(g, p);
      if (i % 10 === 0) {
        shed.lastCalcTick = -1;
        foodShedField(g, p);
      }
      farmTick(g, p, foodShedField(g, p));
      const c = countClaimed();
      if (firstPatchAt < 0 && c >= 2) firstPatchAt = i;
      else if (firstPatchAt >= 0 && secondPatchAt < 0 && c >= 3) {
        secondPatchAt = i;
        break;
      }
    }
    expect(firstPatchAt).toBeGreaterThan(0);
    expect(secondPatchAt).toBeGreaterThan(firstPatchAt);
    // The grown field's output readies plot #2 faster than the lone
    // nucleus readied plot #1 — mutual aid as the credit stream.
    expect(secondPatchAt - firstPatchAt).toBeLessThan(firstPatchAt);
  });

  test("no spare hands, no new plots — the field waits for people", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 16);
    p.setTroops(100); // residents for half a tile — no surplus for a patch
    const nucleus = g.ref(8, 8);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);

    runField(g, p, 600);
    const claim = g.config().food().fieldClaimMilli;
    let claimed = 0;
    for (const [, m] of p.farmMaturityEntries()) if (m >= claim) claimed++;
    expect(claimed).toBe(1); // credit is banked and ready, but nobody to till

    p.setTroops(50_000); // the people arrive
    runField(g, p, 30);
    claimed = 0;
    for (const [, m] of p.farmMaturityEntries()) if (m >= claim) claimed++;
    expect(claimed).toBeGreaterThanOrEqual(2); // the held plot lands at once
  });

  test("plots never cover city tiles, foreign land, or scarred ground", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 12);
    p.setTroops(50_000);
    const nucleus = g.ref(5, 5);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    const city = g.ref(4, 5);
    p.setDensity(city, g.config().food().popPerDensity);
    const scarred = g.ref(6, 5);
    g.addTileDamage(scarred, 500);
    const foreign = g.ref(5, 4);
    p.relinquish(foreign);

    runField(g, p, 500);
    expect(p.farmMaturity(city)).toBe(0);
    expect(p.farmMaturity(scarred)).toBe(0);
    expect(p.farmMaturity(foreign)).toBe(0);
    let claimed = 0;
    const claim = g.config().food().fieldClaimMilli;
    for (const [, m] of p.farmMaturityEntries()) if (m >= claim) claimed++;
    expect(claimed).toBeGreaterThan(1); // it still found room elsewhere
  });

  test("conquest kills the claim with the maturity plane", async () => {
    const [g, p] = await game([info, foeInfo]);
    const foe = g.player(foeInfo.id);
    conquerBlock(g, p, 0, 0, 4);
    const t = g.ref(1, 1);
    p.setFarmMaturity(t, 900);
    expect(p.isFieldTile(t)).toBe(true);

    foe.conquer(t); // war razing zeroes the previous owner's maturity
    expect(p.farmMaturity(t)).toBe(0);
    expect(p.isFieldTile(t)).toBe(false);
    expect(foe.isFieldTile(t)).toBe(false); // captor starts from scratch
  });
});

describe("fallow dynamics (task 5.3/5.6)", () => {
  function setPopulation(p: Player, people: number): void {
    // Labor pools are IDLE-based (troops() — task 4.2).
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

  test("losing the farmers kills the field from the margins; the nucleus survives", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 10);
    const nucleus = g.ref(5, 5);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    const claims = [g.ref(6, 5), g.ref(7, 5), g.ref(5, 6)];
    for (const t of claims) p.setFarmMaturity(t, 800);

    setPopulation(p, 0); // everyone is gone
    const shed = refreshShed(g, p);
    for (const t of claims) expect(isFallow(shed, t)).toBe(true);

    for (let i = 0; i < 60; i++) farmTick(g, p, shed);
    for (const t of claims) {
      expect(p.isFieldTile(t)).toBe(false); // senesced below claim → wild
    }
    expect(p.isFieldTile(nucleus)).toBe(true); // the recovery seed survives
  });

  test("labor returning before reversion re-tills without re-establishing", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 0, 0, 10);
    const nucleus = g.ref(5, 5);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    const claim = g.ref(6, 5);
    p.setFarmMaturity(claim, 800);

    setPopulation(p, 0);
    let shed = refreshShed(g, p);
    for (let i = 0; i < 4; i++) farmTick(g, p, shed); // decays, stays claimed
    expect(p.isFieldTile(claim)).toBe(true);
    const dipped = p.farmMaturity(claim);
    expect(dipped).toBeLessThan(800);

    setPopulation(p, 2000); // the farmers come back
    shed = refreshShed(g, p);
    expect(shed.tilled.has(claim)).toBe(true); // re-tilled, not re-grown
    for (let i = 0; i < 20; i++) farmTick(g, p, shed);
    expect(p.farmMaturity(claim)).toBeGreaterThan(dipped); // ripening again
  });

  test("ground reverted by fallow dieback is claimable by the city", async () => {
    const [g, p] = await game();
    conquerBlock(g, p, 10, 10, 40);
    const core = g.ref(30, 30);
    p.setCore(core);
    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    const nucleus = g.ref(33, 30);
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    const contested = g.ref(31, 30); // between core and field
    p.setFarmMaturity(contested, 800); // claimed — the city must go around

    // Nobody anywhere (no city dwellers, no rural): the acreage dies.
    setPopulation(p, 0);
    const shed = refreshShed(g, p);
    for (let i = 0; i < 60; i++) farmTick(g, p, shed); // fallow → dies
    expect(p.isFieldTile(contested)).toBe(false);

    // Then the people arrive and the city takes the reverted ground.
    p.setDensity(core, g.config().food().popPerDensity);
    setPopulation(p, 3_000_000);
    const supply = supplyField(g, p);
    for (let i = 0; i < 120; i++) growUrbanArea(g, p, supply);
    expect(p.density(contested)).toBeGreaterThan(0); // the city moved in
  });
});
