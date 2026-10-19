import { webcrypto } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { TickChainAuthority } from "../src/core/sync/TickChainAuthority";
import {
  ChainRecoveryBudget,
  catchUpTickChain,
} from "../src/core/sync/TickChainRecovery";
import { TickChainSession } from "../src/core/sync/TickChainSession";
import { genesisFixture } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => vi.useRealTimers());

test("bounded catch-up requests missing history and does not invent or duplicate inputs", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  const applied: number[] = [];
  const session = await TickChainSession.create(genesis, (b) => {
    applied.push(b.tick);
  });
  for (let i = 0; i < 5; i++) await authority.sealNext();
  await session.receive(authority.range(0, 0)[0]);
  await session.receive(authority.range(3, 3)[0]);
  const requests: number[] = [];
  await catchUpTickChain(
    session,
    session.appliedThrough(),
    authority.head(),
    async (from, through) => {
      requests.push(from);
      return authority.range(from, through);
    },
  );
  expect(requests[0]).toBe(1);
  expect(applied).toEqual([0, 1, 2, 3, 4]);
  expect(session.appliedThrough()).toEqual(authority.head());
});

test("empty range replies exhaust three attempts instead of claiming recovery", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  await authority.sealNext();
  const session = await TickChainSession.create(genesis, () => {
    throw new Error("Must not execute");
  });
  session.beginRecovery("gap");
  let requests = 0;
  await expect(
    catchUpTickChain(
      session,
      session.appliedThrough(),
      authority.head(),
      async () => {
        requests++;
        return [];
      },
    ),
  ).rejects.toThrow();
  expect(requests).toBe(3);
  expect(session.appliedThrough().tick).toBe(-1);
});

test("a timed-out request is retried only three times and can be cancelled", async () => {
  const genesis = genesisFixture(),
    authority = await TickChainAuthority.create(genesis);
  await authority.sealNext();
  const session = await TickChainSession.create(genesis, () => {});
  session.beginRecovery("gap");
  vi.useFakeTimers();
  let requests = 0;
  const pending = catchUpTickChain(
    session,
    session.appliedThrough(),
    authority.head(),
    async () => {
      requests++;
      return new Promise<never>(() => {});
    },
  );
  const outcome = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(15001);
  await outcome;
  expect(requests).toBe(3);
});

test("rebuild budget survives retries and repeated failures become terminal", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const budget = new ChainRecoveryBudget();
  budget.begin();
  budget.startRebuild();
  expect(() => budget.startRebuild()).toThrow();
  vi.advanceTimersByTime(120001);
  expect(() => budget.check()).toThrow();
  const episodes = new ChainRecoveryBudget();
  episodes.begin();
  episodes.complete();
  episodes.begin();
  episodes.complete();
  expect(() => episodes.begin()).toThrow();
});
