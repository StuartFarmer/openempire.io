/**
 * The RULESET seam.
 *
 * The shell offers more than one playable game (`openfront`, `leanfront`), but
 * until now the choice reached only the RENDERER — both picked the same WESL
 * view over the same simulation, so "LeanFront" was a colour scheme. This is the
 * one place a ruleset can change the simulation itself: it selects the `Config`
 * the game is built with, which is what owns every knob the sim reads.
 *
 * IMPORTANT — this seam deliberately ships with ZERO divergence. `leanfront`
 * resolves to a Config that overrides nothing, so the two rulesets are
 * bit-identical today (pinned by `tests/Rulesets.test.ts`). That is not an
 * oversight:
 *
 *   - CLAUDE.md's boundary is that game rules diverge from vanilla ONLY via an
 *     OpenSpec change with specs and tests. Inventing simplifications here to
 *     make the seam look useful would be exactly the ad-hoc rule change that
 *     boundary exists to prevent.
 *   - A seam whose identity case is proven is a seam you can trust. The first
 *     specified divergence then has a green baseline to move off, and any hash
 *     difference it causes is attributable to that change alone.
 *
 * So: build the plumbing, prove it changes nothing, and let the first real
 * LeanFront mechanic arrive as its own proposal.
 *
 * What this seam is NOT for: the GPU field providers
 * (`setSupplyProvider`/`setShedFloodProvider`). Those are an implementation of
 * the same rules, not a different ruleset, and they are measurably SLOWER in
 * the shipping shape — the per-tick round trip costs 18.7 ms against the CPU
 * floods' 15.5 ms even at total conquest on spqr (`tests/perf/balance/
 * FloodCost.ts`). They stay out of the shipping path until their consumers move
 * too.
 */
import { Config } from "../configuration/Config";
import type { GameConfig } from "../Schemas";
import { UserSettings } from "./UserSettings";

/** The games the shell can start. */
export type RulesetID = "openfront" | "leanfront";

export const RULESET_IDS = ["openfront", "leanfront"] as const;

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
 * change and needs an OpenSpec change behind it; this class exists so that
 * change has somewhere to land that is not a branch inside the sim.
 */
export class LeanFrontConfig extends Config {}

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
    default: {
      const never: never = ruleset;
      throw new Error(`unknown ruleset: ${String(never)}`);
    }
  }
}
