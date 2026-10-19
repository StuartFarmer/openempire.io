import { z } from "zod";
import {
  DEFAULT_CONFIG,
  validateConfig,
  type GrowthConfig,
} from "../development/CityDevelopmentConfig";
import {
  GameStartInfoSchema,
  IntentSchema,
  StampedIntentSchema,
} from "../Schemas";

export const CHAIN_PROTOCOL = "simplefront-tick-chain-v1" as const;
export const MAX_BLOCK_BYTES = 64 * 1024;
export const MAX_BLOCK_INTENTS = 256;
export const MAX_HISTORY_BYTES = 256 * 1024 * 1024;
export const MAX_RANGE_BYTES = 1024 * 1024;
export const MAX_RANGE_BLOCKS = 256;
export const ChainHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export type ChainHash = string;
const tick = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const sequence = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
export const ChainCursorSchema = z
  .object({ tick: tick.or(z.literal(-1)), chainHash: ChainHashSchema })
  .strict();
export type ChainCursor = z.infer<typeof ChainCursorSchema>;
const growth = z.custom<GrowthConfig>((value) => {
  try {
    validateConfig(value as GrowthConfig);
    return (
      Object.keys(value as object).length ===
        Object.keys(DEFAULT_CONFIG).length &&
      Object.keys(value as object).every((key) =>
        Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
      )
    );
  } catch {
    return false;
  }
}, "Invalid growth configuration");
export const TickGenesisSchema = z
  .object({
    protocol: z.literal(CHAIN_PROTOCOL),
    simulationBuild: ChainHashSchema,
    ruleset: z.literal("simplefront"),
    gameStartInfo: GameStartInfoSchema,
    cityDevelopment: growth.nullable(),
    /** Existing diagnostic serialization observes this order, unlike canonical hashing. */
    cityDevelopmentOrder: z.string().array(),
    tickMilliseconds: z.literal(100),
    initialization: z.enum(["normal", "ambient"]),
    assets: z
      .object({
        map: ChainHashSchema,
        minimap: ChainHashSchema,
        layers: ChainHashSchema,
        manifest: ChainHashSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((genesis, context) => {
    const keys = Object.keys(genesis.cityDevelopment ?? {});
    if (
      genesis.cityDevelopmentOrder.length !== keys.length ||
      new Set(genesis.cityDevelopmentOrder).size !== keys.length ||
      genesis.cityDevelopmentOrder.some((key) => !keys.includes(key))
    )
      context.addIssue({
        code: "custom",
        message: "Invalid development property order",
      });
  });
export type TickGenesis = z.infer<typeof TickGenesisSchema>;
export const TickBlockSchema = z
  .object({
    tick,
    previousHash: ChainHashSchema,
    intents: StampedIntentSchema.array().max(MAX_BLOCK_INTENTS),
    chainHash: ChainHashSchema,
  })
  .strict();
export type TickBlock = z.infer<typeof TickBlockSchema>;
export const StateCheckpointSchema = z
  .object({
    tick,
    phase: z.literal("post-economy-pre-water-healing-v1"),
    algorithm: z.literal("legacy-simplefront-state-v1"),
    stateHash: z.number(),
  })
  .strict();
export type StateCheckpoint = z.infer<typeof StateCheckpointSchema>;
export const TickChainRecordSchema = z
  .object({
    format: z.literal(CHAIN_PROTOCOL),
    genesis: TickGenesisSchema,
    genesisHash: ChainHashSchema,
    blocks: TickBlockSchema.array(),
    appliedThrough: ChainCursorSchema,
    stateCheckpoints: StateCheckpointSchema.array(),
  })
  .strict();
export type TickChainRecord = z.infer<typeof TickChainRecordSchema>;

export const ChainServerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("chain_start"),
      genesis: TickGenesisSchema,
      genesisHash: ChainHashSchema,
      head: ChainCursorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("chain_blocks"),
      requestID: sequence.nullable(),
      blocks: TickBlockSchema.array().max(MAX_RANGE_BLOCKS),
      head: ChainCursorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("chain_resume"),
      requestID: sequence,
      after: ChainCursorSchema,
      head: ChainCursorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("chain_rebuild"),
      requestID: sequence,
      head: ChainCursorSchema,
    })
    .strict(),
  z.object({ type: z.literal("chain_command_ack"), sequence, tick }).strict(),
  z
    .object({
      type: z.literal("chain_command_rejected"),
      sequence,
      code: z.enum(["invalid-command", "admission-limit"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("chain_stop"),
      code: z.enum([
        "incompatible",
        "history-unavailable",
        "recovery-failed",
        "resource-limit",
      ]),
      message: z.string().max(1024),
    })
    .strict(),
]);
export type ChainServerMessage = z.infer<typeof ChainServerMessageSchema>;
export const ChainClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("chain_hello"),
      protocol: z.literal(CHAIN_PROTOCOL),
      simulationBuild: ChainHashSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("chain_ack"), appliedThrough: ChainCursorSchema })
    .strict(),
  z
    .object({
      type: z.literal("chain_rejoin"),
      requestID: sequence,
      appliedThrough: ChainCursorSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("chain_range"),
      requestID: sequence,
      fromTick: tick,
      throughTick: tick,
    })
    .strict(),
  z
    .object({ type: z.literal("chain_intent"), sequence, intent: IntentSchema })
    .strict(),
]);
export type ChainClientMessage = z.infer<typeof ChainClientMessageSchema>;
