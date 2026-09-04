import type { RulesetID } from "../../core/game/Rulesets";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import { leanfront } from "./leanfront/system";
import { openfront } from "./openfront/system";

export interface LiveGameDefinition {
  id: RulesetID;
  system: FieldSystem;
  view: string;
}

export const LIVE_GAMES: readonly LiveGameDefinition[] = [
  { id: "openfront", system: openfront, view: "openfront" },
  { id: "leanfront", system: leanfront, view: "leanfront" },
];

export function getLiveGame(id: string): LiveGameDefinition | undefined {
  return LIVE_GAMES.find((game) => game.id === id);
}
