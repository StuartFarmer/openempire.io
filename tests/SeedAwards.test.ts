import { describe, expect, test } from "vitest";
import {
  seedAwardTick,
  settlementThreshold,
} from "../src/core/execution/utils/SeedAwards";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

/**
 * Seed awards (rework-settlement-ecology): plots are awarded, never
 * purchased. Farm seeds ratchet from peak territory; Settlement seeds from
 * peak population up the measured power-law ladder (n^scalingExponent, the
 * empirically fitted area↔perimeter exponent). Placement spends a banked
 * seed and costs no food.
 */

const info = new PlayerInfo("chief", PlayerType.Human, null, "chief_id");

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
  return [g, g.player(info.id)];
}

function setPopulation(p: Player, people: number): void {
  (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
    people;
}

describe("the award ledgers", () => {
  test("farm seeds ratchet from peak territory; losing land never revokes", async () => {
    const [g, p] = await game();
    const perSeed = g.config().food().farmSeedTilesPerSeed;

    // Conquer 3 seeds' worth of land.
    const w = 10;
    const rows = Math.ceil((perSeed * 3) / w);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < w; x++) p.conquer(g.ref(x, y));
    seedAwardTick(g, p);
    const awarded = p.farmSeeds();
    expect(awarded).toBe(Math.floor(p.numTilesOwned() / perSeed));
    expect(awarded).toBeGreaterThanOrEqual(3);

    // Lose most of it, then retake up to (not past) the high-water mark:
    // the ratchet awards nothing new.
    const lost: number[] = [];
    for (const t of Array.from(p.tiles()).slice(0, perSeed * 2)) {
      lost.push(t);
      p.relinquish(t);
    }
    seedAwardTick(g, p);
    expect(p.farmSeeds()).toBe(awarded); // nothing revoked
    for (const t of lost) p.conquer(t);
    seedAwardTick(g, p);
    expect(p.farmSeeds()).toBe(awarded); // nothing re-awarded
  });

  test("settlement seeds climb the measured n^k ladder from peak population", async () => {
    const [g, p] = await game();
    const f = g.config().food();

    // The ladder is the measured power law, not a flat step.
    expect(settlementThreshold(g, 1)).toBe(f.settlementLadderBasePop);
    const t2 = settlementThreshold(g, 2);
    const t3 = settlementThreshold(g, 3);
    expect(t2).toBeGreaterThan(2 * f.settlementLadderBasePop * 0.9); // superlinear
    expect(t3 - t2).toBeGreaterThan(t2 - settlementThreshold(g, 1) - 1); // widening

    // Peak population crossing thresholds awards; famine doesn't revoke.
    setPopulation(p, settlementThreshold(g, 2) + 1);
    seedAwardTick(g, p);
    expect(p.settlementSeeds()).toBe(2);
    setPopulation(p, 10); // collapse
    seedAwardTick(g, p);
    expect(p.settlementSeeds()).toBe(2); // fixed awards
    setPopulation(p, settlementThreshold(g, 2) + 1); // recover to old peak
    seedAwardTick(g, p);
    expect(p.settlementSeeds()).toBe(2); // ratchet: no double award
  });
});

describe("placement spends seeds, not food", () => {
  test("no banked seed, no placement; a seed unlocks it and is consumed", async () => {
    const [g, p] = await game();
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) p.conquer(g.ref(x, y));
    const tile = g.ref(2, 2);

    expect(p.farmSeeds()).toBe(0);
    expect(p.canBuild(UnitType.Farmland, tile)).toBe(false);

    (p as Player & { _farmSeeds: number })._farmSeeds = 1;
    expect(p.canBuild(UnitType.Farmland, tile)).toBe(tile);

    const foodBefore = p.food();
    p.buildUnit(UnitType.Farmland, tile, {});
    expect(p.farmSeeds()).toBe(0); // spent
    expect(p.food()).toBe(foodBefore); // free — food never pays for plots
    expect(p.canBuild(UnitType.Farmland, g.ref(3, 3))).toBe(false); // bank empty
  });

  test("settlements gate the same way", async () => {
    const [g, p] = await game();
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) p.conquer(g.ref(x, y));
    const tile = g.ref(1, 1);
    expect(p.canBuild(UnitType.Settlement, tile)).toBe(false);
    (p as Player & { _settlementSeeds: number })._settlementSeeds = 1;
    expect(p.canBuild(UnitType.Settlement, tile)).toBe(tile);
    p.buildUnit(UnitType.Settlement, tile, {});
    expect(p.settlementSeeds()).toBe(0);
  });
});
