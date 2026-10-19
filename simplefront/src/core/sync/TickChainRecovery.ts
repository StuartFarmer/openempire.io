import { jsonBytes } from "./TickChain";
import {
  ChainCursorSchema,
  MAX_RANGE_BLOCKS,
  MAX_RANGE_BYTES,
  type ChainCursor,
  type TickBlock,
} from "./TickChainProtocol";
import type { TickChainSession } from "./TickChainSession";

/** Lifetime is one match, not one connection. Never reset this on reconnect. */
export class ChainRecoveryBudget {
  private episodes: number[] = [];
  private started: number | null = null;
  private rebuilt = false;
  begin(): void {
    this.check();
    if (this.started !== null) return;
    const now = Date.now();
    this.episodes = this.episodes.filter((time) => now - time < 60_000);
    if (this.episodes.length >= 2)
      throw new Error("Repeated synchronization failure; match stopped");
    this.episodes.push(now);
    this.started = now;
    this.rebuilt = false;
  }
  check(): void {
    if (this.started !== null && Date.now() - this.started >= 120_000)
      throw new Error("Synchronization recovery deadline exceeded");
  }
  startRebuild(): void {
    this.begin();
    if (this.rebuilt)
      throw new Error("Fresh replay already attempted; match stopped");
    this.rebuilt = true;
  }
  complete(): void {
    this.check();
    this.started = null;
  }
}

/** Only resume a still-trusted runner from its exact acknowledged cursor. */
export async function catchUpTickChain(
  session: TickChainSession,
  resume: ChainCursor,
  target: ChainCursor,
  fetchRange: (
    from: number,
    through: number,
    signal: AbortSignal,
  ) => Promise<TickBlock[]>,
  signal?: AbortSignal,
): Promise<void> {
  ChainCursorSchema.parse(target);
  if (target.tick < resume.tick)
    throw new Error("Authority head precedes applied cursor");
  session.confirmResume(resume);
  const deadline = Date.now() + 120_000;
  try {
    while (session.appliedThrough().tick < target.tick) {
      const from = session.appliedThrough().tick + 1;
      const through = Math.min(target.tick, from + MAX_RANGE_BLOCKS - 1);
      let page: TickBlock[] | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted || Date.now() >= deadline)
          throw new Error("Chain recovery cancelled or timed out");
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancel = () => controller.abort();
        signal?.addEventListener("abort", cancel, { once: true });
        let abort: (() => void) | undefined;
        try {
          const timeout = new Promise<never>((_, reject) => {
            abort = () =>
              reject(new Error("Range request cancelled or timed out"));
            controller.signal.addEventListener("abort", abort, { once: true });
            timer = setTimeout(cancel, Math.min(5_000, deadline - Date.now()));
          });
          const response = await Promise.race([
            fetchRange(from, through, controller.signal),
            timeout,
          ]);
          if (
            !Array.isArray(response) ||
            response.length === 0 ||
            response.length > MAX_RANGE_BLOCKS ||
            jsonBytes(response).byteLength > MAX_RANGE_BYTES
          )
            throw new Error("Invalid recovery page");
          // Snapshot before any digest await; transport buffers are not trusted storage.
          page = structuredClone(response);
          break;
        } catch (error) {
          if (signal?.aborted || attempt === 2) throw error;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          if (abort) controller.signal.removeEventListener("abort", abort);
          controller.abort();
        }
      }
      for (let index = 0; index < page!.length; index++) {
        if (signal?.aborted || Date.now() >= deadline)
          throw new Error("Chain recovery cancelled or timed out");
        const block = page![index];
        if (block.tick !== from + index || block.tick > through)
          throw new Error("Noncontiguous recovery page");
        await session.receive(block);
        if ((index + 1) % 4 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    const applied = session.appliedThrough();
    if (applied.tick !== target.tick || applied.chainHash !== target.chainHash)
      throw new Error("Recovered head does not match authority");
  } catch (error) {
    session.beginRecovery("chain-mismatch");
    throw error;
  }
}
