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
import { paintedAIConfig } from "../configuration/PaintedAIConfig";
import { PAINTED_DEFAULTS } from "../configuration/PaintedEconomyConfig";
import {
  DEFAULT_CONFIG,
  GAME_POPULATION_SCALE,
  validateConfig,
  type GrowthConfig,
} from "../development/CityDevelopmentConfig";
import type { GameConfig } from "../Schemas";
import { UnitInfo, UnitType } from "./Game";
import { UserSettings } from "./UserSettings";

/** The games the shell can start. */
export type RulesetID =
  | "openfront"
  | "simplefront"
  | "leanfront"
  | "leanfront-simple";

export const RULESET_IDS = [
  "openfront",
  "simplefront",
  "leanfront",
  "leanfront-simple",
] as const;

export const DEFAULT_RULESET: RulesetID = "simplefront";

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

/** SimpleFront starts with OpenFront's rules; simplify this config independently. */
export class SimpleFrontConfig extends Config {
  override paintedAI() {
    return paintedAIConfig(this.gameConfig().difficulty);
  }
  override paintedEconomy() {
    return PAINTED_DEFAULTS;
  }
}

/** Internal Stage 2 fixture. Deliberately absent from RulesetID/RULESET_IDS. */
export class SimpleFrontCityConfig extends SimpleFrontConfig {
  private readonly development: Readonly<GrowthConfig>;

  constructor(
    gameConfig: GameConfig,
    userSettings: UserSettings | null,
    isReplay: boolean,
    development: GrowthConfig = DEFAULT_CONFIG,
  ) {
    super(gameConfig, userSettings, isReplay);
    validateConfig(development);
    this.development =
      development === DEFAULT_CONFIG
        ? DEFAULT_CONFIG
        : Object.freeze({ ...development });
  }

  override paintedEconomy() {
    return { ...PAINTED_DEFAULTS, startingTroops: 80 * GAME_POPULATION_SCALE };
  }

  override cityDevelopment() {
    return this.development;
  }
}

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
  cityDevelopment?: GrowthConfig,
): Config {
  if (cityDevelopment !== undefined) {
    if (ruleset !== "simplefront")
      throw new Error("City development requires SimpleFront.");
    return new SimpleFrontCityConfig(
      gameConfig,
      userSettings,
      isReplay,
      cityDevelopment,
    );
  }
  switch (ruleset) {
    case "openfront":
      return new Config(gameConfig, userSettings, isReplay);
    case "simplefront":
      return new SimpleFrontConfig(gameConfig, userSettings, isReplay);
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
