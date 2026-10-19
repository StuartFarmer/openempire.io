import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { verifyTick } from "../src/core/sync/TickChain";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import { genesisFixture } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

test("authority seals empty ticks serially and returns immutable history", async () => {
  const authority = await TickChainAuthority.create(genesisFixture());
  const genesis = authority.head();
  const [first, second] = await Promise.all([
    authority.sealNext(),
    authority.sealNext(),
  ]);
  expect([first.tick, second.tick]).toEqual([0, 1]);
  await verifyTick(genesis, first);
  await verifyTick({ tick: first.tick, chainHash: first.chainHash }, second);
  const range = authority.range(0, 1);
  range[0].intents.push({ type: "spawn", tile: 9, clientID: "human123" });
  expect(authority.range(0, 0)[0].intents).toEqual([]);
});

test("sender-stamped FIFO commands are sealed once despite retries", async () => {
  const authority = await TickChainAuthority.create(genesisFixture());
  const first = { type: "spawn" as const, tile: 5050, clientID: "spoof123" };
  authority.submit("human123", 0, first);
  authority.submit("human123", 0, first);
  expect(authority.receipt("human123", 0)).toBeNull();
  const pending = authority.sealNext();
  authority.submit("human123", 1, { type: "spawn", tile: 5051 });
  first.tile = 9;
  const block = await pending;
  expect(block.intents).toEqual([
    { type: "spawn", tile: 5050, clientID: "human123" },
  ]);
  expect(authority.receipt("human123", 0)).toBe(0);
  authority.submit("human123", 0, { type: "spawn", tile: 5050 });
  expect((await authority.sealNext()).intents).toEqual([
    { type: "spawn", tile: 5051, clientID: "human123" },
  ]);
  expect(() =>
    authority.submit("human123", 0, { type: "spawn", tile: 999 }),
  ).toThrow();
});

test("admission rejects invalid identities, sequences, oversized blocks and unavailable history", async () => {
  const authority = await TickChainAuthority.create(genesisFixture());
  expect(() =>
    authority.submit("unknown1", 0, { type: "spawn", tile: 1 }),
  ).toThrow();
  expect(() =>
    authority.submit("human123", -1, { type: "spawn", tile: 1 }),
  ).toThrow();
  for (let n = 0; n < 256; n++)
    authority.submit("human123", n, { type: "spawn", tile: n });
  expect(() =>
    authority.submit("human123", 256, { type: "spawn", tile: 1 }),
  ).toThrow();
  await authority.sealNext();
  expect(authority.range(0, 0)[0].intents).toHaveLength(256);
  expect(() => authority.range(0, 1)).toThrow();
});
test("local restoration retains sealed commands and resumes at the next sequence", async () => {
  const source = await TickChainAuthority.create(genesisFixture());
  source.submit("human123", 0, { type: "spawn", tile: 10 });
  await source.sealNext();
  const restored = await TickChainAuthority.restoreLocal(
    source.record(source.head()),
  );
  expect(restored.head()).toEqual(source.head());
  restored.submit("human123", 0, { type: "spawn", tile: 10 });
  restored.submit("human123", 1, { type: "spawn", tile: 11 });
  expect((await restored.sealNext()).intents).toHaveLength(1);
});
