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
  economy = new SimpleEconomy(),
): Promise<LiveGameRuntime> {
  const gpu = await SimpleGpuGrowth.create();
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
  economy.install();
  return {
    beforeTick: () => economy.prepare(game, grow),
    resolvePlotAction: (player, action, tile) =>
      economy.resolvePlotAction(game, player, action, tile),
    plotFrame: () => economy.plotFrame(),
    stats: (player) => economy.stats(player),
    dispose: () => {
      gpu?.dispose();
      economy.dispose();
    },
  };
}
