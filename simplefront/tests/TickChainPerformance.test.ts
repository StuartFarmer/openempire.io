import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { CityDevelopmentState } from "../src/core/development/CityDevelopmentState";
import { GameImpl } from "../src/core/game/GameImpl";
import {
  canonicalJSON,
  sealTick,
  verifyTick,
} from "../src/core/sync/TickChain";
import { MAX_BLOCK_BYTES } from "../src/core/sync/TickChainProtocol";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("empty tick verification cannot call whole-state hashing or development snapshots", async () => {
  const hash = vi.spyOn(GameImpl.prototype, "hash").mockImplementation(() => {
    throw new Error("Unexpected state scan");
  });
  const snapshot = vi
    .spyOn(CityDevelopmentState.prototype, "deterministicState")
    .mockImplementation(() => {
      throw new Error("Unexpected development scan");
    });
  let cursor = { tick: -1, chainHash: "a".repeat(64) };
  const sizes: number[] = [];
  for (let i = 0; i < 100; i++) {
    const block = await sealTick(cursor, []);
    await verifyTick(cursor, block);
    sizes.push(canonicalJSON(block).length);
    cursor = { tick: block.tick, chainHash: block.chainHash };
  }
  expect(hash).not.toHaveBeenCalled();
  expect(snapshot).not.toHaveBeenCalled();
  // Only the extra digit in the tick counter adds a byte; no historical data.
  expect(sizes[99] - sizes[0]).toBe(1);
});

test("largest admitted action count seals and verifies inside the bounded envelope", async () => {
  const cursor = { tick: -1, chainHash: "a".repeat(64) };
  const block = await sealTick(
    cursor,
    Array.from({ length: 256 }, (_, tile) => ({
      type: "spawn" as const,
      tile,
      clientID: "human123",
    })),
  );
  await verifyTick(cursor, block);
  expect(new TextEncoder().encode(canonicalJSON(block)).length).toBeLessThan(
    MAX_BLOCK_BYTES,
  );
  await expect(
    sealTick(cursor, [...block.intents, block.intents[0]]),
  ).rejects.toThrow();
});
