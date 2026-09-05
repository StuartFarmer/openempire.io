import type { Game } from "../../../core/game/Game";
import type { LiveGameRuntime } from "../LiveGameRuntime";

export async function createRuntime(_game: Game): Promise<LiveGameRuntime> {
  return { beforeTick: async () => {}, dispose: () => {} };
}
