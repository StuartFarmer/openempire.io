import type { Game } from "../../core/game/Game";
import type { RulesetID } from "../../core/game/Rulesets";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import type { LiveGameRuntime } from "./LiveGameRuntime";
import { openfront } from "./openfront/system";

export interface LiveGameDefinition {
  id: RulesetID;
  system: FieldSystem;
  view: string;
  createRuntime(game: Game): Promise<LiveGameRuntime>;
}

export const LIVE_GAMES: readonly LiveGameDefinition[] = [
  {
    id: "openfront",
    system: openfront,
    view: "openfront",
    createRuntime: async () =>
      (await import("./openfront/runtime")).createRuntime(),
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
