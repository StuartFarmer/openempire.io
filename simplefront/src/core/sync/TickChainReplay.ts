import { createGameRunner, type GameRunner } from "../GameRunner";
import { SpawnTimerExecution } from "../execution/SpawnTimerExecution";
import type { GameMapLoader } from "../game/GameMapLoader";
import { GameUpdateType, type GameUpdateViewData } from "../game/GameUpdates";
import { canonicalJSON, hashGenesis } from "./TickChain";
import {
  MAX_HISTORY_BYTES,
  TickChainRecordSchema,
  type ChainCursor,
  type ChainHash,
  type StateCheckpoint,
  type TickChainRecord,
} from "./TickChainProtocol";
import { TickChainSession } from "./TickChainSession";
import { loadTickGenesis, orderedDevelopment } from "./TickGenesis";

export async function replayTickChain(
  input: TickChainRecord,
  targetTick: number,
  loader: GameMapLoader,
  simulationBuild: ChainHash,
  options: {
    stateHashEveryTicks: number;
    onProgress?: (cursor: ChainCursor) => void;
    onUpdate?: (update: GameUpdateViewData) => void;
    clientID?: string;
    signal?: AbortSignal;
  },
): Promise<{
  runner: GameRunner;
  session: TickChainSession;
  appliedThrough: ChainCursor;
  stateCheckpoints: StateCheckpoint[];
}> {
  const cancelled = () => {
    if (options.signal?.aborted) throw new Error("Tick replay cancelled");
  };
  cancelled();
  if (
    !Number.isSafeInteger(options.stateHashEveryTicks) ||
    options.stateHashEveryTicks < 0
  )
    throw new Error("Invalid state hash interval");
  const encoded = canonicalJSON(input);
  if (new TextEncoder().encode(encoded).byteLength > MAX_HISTORY_BYTES)
    throw new Error("Replay exceeds history limit");
  const record = JSON.parse(encoded) as TickChainRecord;
  TickChainRecordSchema.parse(record);
  if (
    !Number.isSafeInteger(targetTick) ||
    targetTick < -1 ||
    targetTick > record.appliedThrough.tick
  )
    throw new Error("Replay target exceeds applied history");
  if (record.genesis.simulationBuild !== simulationBuild)
    throw new Error("Incompatible simulation build");
  const { genesis, freshLoader } = await loadTickGenesis(
    record.genesis.gameStartInfo,
    orderedDevelopment(record.genesis),
    loader,
    simulationBuild,
    record.genesis.initialization,
  );
  if (
    canonicalJSON(genesis) !== canonicalJSON(record.genesis) ||
    (await hashGenesis(genesis)) !== record.genesisHash
  )
    throw new Error("Replay genesis or asset mismatch");
  const appliedHash =
    record.appliedThrough.tick === -1
      ? record.genesisHash
      : record.blocks[record.appliedThrough.tick]?.chainHash;
  if (appliedHash !== record.appliedThrough.chainHash)
    throw new Error("Invalid recorded applied cursor");
  const expected = new Map<number, StateCheckpoint>();
  let interval = options.stateHashEveryTicks;
  function gcd(a: number, b: number): number {
    while (b) [a, b] = [b, a % b];
    return a;
  }
  for (const checkpoint of record.stateCheckpoints) {
    if (expected.has(checkpoint.tick))
      throw new Error("Duplicate state checkpoint");
    expected.set(checkpoint.tick, checkpoint);
    if (checkpoint.tick <= targetTick)
      interval = gcd(interval, checkpoint.tick);
  }
  if (interval === 0 && expected.has(0)) interval = Number.MAX_SAFE_INTEGER;
  const stateCheckpoints: StateCheckpoint[] = [];
  let failure: Error | null = null;
  const runner = await createGameRunner(
    genesis.gameStartInfo,
    options.clientID,
    freshLoader(),
    (update) => {
      if ("errMsg" in update) {
        failure = new Error(update.errMsg);
        return;
      }
      for (const hash of update.updates[GameUpdateType.Hash]) {
        const saved = expected.get(hash.tick);
        if (saved && saved.stateHash !== hash.hash)
          failure = new Error(`State checkpoint mismatch at tick ${hash.tick}`);
        stateCheckpoints.push({
          tick: hash.tick,
          phase: "post-economy-pre-water-healing-v1",
          algorithm: "legacy-simplefront-state-v1",
          stateHash: hash.hash,
        });
      }
      options.onUpdate?.(update);
    },
    "simplefront",
    orderedDevelopment(genesis) ?? undefined,
    { stateHashEveryTicks: interval },
  );
  if (genesis.initialization === "ambient")
    runner.game.addExecution(new SpawnTimerExecution());
  const session = await TickChainSession.create(genesis, (block) => {
    if (runner.game.ticks() !== block.tick)
      throw new Error("Replay core tick mismatch");
    runner.addTurn({ turnNumber: block.tick, intents: block.intents });
    if (
      !runner.executeNextTick() ||
      runner.game.ticks() !== block.tick + 1 ||
      failure
    )
      throw failure ?? new Error("Replay core tick failed");
  });
  for (let tick = 0; tick <= targetTick; tick++) {
    cancelled();
    const block = record.blocks[tick];
    if (!block || block.tick !== tick)
      throw new Error(`Replay missing block ${tick}`);
    await session.receive(block);
    if ((tick + 1) % 4 === 0) {
      options.onProgress?.(session.appliedThrough());
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  cancelled();
  options.onProgress?.(session.appliedThrough());
  return {
    runner,
    session,
    appliedThrough: session.appliedThrough(),
    stateCheckpoints,
  };
}
