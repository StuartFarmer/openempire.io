import type { LiveGameRuntime } from "../LiveGameRuntime";

export async function createRuntime(): Promise<LiveGameRuntime> {
  return { beforeTick: async () => {}, dispose: () => {} };
}
