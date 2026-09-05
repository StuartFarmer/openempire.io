import type { Game } from "../../core/game/Game";
import type { RulesetID } from "../../core/game/Rulesets";
import type { FieldSystem } from "../webgpu/FieldDynamics";
import type { LiveGameRuntime } from "./LiveGameRuntime";
import { leanfrontSimple } from "./leanfront-simple/system";
import { leanfront } from "./leanfront/system";
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
  {
    id: "leanfront",
    system: leanfront,
    view: "leanfront",
    createRuntime: async (game) =>
      (await import("./leanfront/runtime")).createRuntime(game),
  },
  {
    id: "leanfront-simple",
    system: leanfrontSimple,
    view: "leanfront-simple",
    createRuntime: async (game) =>
      (await import("./leanfront-simple/runtime")).createRuntime(game),
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
