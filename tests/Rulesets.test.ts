import { describe, expect, test } from "vitest";
import { Config } from "../src/core/configuration/Config";
import { UnitType } from "../src/core/game/Game";
import {
  createRulesetConfig,
  DEFAULT_RULESET,
  isRulesetID,
  LeanFrontConfig,
  RULESET_IDS,
  type RulesetID,
} from "../src/core/game/Rulesets";

/**
 * The ruleset seam (src/core/game/Rulesets.ts).
 *
 * The important test here is the IDENTITY one. The seam ships with zero
 * divergence on purpose — rules change only through OpenSpec changes, so
 * inventing simplifications to make the seam look useful is exactly what the
 * boundary forbids. What the seam has to earn instead is TRUST: prove that
 * selecting `leanfront` today changes nothing, and the first specified
 * divergence has a green baseline to move off, with any hash difference
 * attributable to that change alone.
 */

describe("ruleset registry", () => {
  test("every declared id resolves to a Config", () => {
    const gameConfig = {
      gameMap: "Plains",
      gameMode: "FFA",
      gameType: "Singleplayer",
      difficulty: "Medium",
      nations: "default",
      donateGold: false,
      donateTroops: false,
      bots: 0,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    } as unknown as Parameters<typeof createRulesetConfig>[1];
    for (const id of RULESET_IDS) {
      const cfg = createRulesetConfig(id, gameConfig, null, false);
      expect(cfg).toBeInstanceOf(Config);
    }
    expect(
      createRulesetConfig("leanfront", gameConfig, null, false),
    ).toBeInstanceOf(LeanFrontConfig);
  });

  test("an unknown id throws rather than silently playing another game", () => {
    expect(() =>
      createRulesetConfig(
        "nonesuch" as RulesetID,
        {} as unknown as Parameters<typeof createRulesetConfig>[1],
        null,
        false,
      ),
    ).toThrow(/unknown ruleset/);
  });

  test("isRulesetID guards the wire", () => {
    expect(isRulesetID("openfront")).toBe(true);
    expect(isRulesetID("leanfront")).toBe(true);
    expect(isRulesetID("nonesuch")).toBe(false);
    expect(isRulesetID(undefined)).toBe(false);
    expect(isRulesetID(7)).toBe(false);
    expect(RULESET_IDS).toContain(DEFAULT_RULESET);
  });
});

describe("leanfront is currently identical to openfront", () => {
  const gameConfig = {
    gameMap: "Plains",
    gameMode: "FFA",
    gameType: "Singleplayer",
    difficulty: "Medium",
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 0,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  } as unknown as Parameters<typeof createRulesetConfig>[1];

  /**
   * The structural guard, and the one that matters. Asserting a 200-tick game
   * comes out the same would pass for a divergence that simply had not bitten
   * yet; this cannot. It fails the moment ANY override is added to
   * LeanFrontConfig — which is the point: that edit is a rule change, and it
   * should have to go and get an OpenSpec change before this test goes green
   * again.
   */
  test("LeanFrontConfig overrides nothing", () => {
    const own = Object.getOwnPropertyNames(LeanFrontConfig.prototype).filter(
      (n) => n !== "constructor",
    );
    expect(own).toEqual([]);
  });

  test("both rulesets expose identical knobs", () => {
    const open = createRulesetConfig("openfront", gameConfig, null, false);
    const lean = createRulesetConfig("leanfront", gameConfig, null, false);

    // The food block is the whole economy's knob surface.
    expect(lean.food()).toEqual(open.food());

    // Spot-check the config methods the sim reads most, including the ones a
    // "simplified" fork would be most tempted to touch first.
    expect(lean.isReplay()).toBe(open.isReplay());
    expect(lean.traitorDefenseDebuff()).toBe(open.traitorDefenseDebuff());
    // `cost` is a closure needing a live Game/Player, so compare the parts of
    // UnitInfo that are plain data — which is where a fork would retune first.
    for (const unit of [
      UnitType.Farmland,
      UnitType.Settlement,
      UnitType.City,
    ]) {
      const l = lean.unitInfo(unit);
      const o = open.unitInfo(unit);
      expect(l.costResource).toBe(o.costResource);
      expect(l.maxHealth).toBe(o.maxHealth);
    }
  });
});
