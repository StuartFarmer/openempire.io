/**
 * The Config half of the RULESET seam.
 *
 * The worker's sole ruleset is OpenFront. LeanFront is a standalone GPU field
 * game and does not create a core Config or worker runtime.
 *
 * Game rules diverge from vanilla only through an OpenSpec change with specs
 * and tests.
 *
 */
import { Config } from "../configuration/Config";
import type { GameConfig } from "../Schemas";
import { UserSettings } from "./UserSettings";

/** The worker games the shell can start. */
export type RulesetID = "openfront";

export const RULESET_IDS = ["openfront"] as const;

export const DEFAULT_RULESET: RulesetID = "openfront";

export function isRulesetID(value: unknown): value is RulesetID {
  return (
    typeof value === "string" &&
    (RULESET_IDS as readonly string[]).includes(value)
  );
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
    default: {
      const never: never = ruleset;
      throw new Error(`unknown ruleset: ${String(never)}`);
    }
  }
}
