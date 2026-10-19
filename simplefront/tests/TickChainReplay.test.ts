import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { GameImpl } from "../src/core/game/GameImpl";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { createGameRunner } from "../src/core/GameRunner";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import type { StateCheckpoint } from "../src/core/sync/TickChainProtocol";
import { replayTickChain } from "../src/core/sync/TickChainReplay";
import { TickChainSession } from "../src/core/sync/TickChainSession";
import { loadTickGenesis } from "../src/core/sync/TickGenesis";
import { chainLoader, chainStart } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

async function recordedMatch(count = 120) {
  const start = chainStart();
  start.config.bots = 2;
  const { genesis, freshLoader } = await loadTickGenesis(
    start,
    DEFAULT_CONFIG,
    chainLoader(),
    "1".repeat(64),
    "normal",
  );
  const authority = await TickChainAuthority.create(genesis);
  const stateCheckpoints: StateCheckpoint[] = [];
  const runner = await createGameRunner(
    start,
    "human123",
    freshLoader(),
    (update) => {
      if ("errMsg" in update) throw new Error(update.errMsg);
      stateCheckpoints.push(
        ...update.updates[GameUpdateType.Hash].map((hash) => ({
          tick: hash.tick,
          phase: "post-economy-pre-water-healing-v1" as const,
          algorithm: "legacy-simplefront-state-v1" as const,
          stateHash: hash.hash,
        })),
      );
    },
    "simplefront",
    DEFAULT_CONFIG,
    { stateHashEveryTicks: 30 },
  );
  const session = await TickChainSession.create(genesis, (block) => {
    runner.addTurn({ turnNumber: block.tick, intents: block.intents });
    if (!runner.executeNextTick()) throw new Error("Core did not execute");
  });
  authority.submit("human123", 0, {
    type: "spawn",
    tile: runner.game.ref(50, 50),
  });
  for (let i = 0; i < count; i++)
    await session.receive(await authority.sealNext());
  await authority.sealNext(); // sealed-but-unapplied tail must not change replay target
  return {
    record: authority.record(session.appliedThrough(), stateCheckpoints),
    runner,
    freshLoader,
  };
}

test("fresh replay reproduces the real core, AI and historical state checkpoints", async () => {
  const live = await recordedMatch();
  expect(live.record.genesis.cityDevelopmentOrder).toEqual(
    Object.keys(live.runner.game.config().cityDevelopment()!),
  );
  const replay = await replayTickChain(
    live.record,
    119,
    live.freshLoader(),
    "1".repeat(64),
    { stateHashEveryTicks: 30 },
  );
  expect(replay.appliedThrough).toEqual(live.record.appliedThrough);
  expect(replay.runner.game.ticks()).toBe(120);
  const a = live.runner.game as GameImpl,
    b = replay.runner.game as GameImpl;
  expect(b.cityDevelopment!.deterministicState()).toEqual(
    a.cityDevelopment!.deterministicState(),
  );
  expect(b.hash()).toBe(a.hash());
  expect(
    b
      .allPlayers()
      .map((p) => [p.id(), p.troops(), p.foodMilli(), p.numTilesOwned()]),
  ).toEqual(
    a
      .allPlayers()
      .map((p) => [p.id(), p.troops(), p.foodMilli(), p.numTilesOwned()]),
  );
  for (let t = 0; t < a.width() * a.height(); t++) {
    expect(b.ownerID(t)).toBe(a.ownerID(t));
    expect(b.tileDamage(t)).toBe(a.tileDamage(t));
  }
  expect(replay.stateCheckpoints).toEqual(live.record.stateCheckpoints);
});

test("replay rejects tampered inputs, mismatched build, bad checkpoints and cancellation", async () => {
  const live = await recordedMatch(20);
  const replay = (
    record = live.record,
    build = "1".repeat(64),
    signal?: AbortSignal,
  ) =>
    replayTickChain(record, 19, live.freshLoader(), build, {
      stateHashEveryTicks: 30,
      signal,
    });
  await expect(replay(live.record, "2".repeat(64))).rejects.toThrow();
  const tampered = structuredClone(live.record);
  tampered.blocks[3].chainHash = "f".repeat(64);
  await expect(replay(tampered)).rejects.toThrow();
  const missing = structuredClone(live.record);
  missing.blocks.splice(3, 1);
  await expect(replay(missing)).rejects.toThrow();
  const badState = structuredClone(live.record);
  badState.stateCheckpoints[0].stateHash += 1000;
  await expect(replay(badState)).rejects.toThrow("State checkpoint mismatch");
  const abort = new AbortController();
  abort.abort();
  await expect(
    replay(live.record, "1".repeat(64), abort.signal),
  ).rejects.toThrow();
  await expect(
    replayTickChain(live.record, 20, live.freshLoader(), "1".repeat(64), {
      stateHashEveryTicks: 0,
    }),
  ).rejects.toThrow();
});

test("genesis can explicitly preserve disabled city development", async () => {
  const loaded = await loadTickGenesis(
    chainStart(),
    null,
    chainLoader(),
    "1".repeat(64),
    "normal",
  );
  const authority = await TickChainAuthority.create(loaded.genesis);
  const record = authority.record(authority.head());
  const replay = await replayTickChain(
    record,
    -1,
    loaded.freshLoader(),
    "1".repeat(64),
    { stateHashEveryTicks: 0 },
  );
  expect(replay.runner.game.config().cityDevelopment()).toBeNull();
  expect(replay.runner.game.ticks()).toBe(0);
});
