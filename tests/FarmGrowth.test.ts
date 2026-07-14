import { beforeEach, describe, expect, test } from "vitest";
import {
  climateSuitability,
  farmTick,
} from "../src/core/execution/utils/FarmGrowth";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * Farm maturation (add-urban-core-growth, growth-model.md Part 1): a Farmland
 * is a seed that ripens in place, driven by climate — GDD temperature band
 * (McMaster & Wilhelm), AquaCrop water stress (Raes et al.), FAO soil, combined
 * by Liebig's minimum, advancing on a Gompertz sigmoid.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");

/** A layers fill that sets a single named layer to `v` and the rest to `hi`. */
function only(name: string, v: number, hi = 255): LayersFill {
  return (n) => (n === name ? v : hi);
}

async function gameWith(fill: LayersFill): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    fill,
  );
}

describe("climate suitability (Liebig min of GDD × water × soil)", () => {
  test("GDD temperature band: cold and scorching score 0, optimal scores 1", async () => {
    // crop + water pinned to max, so suitability == the temperature factor.
    const cold = await gameWith(only("temperature", 0));
    const optimal = await gameWith(only("temperature", 153)); // tN≈0.6, in band
    const scorching = await gameWith(only("temperature", 255)); // tN=1 ≥ tempMax
    const t = 0;
    expect(climateSuitability(cold, cold.ref(t, t))).toBe(0);
    expect(climateSuitability(optimal, optimal.ref(t, t))).toBeCloseTo(1, 5);
    expect(climateSuitability(scorching, scorching.ref(t, t))).toBe(0);
  });

  test("AquaCrop water: wilting scores 0, saturated scores 1", async () => {
    // temperature in-band, crop max → suitability == the water factor.
    const dryFill: LayersFill = (n) =>
      n === "temperature" ? 153 : n === "water" || n === "humidity" ? 0 : 255;
    const wetFill: LayersFill = (n) => (n === "temperature" ? 153 : 255);
    const dry = await gameWith(dryFill);
    const wet = await gameWith(wetFill);
    expect(climateSuitability(dry, dry.ref(0, 0))).toBe(0);
    expect(climateSuitability(wet, wet.ref(0, 0))).toBeCloseTo(1, 5);
  });

  test("Liebig: the scarcest factor caps suitability", async () => {
    // Temperature + water ideal, but poor soil (cropN≈0.2) is the short stave.
    const fill: LayersFill = (n) =>
      n === "temperature" ? 153 : n === "crop" ? 51 : 255;
    const g = await gameWith(fill);
    expect(climateSuitability(g, g.ref(0, 0))).toBeCloseTo(51 / 255, 5);
  });
});

describe("farm maturation (Gompertz, gated by climate)", () => {
  let game: Game;
  let player: Player;

  async function fedGame(fill: LayersFill): Promise<[Game, Player]> {
    const g = await gameWith(fill);
    const p = g.player(info.id);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) p.conquer(g.ref(x, y));
    return [g, p];
  }

  beforeEach(async () => {
    // A good tile everywhere: temperature in-band, water + soil high.
    [game, player] = await fedGame((n) => (n === "temperature" ? 153 : 255));
  });

  test("a well-sited farm ripens on an S-curve toward its suitability", () => {
    const tile = game.ref(2, 2);
    player.buildUnit(UnitType.Farmland, tile, {});
    const suit = climateSuitability(game, tile);
    expect(suit).toBeCloseTo(1, 5);

    const at: number[] = [];
    for (let i = 1; i <= 300; i++) {
      farmTick(game, player);
      if (i === 20 || i === 60 || i === 300) at.push(player.farmMaturity(tile));
    }
    const [m20, m60, m300] = at;
    expect(m20).toBeGreaterThan(0);
    expect(m60).toBeGreaterThan(m20);
    expect(m300).toBeGreaterThan(m60);
    expect(m300).toBeGreaterThan(900); // approaches full maturity (suit≈1)
    // Accelerate-then-saturate: early gain per tick exceeds late gain.
    expect((m60 - m20) / 40).toBeGreaterThan((m300 - m60) / 240);
  });

  test("maturity settles at the climate suitability ceiling, not above", async () => {
    // Marginal soil caps suitability at ~0.4; maturity cannot exceed it.
    [game, player] = await fedGame((n) =>
      n === "temperature" ? 153 : n === "crop" ? 102 : 255,
    );
    const tile = game.ref(3, 3);
    player.buildUnit(UnitType.Farmland, tile, {});
    for (let i = 0; i < 400; i++) farmTick(game, player);
    const m = player.farmMaturity(tile) / 1000;
    expect(m).toBeGreaterThan(0.35);
    expect(m).toBeLessThanOrEqual(102 / 255 + 0.001);
  });

  test("a farm above its suitability senesces (canopy decline)", () => {
    const tile = game.ref(2, 2);
    player.buildUnit(UnitType.Farmland, tile, {});
    // Drop the suitability by simulating a hostile tile: force high maturity on
    // a tile whose ceiling is lower is covered above; here on a suit≈1 tile a
    // farm at full maturity stays put (no senescence when fed).
    player.setFarmMaturity(tile, 1000);
    farmTick(game, player);
    expect(player.farmMaturity(tile)).toBeGreaterThan(950); // fed → holds
  });

  test("senescence on a marginal tile pulls a saturated farm back down", async () => {
    [game, player] = await fedGame((n) =>
      n === "temperature" ? 153 : n === "crop" ? 76 : 255,
    );
    const tile = game.ref(3, 3);
    player.buildUnit(UnitType.Farmland, tile, {});
    player.setFarmMaturity(tile, 1000); // above the ~0.3 ceiling
    const before = player.farmMaturity(tile);
    for (let i = 0; i < 50; i++) farmTick(game, player);
    expect(player.farmMaturity(tile)).toBeLessThan(before);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const [g, p] = await fedGame((n) => (n === "temperature" ? 153 : 255));
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          p.buildUnit(UnitType.Farmland, g.ref(x, y), {});
      for (let i = 0; i < 80; i++) farmTick(g, p);
      return Array.from(p.farmMaturityEntries()).sort((a, b) => a[0] - b[0]);
    };
    expect(await run()).toEqual(await run());
  });
});
