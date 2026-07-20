import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { nextLadderRung } from "../src/core/execution/utils/SeedLadder";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * The seed ladder (restore-organic-growth, seed-ladder spec): a geometric
 * peak-population ladder banks founding pairs; placement is free and
 * seed-gated.
 */

const info = new PlayerInfo("climber", PlayerType.Human, null, "climber_id");
const richFill: LayersFill = (n) =>
  n === "temperature" ? Math.round(0.65 * 255) : 255;

async function game(): Promise<Game> {
  return setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    richFill,
  );
}

describe("the geometric ladder", () => {
  let g: Game;
  let p: Player;

  beforeEach(async () => {
    g = await game();
    p = g.player(info.id);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) p.conquer(g.ref(x, y));
    }
    g.addExecution(new PlayerExecution(p));
    g.executeNextTick();
    g.executeNextTick();
  });

  test("rungs double: 4k, 8k, 16k", () => {
    const f = g.config().food();
    expect(nextLadderRung(f, 0)).toBe(4000);
    expect(nextLadderRung(f, 1)).toBe(8000);
    expect(nextLadderRung(f, 2)).toBe(16000);
  });

  test("crossing a rung banks exactly one pair; dips never re-award", () => {
    // Start pop 2000 < 4000: nothing banked yet.
    expect(p.farmSeeds()).toBe(0);
    expect(p.settlementSeeds()).toBe(0);
    expect(p.nextSeedRung()).toBe(4000);

    p.addTroops(2500); // peak 4500 crosses rung 1
    g.executeNextTick();
    expect(p.farmSeeds()).toBe(1);
    expect(p.settlementSeeds()).toBe(1);
    expect(p.nextSeedRung()).toBe(8000);

    // Dip far below and regrow past the same rung: no second award.
    p.removeTroops(4000);
    g.executeNextTick();
    p.addTroops(4000);
    g.executeNextTick();
    expect(p.farmSeeds()).toBe(1);

    // Cross rung 2.
    p.addTroops(4000); // ~8500 peak
    g.executeNextTick();
    expect(p.farmSeeds()).toBe(2);
    expect(p.settlementSeeds()).toBe(2);
    expect(p.nextSeedRung()).toBe(16000);
  });

  test("seeds gate placement; placing consumes one and charges no food", () => {
    // No seeds: rejected even on perfect ground.
    expect(p.canBuild(UnitType.Farmland, g.ref(20, 20))).toBe(false);
    p.addTroops(2500);
    g.executeNextTick(); // banks a pair
    const foodBefore = Number(p.food());
    expect(p.canBuild(UnitType.Farmland, g.ref(20, 20))).not.toBe(false);
    p.buildUnit(UnitType.Farmland, g.ref(20, 20), {});
    expect(p.farmSeeds()).toBe(0);
    expect(Number(p.food())).toBe(foodBefore); // free — seeds, not food
    expect(p.canBuild(UnitType.Farmland, g.ref(28, 28))).toBe(false);
  });
});
