import type { Game } from "../../../core/game/Game";
import type { LiveGameRuntime } from "../LiveGameRuntime";
import {
  growSimplePlotsCpu,
  SimpleEconomy,
  type SimpleGrowthBatch,
} from "./economy/SimpleEconomy";
import { SimpleGpuGrowth } from "./economy/SimpleGpuGrowth";

export async function createRuntime(
  game: Game,
  economy?: SimpleEconomy,
): Promise<LiveGameRuntime> {
  const gpu = economy === undefined ? await SimpleGpuGrowth.create() : null;
  let useGpu = gpu !== null;
  const grow: SimpleGrowthBatch = async (records, config) => {
    if (!useGpu || gpu === null) return growSimplePlotsCpu(records, config);
    try {
      return await gpu.grow(records, config);
    } catch {
      useGpu = false;
      return growSimplePlotsCpu(records, config);
    }
  };
  const runtimeEconomy = economy ?? new SimpleEconomy(grow);
  runtimeEconomy.install();
  return {
    beforeTick: () => runtimeEconomy.prepare(game),
    afterTick: () => runtimeEconomy.afterTick(game),
    resolvePlotAction: (player, action, tile) =>
      runtimeEconomy.resolvePlotAction(game, player, action, tile),
    plotFrame: () => runtimeEconomy.plotFrame(),
    stats: (player) => runtimeEconomy.stats(player),
    dispose: () => {
      gpu?.dispose();
      runtimeEconomy.dispose();
    },
  };
}
