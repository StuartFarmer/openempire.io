import type { LiveGameRuntime } from "../LiveGameRuntime";

export async function createRuntime(): Promise<LiveGameRuntime> {
  return {
    async beforeTick(): Promise<void> {},
    dispose(): void {},
  };
}
