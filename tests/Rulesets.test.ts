import { describe, expect, test } from "vitest";
import { Config } from "../src/core/configuration/Config";
import {
  createRulesetConfig,
  DEFAULT_RULESET,
  isRulesetID,
  RULESET_IDS,
  type RulesetID,
} from "../src/core/game/Rulesets";

describe("ruleset registry", () => {
  test("keeps only OpenFront as a worker ruleset", () => {
    expect(RULESET_IDS).toEqual(["openfront"]);
    expect(DEFAULT_RULESET).toBe("openfront");
    expect(isRulesetID("leanfront")).toBe(false);

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
    expect(
      createRulesetConfig("openfront", gameConfig, null, false),
    ).toBeInstanceOf(Config);
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
    expect(isRulesetID("leanfront")).toBe(false);
    expect(isRulesetID("nonesuch")).toBe(false);
    expect(isRulesetID(undefined)).toBe(false);
    expect(isRulesetID(7)).toBe(false);
    expect(RULESET_IDS).toContain(DEFAULT_RULESET);
  });
});
