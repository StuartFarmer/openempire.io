import type { Game } from "../../../core/game/Game";
import type { LiveGameRuntime } from "../LiveGameRuntime";
import { GpuEconomy } from "./economy/GpuEconomy";

export async function createRuntime(game: Game): Promise<LiveGameRuntime> {
  const economy = await GpuEconomy.create(game);
  if (economy === null) {
    console.warn("leanfront: no GPU economy available; using the CPU path");
    return {
      async beforeTick(): Promise<void> {},
      dispose(): void {},
    };
  }

  economy.install();
  console.log(`leanfront: GPU economy on ${economy.adapter}`);
  return {
    async beforeTick(): Promise<void> {
      await economy.dispatch(
        game,
        game.players().filter((player) => player.isAlive()),
      );
    },
    dispose(): void {
      economy.dispose();
    },
  };
}
