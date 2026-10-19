import { canonicalJSON, hashGenesis, jsonBytes, verifyTick } from "./TickChain";
import {
  MAX_BLOCK_BYTES,
  MAX_RANGE_BLOCKS,
  TickBlockSchema,
  type ChainCursor,
  type TickBlock,
  type TickGenesis,
} from "./TickChainProtocol";

export type ChainStatus = "running" | "recovering" | "rebuilding" | "stopped";
export type RecoveryReason =
  | "gap"
  | "chain-mismatch"
  | "execution-failed"
  | "state-mismatch";

/** Verification and execution are distinct cursors. No cursor can be set remotely. */
export class TickChainSession {
  private applied: ChainCursor;
  private verified: ChainCursor;
  private hashes = new Map<number, string>();
  private buffered = new Map<number, TickBlock>();
  private bufferedBytes = 0;
  private queuedBytes = 0;
  private queuedCount = 0;
  private queue: Promise<void> = Promise.resolve();
  private state: ChainStatus = "running";
  private trusted = true;
  private generation = 0;

  private constructor(
    genesisHash: string,
    private apply: (block: TickBlock) => void,
  ) {
    this.applied = { tick: -1, chainHash: genesisHash };
    this.verified = { ...this.applied };
    this.hashes.set(-1, genesisHash);
  }

  static async create(
    genesis: TickGenesis,
    apply: (block: TickBlock) => void,
  ): Promise<TickChainSession> {
    return new TickChainSession(await hashGenesis(genesis), apply);
  }
  appliedThrough(): ChainCursor {
    return { ...this.applied };
  }
  verifiedThrough(): ChainCursor {
    return { ...this.verified };
  }
  status(): ChainStatus {
    return this.state;
  }
  stop(): void {
    this.state = "stopped";
    this.generation++;
    this.buffered.clear();
    this.bufferedBytes = 0;
  }

  beginRecovery(reason: RecoveryReason): void {
    if (this.state === "stopped") return;
    if (reason === "execution-failed" || reason === "state-mismatch")
      this.trusted = false;
    this.state = this.trusted ? "recovering" : "rebuilding";
  }

  confirmResume(cursor: ChainCursor): void {
    if (
      !this.trusted ||
      this.state !== "recovering" ||
      cursor.tick !== this.applied.tick ||
      cursor.chainHash !== this.applied.chainHash
    )
      throw new Error("Cannot resume an untrusted cursor or runner");
    this.state = "running";
  }

  async receive(input: TickBlock): Promise<"applied" | "duplicate" | "gap"> {
    const encoded = canonicalJSON(input);
    const bytes = new TextEncoder().encode(encoded).byteLength;
    if (
      bytes > MAX_BLOCK_BYTES ||
      this.queuedBytes + this.bufferedBytes + bytes > 4 * 1024 * 1024 ||
      this.queuedCount + this.buffered.size >= MAX_RANGE_BLOCKS
    )
      throw new Error("Chain receiver backlog limit");
    const block = JSON.parse(encoded) as TickBlock;
    const parsed = TickBlockSchema.parse(block);
    if (canonicalJSON(parsed) !== encoded)
      throw new Error("Unsupported block fields");
    const generation = this.generation;
    this.queuedBytes += bytes;
    this.queuedCount++;
    const operation = this.queue.then(async () => {
      if (this.state !== "running" || generation !== this.generation)
        throw new Error("Chain receiver is not running");
      if (block.tick <= this.applied.tick) {
        try {
          await verifyTick(
            {
              tick: block.tick - 1,
              chainHash: this.hashes.get(block.tick - 1)!,
            },
            block,
          );
          if (this.hashes.get(block.tick) !== block.chainHash)
            throw new Error("Conflicting duplicate block");
        } catch (error) {
          this.beginRecovery("chain-mismatch");
          throw error;
        }
        if (generation !== this.generation)
          throw new Error("Chain receiver stopped");
        return "duplicate" as const;
      }
      if (block.tick !== this.applied.tick + 1) {
        const previous = this.buffered.get(block.tick);
        if (previous && canonicalJSON(previous) !== encoded) {
          this.beginRecovery("chain-mismatch");
          throw new Error("Conflicting future block");
        }
        if (!previous) {
          this.buffered.set(block.tick, block);
          this.bufferedBytes += bytes;
        }
        this.beginRecovery("gap");
        return "gap" as const;
      }
      await this.applyNext(block, generation);
      let count = 1;
      while (this.buffered.has(this.applied.tick + 1)) {
        const next = this.buffered.get(this.applied.tick + 1)!;
        await this.applyNext(next, generation);
        if (++count % 4 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      return "applied" as const;
    });
    this.queue = operation
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        this.queuedBytes -= bytes;
        this.queuedCount--;
      });
    return operation;
  }

  private async applyNext(block: TickBlock, generation: number): Promise<void> {
    try {
      await verifyTick(this.applied, block);
    } catch (error) {
      this.beginRecovery("chain-mismatch");
      throw error;
    }
    if (generation !== this.generation || this.state !== "running")
      throw new Error("Chain receiver stopped");
    this.verified = { tick: block.tick, chainHash: block.chainHash };
    try {
      this.apply(block);
    } catch (error) {
      this.beginRecovery("execution-failed");
      throw error;
    }
    this.applied = { ...this.verified };
    this.hashes.set(block.tick, block.chainHash);
    const buffered = this.buffered.get(block.tick);
    if (buffered) {
      this.bufferedBytes -= jsonBytes(buffered).byteLength;
      this.buffered.delete(block.tick);
    }
  }
}
