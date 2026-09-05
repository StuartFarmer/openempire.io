/**
 * The Config half of the RULESET seam.
 *
 * The shell offers more than one playable game (`openfront`, `leanfront`), but
 * this file selects only the `Config` the core is built with. Live-game runtime
 * implementations are selected separately by `client/games/registry`: OpenFront
 * keeps the CPU economy, while LeanFront may install its GPU economy before a
 * worker tick.
 *
 * `leanfront` currently overrides no Config knobs, and `tests/Rulesets.test.ts`
 * pins that narrower identity. It does not establish full runtime or hash
 * identity.
 *
 * Game rules diverge from vanilla only through an OpenSpec change with specs
 * and tests.
 *
 * GPU providers implement those same rules behind LeanFront's runtime lifecycle;
 * they do not belong in this Config factory.
 */
import { Config, type SimplePlotEconomyConfig } from "../configuration/Config";
import type { GameConfig } from "../Schemas";
import { UnitInfo, UnitType } from "./Game";
import { UserSettings } from "./UserSettings";

/** The games the shell can start. */
export type RulesetID = "openfront" | "leanfront" | "leanfront-simple";

export const RULESET_IDS = [
  "openfront",
  "leanfront",
  "leanfront-simple",
] as const;

export const DEFAULT_RULESET: RulesetID = "openfront";

export function isRulesetID(value: unknown): value is RulesetID {
  return (
    typeof value === "string" &&
    (RULESET_IDS as readonly string[]).includes(value)
  );
}

/**
 * LeanFront's rules.
 *
 * Empty ON PURPOSE — see the file header. Every override added here is a rule
 * change and needs an OpenSpec change behind it; implementation differences
 * such as the LeanFront GPU runtime stay outside this Config.
 */
export class LeanFrontConfig extends Config {}

const SIMPLE_PLOTS: SimplePlotEconomyConfig = {
  capacityPerLevel: 20_000,
  seedFraction: 0.1,
  cityGrowthRate: 0.03,
  farmGrowthRate: 0.06,
  cityLevelCost: 4_000n,
  farmLevelCost: 3_000n,
  razeCost: 1_000n,
  attackMilliPerPerson: 40n,
};

/** LeanFront Simple's compact, plot-based economy. */
export class LeanFrontSimpleConfig extends Config {
  override simplePlotEconomy(): SimplePlotEconomyConfig {
    return SIMPLE_PLOTS;
  }

  override unitInfo(type: UnitType): UnitInfo {
    if (type === UnitType.Settlement) {
      return {
        cost: () => SIMPLE_PLOTS.cityLevelCost,
        costResource: "food",
        constructionDuration: 0,
        upgradable: true,
      };
    }
    if (type === UnitType.Farmland) {
      return {
        cost: () => SIMPLE_PLOTS.farmLevelCost,
        costResource: "food",
        constructionDuration: 0,
        upgradable: true,
      };
    }
    return super.unitInfo(type);
  }
}

/** Build the `Config` for a ruleset. Unknown ids throw rather than silently
 *  falling back — a typo'd ruleset should not quietly play a different game. */
export function createRulesetConfig(
  ruleset: RulesetID,
  gameConfig: GameConfig,
  userSettings: UserSettings | null,
  isReplay: boolean,
): Config {
  switch (ruleset) {
    case "openfront":
      return new Config(gameConfig, userSettings, isReplay);
    case "leanfront":
      return new LeanFrontConfig(gameConfig, userSettings, isReplay);
    case "leanfront-simple":
      return new LeanFrontSimpleConfig(gameConfig, userSettings, isReplay);
    default: {
      const never: never = ruleset;
      throw new Error(`unknown ruleset: ${String(never)}`);
    }
  }
}
