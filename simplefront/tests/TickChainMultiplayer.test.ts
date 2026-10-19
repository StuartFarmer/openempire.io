import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import {
  ChainClientMessageSchema,
  ChainServerMessageSchema,
} from "../src/core/sync/TickChainProtocol";
import { catchUpTickChain } from "../src/core/sync/TickChainRecovery";
import { TickChainSession } from "../src/core/sync/TickChainSession";
import { genesisFixture } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

// Library/wire-schema conformance only. Does not exercise legacy Transport or a remote server.
test("two clients agree after batched delivery, a gap, duplicate command retries and client-local failure", async () => {
  const genesis = genesisFixture();
  const authority = await TickChainAuthority.create(genesis);
  const seenA: number[] = [],
    seenB: number[] = [];
  const a = await TickChainSession.create(genesis, (b) => {
    seenA.push(b.tick);
  });
  const b = await TickChainSession.create(genesis, (b) => {
    seenB.push(b.tick);
  });
  const command = ChainClientMessageSchema.parse({
    type: "chain_intent",
    sequence: 0,
    intent: { type: "spawn", tile: 50 },
  });
  if (command.type !== "chain_intent") throw new Error("Unexpected command");
  authority.submit("human123", command.sequence, command.intent);
  authority.submit("human123", command.sequence, command.intent);
  for (let tick = 0; tick < 12; tick++) await authority.sealNext();
  const batch = ChainServerMessageSchema.parse({
    type: "chain_blocks",
    requestID: null,
    head: authority.head(),
    blocks: authority.range(0, 11),
  });
  if (batch.type !== "chain_blocks") throw new Error("Unexpected packet");
  for (const block of batch.blocks) await a.receive(block);
  await b.receive(batch.blocks[0]);
  await b.receive(batch.blocks[0]);
  await b.receive(batch.blocks[5]);
  await catchUpTickChain(
    b,
    b.appliedThrough(),
    batch.head,
    async (from, through) => authority.range(from, through),
  );
  expect(seenA).toEqual(seenB);
  expect(b.appliedThrough()).toEqual(a.appliedThrough());
  expect(batch.blocks.flatMap((block) => block.intents)).toHaveLength(1);
  const next = await authority.sealNext();
  await expect(
    b.receive({ ...next, chainHash: "f".repeat(64) }),
  ).rejects.toThrow();
  b.stop();
  await a.receive(next);
  expect(a.appliedThrough()).toEqual(authority.head());
  expect(b.appliedThrough().tick).toBe(11);
});
