import type { Game } from "../../core/game/Game";
import type { RulesetID } from "../../core/game/Rulesets";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import type { LiveGameRuntime } from "./LiveGameRuntime";
import { simplefront } from "./simplefront/system";

export interface LiveGameDefinition {
  id: RulesetID;
  system: FieldSystem;
  view: string;
  createRuntime(game: Game): Promise<LiveGameRuntime>;
}

export const LIVE_GAMES: readonly LiveGameDefinition[] = [
  {
    id: "simplefront",
    system: simplefront,
    view: "simplefront",
    createRuntime: async () =>
      (await import("./simplefront/runtime")).createRuntime(),
  },
];

export function getLiveGame(id: string): LiveGameDefinition | undefined {
  return LIVE_GAMES.find((game) => game.id === id);
}

export async function createLiveGameRuntime(
  id: RulesetID,
  game: Game,
): Promise<LiveGameRuntime> {
  const selected = getLiveGame(id);
  if (selected === undefined) throw new Error(`unknown live game: ${id}`);
  return selected.createRuntime(game);
}
