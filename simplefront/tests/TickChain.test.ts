import { createHash, webcrypto } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  canonicalJSON,
  hashGenesis,
  sealTick,
  verifyTick,
} from "../src/core/sync/TickChain";
import { genesisFixture } from "./util/TickChainFixture";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

const cursor = { tick: -1, chainHash: "0".repeat(64) };
const intents = [{ type: "spawn" as const, tile: 5050, clientID: "human123" }];

test("canonical bytes use lexical keys, preserved arrays and JSON primitives", () => {
  expect(canonicalJSON({ z: [2, 1], a: "Rio" })).toBe('{"a":"Rio","z":[2,1]}');
  expect(canonicalJSON({ "2": 2, "10": 10 })).toBe('{"10":10,"2":2}');
  expect(
    canonicalJSON({
      optional: undefined,
      negative: -0,
      text: 'é\n"',
      nullable: null,
      ratio: 0.25,
    }),
  ).toBe('{"negative":0,"nullable":null,"ratio":0.25,"text":"é\\n\\\""}');
  expect(canonicalJSON({ b: 2, a: 1 })).toBe(canonicalJSON({ a: 1, b: 2 }));
});

test.each([
  NaN,
  Infinity,
  undefined,
  new Date(),
  new Map(),
  [undefined],
  new Array(1),
  1n,
])("rejects non-JSON values", (value) => {
  expect(() => canonicalJSON(value)).toThrow();
});

test("cycles and overdeep inputs fail without recursing indefinitely", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(() => canonicalJSON(cycle)).toThrow();
  let value: unknown = 0;
  for (let i = 0; i < 34; i++) value = [value];
  expect(() => canonicalJSON(value)).toThrow();
});

test("empty block matches an independently encoded Node SHA-256 vector", async () => {
  const block = await sealTick(cursor, []);
  const bytes = '["simplefront/tick/v1","' + cursor.chainHash + '",0,[]]';
  expect(block).toEqual({
    tick: 0,
    previousHash: cursor.chainHash,
    intents: [],
    chainHash: createHash("sha256").update(bytes).digest("hex"),
  });
  await expect(verifyTick(cursor, block)).resolves.toBeUndefined();
  const next = await sealTick({ tick: 0, chainHash: block.chainHash }, []);
  expect(next.chainHash).not.toBe(block.chainHash);
});

test("tick, prior digest, action and sender tampering are rejected", async () => {
  const block = await sealTick(cursor, intents);
  for (const changed of [
    { ...block, tick: 1 },
    { ...block, previousHash: "f".repeat(64) },
    { ...block, intents: [{ ...intents[0], tile: 5051 }] },
    { ...block, intents: [{ ...intents[0], clientID: "other123" }] },
    { ...block, unexpected: true },
  ])
    await expect(verifyTick(cursor, changed)).rejects.toThrow();
});

test("action order matters and sealed inputs cannot mutate during async hashing", async () => {
  const input = [{ ...intents[0] }, { ...intents[0], tile: 5051 }];
  const pending = sealTick(cursor, input);
  input[0].tile = 999;
  const block = await pending;
  expect(block.intents[0]).toEqual(intents[0]);
  expect(
    (await sealTick(cursor, [...block.intents].reverse())).chainHash,
  ).not.toBe(block.chainHash);
});

test("malformed counters, digests, actions and oversized payloads fail", async () => {
  for (const tick of [-2, 0.5, Number.MAX_SAFE_INTEGER, NaN])
    await expect(sealTick({ ...cursor, tick }, [])).rejects.toThrow();
  await expect(sealTick({ ...cursor, chainHash: "bad" }, [])).rejects.toThrow();
  await expect(
    sealTick(cursor, [{ ...intents[0], tile: NaN }]),
  ).rejects.toThrow();
  await expect(
    sealTick(
      cursor,
      Array.from({ length: 257 }, () => intents[0]),
    ),
  ).rejects.toThrow();
  const oversized = [{ ...intents[0], extra: "x".repeat(70000) }];
  await expect(sealTick(cursor, oversized)).rejects.toThrow();
});

test("genesis binds build, original identity, configuration and assets", async () => {
  const genesis = genesisFixture();
  const digest = await hashGenesis(genesis);
  for (const changed of [
    { ...genesis, simulationBuild: "f".repeat(64) },
    {
      ...genesis,
      gameStartInfo: { ...genesis.gameStartInfo, gameID: "other123" },
    },
    { ...genesis, cityDevelopment: { ...genesis.cityDevelopment!, rate: 201 } },
    { ...genesis, assets: { ...genesis.assets, map: "e".repeat(64) } },
  ])
    expect(await hashGenesis(changed)).not.toBe(digest);
});
