import type { Game } from "../../../core/game/Game";
import type { LiveGameRuntime } from "../LiveGameRuntime";
import { SimpleEconomy } from "./economy/SimpleEconomy";

export async function createRuntime(
  game: Game,
  economy = new SimpleEconomy(),
): Promise<LiveGameRuntime> {
  economy.install();
  return {
    beforeTick: () => economy.prepare(game),
    resolvePlotAction: (player, action, tile) =>
      economy.resolvePlotAction(game, player, action, tile),
    plotFrame: () => economy.plotFrame(),
    stats: (player) => economy.stats(player),
    dispose: () => economy.dispose(),
  };
}
