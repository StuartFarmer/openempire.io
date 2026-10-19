import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import { TickChainSession } from "../src/core/sync/TickChainSession";
import { genesisFixture } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

test("receiver verifies contiguous inputs and applies duplicates only once", async () => {
  const genesis = genesisFixture();
  const authority = await TickChainAuthority.create(genesis);
  const applied: number[] = [];
  const session = await TickChainSession.create(genesis, (b) => {
    applied.push(b.tick);
  });
  const first = await authority.sealNext(),
    second = await authority.sealNext();
  expect(await session.receive(second)).toBe("gap");
  expect(applied).toEqual([]);
  session.confirmResume(session.appliedThrough());
  await session.receive(first);
  await session.receive(second);
  expect(await session.receive(first)).toBe("duplicate");
  expect(applied).toEqual([0, 1]);
  expect(session.appliedThrough()).toEqual(authority.head());
});

test("tampering never executes and cannot be fixed by copying a remote cursor", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  const applied: number[] = [];
  const session = await TickChainSession.create(genesis, (b) => {
    applied.push(b.tick);
  });
  const block = await authority.sealNext();
  await expect(
    session.receive({ ...block, chainHash: "f".repeat(64) }),
  ).rejects.toThrow();
  expect(applied).toEqual([]);
  expect(() => session.confirmResume(authority.head())).toThrow();
  expect(session.appliedThrough().tick).toBe(-1);
});

test("failed execution leaves applied cursor unchanged and requires a new runner", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  let executions = 0;
  const session = await TickChainSession.create(genesis, () => {
    executions++;
    throw new Error("partial mutation");
  });
  const block = await authority.sealNext();
  await expect(session.receive(block)).rejects.toThrow("partial mutation");
  expect(session.verifiedThrough().tick).toBe(0);
  expect(session.appliedThrough().tick).toBe(-1);
  await expect(session.receive(block)).rejects.toThrow();
  expect(() => session.confirmResume(session.appliedThrough())).toThrow();
  expect(executions).toBe(1);
});

test("async receive is serialized and stopping invalidates pending work", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  const applied: number[] = [];
  const session = await TickChainSession.create(genesis, (b) => {
    applied.push(b.tick);
  });
  const a = await authority.sealNext(),
    b = await authority.sealNext();
  await Promise.all([session.receive(a), session.receive(b)]);
  expect(applied).toEqual([0, 1]);
  const c = await authority.sealNext();
  const receiving = session.receive(c);
  session.stop();
  await expect(receiving).rejects.toThrow();
  expect(applied).toEqual([0, 1]);
});
