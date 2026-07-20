import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { farmProductionMilli } from "../src/core/execution/utils/FoodEconomy";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * Worked farm fields (restore-organic-growth, farm-growth spec): a field
 * grows tile-by-tile on the best-fertility frontier; the growth IS the
 * production ramp.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");
const richFill: LayersFill = (n) =>
  n === "temperature" ? Math.round(0.65 * 255) : 255;
/** Rich uniformly, but a north-south fertile stripe at x=20 (crop max)
 *  beside poorer soil — growth should hug the stripe. */
const stripeFill: LayersFill = (n, x) =>
  n === "crop"
    ? Math.abs(x - 20) <= 1
      ? 255
      : 90
    : n === "temperature"
      ? 166
      : 255;

async function gameWith(fill: LayersFill): Promise<Game> {
  return setup(
    "plains",
    { instantBuild: true },
    [info, rivalInfo],
    undefined,
    undefined,
    true,
    fill,
  );
}

function own(g: Game, p: Player, x0: number, y0: number, size: number): void {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) p.conquer(g.ref(x, y));
  }
}

describe("field growth", () => {
  let g: Game;
  let p: Player;

  beforeEach(async () => {
    g = await gameWith(richFill);
    p = g.player(info.id);
    own(g, p, 10, 10, 15);
    p.buildUnit(UnitType.Farmland, g.ref(17, 17), {});
    g.addExecution(new PlayerExecution(p));
    g.executeNextTick();
  });

  test("the field grows organically past the reference footprint (unbounded)", () => {
    g.executeNextTick();
    const early = p.fieldTiles(g.ref(17, 17)).size;
    const prodEarly = farmProductionMilli(g, p, g.ref(17, 17));
    expect(early).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 120; i++) g.executeNextTick();
    const mid = p.fieldTiles(g.ref(17, 17)).size;
    expect(mid).toBeGreaterThan(early);
    expect(mid).toBeGreaterThan(49); // already past the old 7×7 cap

    for (let i = 0; i < 400; i++) g.executeNextTick();
    // Fills the whole 15×15 owned block (225) — no square footprint bound.
    expect(p.fieldTiles(g.ref(17, 17)).size).toBe(225);
    // Production is per worked tile, so it climbs well past the reference amount.
    const f = g.config().food();
    const prod = farmProductionMilli(g, p, g.ref(17, 17));
    expect(prod).toBeGreaterThan(f.farmOutputMilli);
    expect(prod).toBeGreaterThan(prodEarly);
  });

  test("the field spreads over owned land, past the radius", () => {
    for (let i = 0; i < 300; i++) g.executeNextTick();
    const r = g.config().food().farmRadius;
    let beyond = 0;
    for (const t of p.fieldTiles(g.ref(17, 17))) {
      expect(g.owner(t)).toBe(p); // never grows onto unowned land
      if (Math.abs(g.x(t) - 17) > r || Math.abs(g.y(t) - 17) > r) beyond++;
    }
    expect(beyond).toBeGreaterThan(0); // grew past the old square bound
  });

  test("conquest evicts worked tiles and cuts production immediately", () => {
    for (let i = 0; i < 400; i++) g.executeNextTick();
    const beforeSize = p.fieldTiles(g.ref(17, 17)).size;
    const before = farmProductionMilli(g, p, g.ref(17, 17));
    const rival = g.player(rivalInfo.id);
    // Take a column of worked tiles.
    let taken = 0;
    for (let y = 14; y <= 20; y++) {
      const t = g.ref(14, y);
      if (p.isFieldTile(t)) {
        rival.conquer(t);
        taken++;
      }
    }
    expect(taken).toBeGreaterThan(0);
    expect(p.fieldTiles(g.ref(17, 17)).size).toBe(beforeSize - taken);
    expect(farmProductionMilli(g, p, g.ref(17, 17))).toBeLessThan(before);
  });

  test("a dead farm releases its whole field", () => {
    for (let i = 0; i < 200; i++) g.executeNextTick();
    const farm = p.units(UnitType.Farmland)[0];
    expect(p.fieldTiles(farm.tile()).size).toBeGreaterThan(3);
    farm.delete(false);
    expect(p.fieldTiles(farm.tile()).size).toBe(0);
    expect(farmProductionMilli(g, p, farm.tile())).toBe(0);
  });
});

describe("organic shape", () => {
  test("growth hugs the fertile stripe before the poor soil", async () => {
    const g = await gameWith(stripeFill);
    const p = g.player(info.id);
    own(g, p, 12, 10, 17);
    p.buildUnit(UnitType.Farmland, g.ref(20, 17), {}); // on the stripe
    g.addExecution(new PlayerExecution(p));
    g.executeNextTick();
    // Grow roughly a third of the field.
    for (let i = 0; i < 30; i++) g.executeNextTick();
    const tiles = [...p.fieldTiles(g.ref(20, 17))];
    expect(tiles.length).toBeGreaterThan(5);
    expect(tiles.length).toBeLessThan(90); // early — not yet spread to the flanks
    // The early field lives on the stripe (|x−20| ≤ 1), not the poor flanks.
    const onStripe = tiles.filter((t) => Math.abs(g.x(t) - 20) <= 1).length;
    expect(onStripe / tiles.length).toBeGreaterThan(0.8);
  });
});
