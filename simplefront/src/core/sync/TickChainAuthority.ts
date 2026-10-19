import {
  ADMIN_BOT_CLIENT_ID,
  type Intent,
  type StampedIntent,
} from "../Schemas";
import {
  canonicalJSON,
  hashGenesis,
  jsonBytes,
  normalizeIntents,
  sealTick,
} from "./TickChain";
import {
  CHAIN_PROTOCOL,
  MAX_BLOCK_BYTES,
  MAX_BLOCK_INTENTS,
  MAX_HISTORY_BYTES,
  MAX_RANGE_BLOCKS,
  MAX_RANGE_BYTES,
  type ChainCursor,
  type StateCheckpoint,
  type TickBlock,
  type TickChainRecord,
  type TickGenesis,
} from "./TickChainProtocol";

type Command = { intent: StampedIntent; encoded: string; tick: number | null };

/** Trusted sequencer, not authentication: the transport supplies the sender ID. */
export class TickChainAuthority {
  private blocks: TickBlock[] = [];
  private commands = new Map<string, Map<number, Command>>();
  private pending: Command[] = [];
  private pendingBytes = 2;
  private retainedBytes: number;
  private queue: Promise<void> = Promise.resolve();
  private failure: unknown = null;

  private constructor(
    private genesis: TickGenesis,
    private genesisHash: string,
  ) {
    this.retainedBytes = jsonBytes(genesis).byteLength;
  }

  static async create(genesis: TickGenesis): Promise<TickChainAuthority> {
    const saved = JSON.parse(canonicalJSON(genesis));
    return new TickChainAuthority(saved, await hashGenesis(saved));
  }

  /** Local-shell recordings have a contiguous sequence per sender. This is NOT
   * a remote authority backup: remote receipt ledgers must be retained separately. */
  static async restoreLocal(
    record: TickChainRecord,
  ): Promise<TickChainAuthority> {
    const authority = await TickChainAuthority.create(record.genesis);
    if (authority.head().chainHash !== record.genesisHash)
      throw new Error("Invalid restored genesis");
    const sequences = new Map<string, number>();
    for (const block of record.blocks) {
      for (const intent of block.intents) {
        const sequence = sequences.get(intent.clientID) ?? 0;
        authority.submit(intent.clientID, sequence, intent);
        sequences.set(intent.clientID, sequence + 1);
      }
      const sealed = await authority.sealNext();
      if (canonicalJSON(sealed) !== canonicalJSON(block))
        throw new Error("Invalid restored block");
      if ((block.tick + 1) % 4 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return authority;
  }

  head(): ChainCursor {
    const last = this.blocks[this.blocks.length - 1];
    return last
      ? { tick: last.tick, chainHash: last.chainHash }
      : { tick: -1, chainHash: this.genesisHash };
  }

  submit(clientID: string, sequence: number, intent: Intent): void {
    if (this.failure) throw this.failure;
    if (
      clientID !== ADMIN_BOT_CLIENT_ID &&
      !this.genesis.gameStartInfo.players.some((p) => p.clientID === clientID)
    )
      throw new Error("Unknown command sender");
    if (!Number.isSafeInteger(sequence) || sequence < 0)
      throw new Error("Invalid command sequence");
    const normalized = normalizeIntents([{ ...intent, clientID }])[0];
    const encoded = canonicalJSON(normalized);
    const ledger = this.commands.get(clientID) ?? new Map<number, Command>();
    const previous = ledger.get(sequence);
    if (previous) {
      if (previous.encoded !== encoded)
        throw new Error("Conflicting command retry");
      return;
    }
    if (sequence !== ledger.size) throw new Error("Command sequence gap");
    const bytes = jsonBytes(normalized).byteLength + 1;
    if (
      this.pending.length >= MAX_BLOCK_INTENTS ||
      this.pendingBytes + bytes > MAX_BLOCK_BYTES - 256
    )
      throw new Error("Command admission limit");
    if (this.retainedBytes + bytes * 2 + 256 > MAX_HISTORY_BYTES)
      throw new Error("Chain history resource limit");
    const command = { intent: normalized, encoded, tick: null };
    ledger.set(sequence, command);
    this.commands.set(clientID, ledger);
    this.pending.push(command);
    this.pendingBytes += bytes;
    // Account for the retained command ledger as well as the block record.
    this.retainedBytes += bytes * 2 + 128;
  }

  receipt(clientID: string, sequence: number): number | null {
    return this.commands.get(clientID)?.get(sequence)?.tick ?? null;
  }

  sealNext(): Promise<TickBlock> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.retainedBytes + 256 > MAX_HISTORY_BYTES)
      return Promise.reject(new Error("Chain history resource limit"));
    this.retainedBytes += 256;
    const commands = this.pending;
    this.pending = [];
    this.pendingBytes = 2;
    const operation = this.queue.then(async () => {
      if (this.failure) throw this.failure;
      const block = await sealTick(
        this.head(),
        commands.map((c) => c.intent),
      );
      this.blocks.push(block);
      for (const command of commands) command.tick = block.tick;
      return JSON.parse(JSON.stringify(block)) as TickBlock;
    });
    this.queue = operation.then(
      () => {},
      (error) => {
        this.failure = error;
      },
    );
    return operation;
  }

  range(fromTick: number, throughTick: number): TickBlock[] {
    if (
      !Number.isSafeInteger(fromTick) ||
      !Number.isSafeInteger(throughTick) ||
      fromTick < 0 ||
      throughTick < fromTick ||
      throughTick >= this.blocks.length
    )
      throw new Error("Chain history unavailable");
    const result: TickBlock[] = [];
    let bytes = 2;
    for (
      let t = fromTick;
      t <= throughTick && result.length < MAX_RANGE_BLOCKS;
      t++
    ) {
      const block = this.blocks[t];
      const size = jsonBytes(block).byteLength + 1;
      if (bytes + size > MAX_RANGE_BYTES) break;
      result.push(block);
      bytes += size;
    }
    return JSON.parse(JSON.stringify(result));
  }

  record(
    appliedThrough: ChainCursor,
    stateCheckpoints: StateCheckpoint[] = [],
  ): TickChainRecord {
    const expected =
      appliedThrough.tick === -1
        ? this.genesisHash
        : this.blocks[appliedThrough.tick]?.chainHash;
    if (expected !== appliedThrough.chainHash)
      throw new Error("Applied cursor is not in this history");
    return JSON.parse(
      JSON.stringify({
        format: CHAIN_PROTOCOL,
        genesis: this.genesis,
        genesisHash: this.genesisHash,
        blocks: this.blocks,
        appliedThrough,
        stateCheckpoints,
      }),
    );
  }
}
