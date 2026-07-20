import { beforeEach, describe, expect, test } from "vitest";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { UseRealAttackLogic } from "./util/TestConfig";

/**
 * Continuous combat terrain (simplify-food-economy, combat-terrain spec):
 * slope (uphill-only magnitude delta) and wetness (humidity+water) replace
 * the Plains/Highland/Mountain bands in attackLogic. kSlope = kWet = 0
 * degrades to flat vanilla.
 */

const atkInfo = new PlayerInfo("atk", PlayerType.Human, null, "atk_id");
const defInfo = new PlayerInfo("def", PlayerType.Human, null, "def_id");

async function gameWith(fill: LayersFill): Promise<Game> {
  return setup(
    "plains",
    { instantBuild: true },
    [atkInfo, defInfo],
    undefined,
    UseRealAttackLogic,
    true,
    fill,
  );
}

const dryFill: LayersFill = (n) =>
  n === "humidity" || n === "water" ? 0 : 128;
const wetFill: LayersFill = (n) =>
  n === "humidity" || n === "water" ? 255 : 128;

/** Neutral-land per-tile loss for a human attacker at `target`. */
function neutralLoss(g: Game, attacker: Player, target: number): number {
  return g.config().attackLogic(g, 1000, attacker, g.terraNullius(), target)
    .attackerTroopLoss;
}

describe("wetness", () => {
  test("desert highway, rainforest quagmire", async () => {
    const dry = await gameWith(dryFill);
    const wet = await gameWith(wetFill);
    for (const [g] of [[dry], [wet]] as const) {
      const a = g.player(atkInfo.id);
      a.conquer(g.ref(10, 10)); // foothold beside the target, flat ground
    }
    const f = dry.config().food();
    const lossDry = neutralLoss(dry, dry.player(atkInfo.id), dry.ref(11, 10));
    const lossWet = neutralLoss(wet, wet.player(atkInfo.id), wet.ref(11, 10));
    expect(lossWet / lossDry).toBeCloseTo(1 + f.kWet, 5);

    const speedDry = dry
      .config()
      .attackLogic(
        dry,
        1000,
        dry.player(atkInfo.id),
        dry.terraNullius(),
        dry.ref(11, 10),
      ).tilesPerTickUsed;
    const speedWet = wet
      .config()
      .attackLogic(
        wet,
        1000,
        wet.player(atkInfo.id),
        wet.terraNullius(),
        wet.ref(11, 10),
      ).tilesPerTickUsed;
    // `tilesPerTickUsed` is a cost: wet tiles consume more of the budget.
    expect(speedWet).toBeGreaterThan(speedDry);
  });
});

describe("slope", () => {
  let game: Game;
  let attacker: Player;

  beforeEach(async () => {
    game = await gameWith(dryFill);
    attacker = game.player(atkInfo.id);
  });

  test("high ground defends itself: uphill costs more, downhill is base rate", () => {
    const map = game.map();
    const low = game.ref(10, 10);
    const highTarget = game.ref(11, 10);
    attacker.conquer(low);
    map.setMagnitude(low, 2);
    map.setMagnitude(highTarget, 27); // a cliff

    const f = game.config().food();
    // Slope input = absolute altitude + climb (restore-organic-growth).
    const upSlope = 27 / 31 + (27 - 2) / 31;
    const flatSlope = 2 / 31;
    const uphill = neutralLoss(game, attacker, highTarget);
    // Flat reference on the same wetness.
    const flatFrom = game.ref(20, 20);
    const flatTo = game.ref(21, 20);
    attacker.conquer(flatFrom);
    map.setMagnitude(flatFrom, 2);
    map.setMagnitude(flatTo, 2);
    const flat = neutralLoss(game, attacker, flatTo);
    expect(uphill / flat).toBeCloseTo(
      (1 + f.kSlope * upSlope) / (1 + f.kSlope * flatSlope),
      5,
    );

    // Downhill onto low ground: only the absolute term remains — the same
    // cost as taking that ground from the flat (no climb surcharge).
    attacker.conquer(highTarget);
    map.setMagnitude(game.ref(12, 10), 2);
    const downhill = neutralLoss(game, attacker, game.ref(12, 10));
    expect(downhill / flat).toBeCloseTo(1, 5);
  });

  test("kSlope = kWet = 0 degrades to flat vanilla at base mag", () => {
    game.config().setFoodOverride("kSlope", 0);
    game.config().setFoodOverride("kWet", 0);
    const map = game.map();
    const low = game.ref(10, 10);
    const high = game.ref(11, 10);
    attacker.conquer(low);
    map.setMagnitude(low, 2);
    map.setMagnitude(high, 27);
    const f = game.config().food();
    // Human neutral toll is mag/5, terrain-independent at zero knobs.
    expect(neutralLoss(game, attacker, high)).toBeCloseTo(
      f.baseCombatMag / 5,
      5,
    );
  });
});
