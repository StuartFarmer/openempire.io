import { StampedIntentSchema, type StampedIntent } from "../Schemas";
import {
  ChainCursorSchema,
  MAX_BLOCK_BYTES,
  MAX_BLOCK_INTENTS,
  TickBlockSchema,
  TickGenesisSchema,
  type ChainCursor,
  type ChainHash,
  type TickBlock,
  type TickGenesis,
} from "./TickChainProtocol";

const encoder = new TextEncoder();

/** Versioned protocol encoding, not a replacement for gameplay serialization. */
export function canonicalJSON(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(v: unknown, depth: number): string {
    if (depth > 32) throw new Error("Chain value exceeds maximum depth");
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== "object" || !v) throw new Error("Non-JSON chain value");
    if (ancestors.has(v)) throw new Error("Cyclic chain value");
    if (Object.getOwnPropertySymbols(v).length)
      throw new Error("Non-JSON chain keys");
    ancestors.add(v);
    try {
      if (Array.isArray(v)) {
        const values: string[] = [];
        for (let i = 0; i < v.length; i++) {
          const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (!d || !("value" in d))
            throw new Error("Sparse or accessor chain array");
          values.push(encode(d.value, depth + 1));
        }
        return `[${values.join(",")}]`;
      }
      if (
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        throw new Error("Non-plain chain object");
      const fields: string[] = [];
      for (const key of Object.keys(v).sort()) {
        const d = Object.getOwnPropertyDescriptor(v, key)!;
        if (!("value" in d)) throw new Error("Accessor chain object");
        if (d.value !== undefined)
          fields.push(`${JSON.stringify(key)}:${encode(d.value, depth + 1)}`);
      }
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(v);
    }
  }
  return encode(value, 0);
}

export function jsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonicalJSON(value));
}

/** Native async hashing; never silently substitute a weaker checksum. */
export async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ChainHash> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Tick verification requires Web Crypto in a secure context",
    );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function normalizeIntents(intents: StampedIntent[]): StampedIntent[] {
  if (!Array.isArray(intents) || intents.length > MAX_BLOCK_INTENTS)
    throw new Error("Too many block intents");
  const bytes = jsonBytes(intents);
  if (bytes.byteLength > MAX_BLOCK_BYTES - 256)
    throw new Error("Block exceeds byte limit");
  const cloned = JSON.parse(new TextDecoder().decode(bytes));
  const parsed = StampedIntentSchema.array().parse(cloned);
  if (canonicalJSON(parsed) !== canonicalJSON(cloned))
    throw new Error("Unsupported intent fields");
  return parsed;
}

export async function hashGenesis(genesis: TickGenesis): Promise<ChainHash> {
  const cloned = JSON.parse(canonicalJSON(genesis));
  TickGenesisSchema.parse(cloned);
  return sha256(jsonBytes(["simplefront/genesis/v1", cloned]));
}

export async function sealTick(
  previous: ChainCursor,
  intents: StampedIntent[],
): Promise<TickBlock> {
  const prior = ChainCursorSchema.parse(previous);
  const tick = prior.tick + 1;
  if (tick >= Number.MAX_SAFE_INTEGER)
    throw new Error("Tick counter exhausted");
  const normalized = normalizeIntents(intents);
  const chainHash = await sha256(
    jsonBytes(["simplefront/tick/v1", prior.chainHash, tick, normalized]),
  );
  return {
    tick,
    previousHash: prior.chainHash,
    intents: normalized,
    chainHash,
  };
}

export async function verifyTick(
  previous: ChainCursor,
  block: TickBlock,
): Promise<void> {
  const bytes = jsonBytes(block);
  if (bytes.byteLength > MAX_BLOCK_BYTES)
    throw new Error("Block exceeds byte limit");
  const cloned = JSON.parse(new TextDecoder().decode(bytes));
  const parsed = TickBlockSchema.parse(cloned);
  if (canonicalJSON(parsed) !== canonicalJSON(cloned))
    throw new Error("Unsupported block fields");
  if (
    parsed.tick !== previous.tick + 1 ||
    parsed.previousHash !== previous.chainHash
  )
    throw new Error("Tick chain discontinuity");
  const expected = await sealTick(previous, parsed.intents);
  if (expected.chainHash !== parsed.chainHash)
    throw new Error(`Tick hash mismatch at ${parsed.tick}`);
}
